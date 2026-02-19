import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'

// Minimal Node-server som hanterar Google OAuth + kalenderhämtning för frontend.
function loadEnvFile(filePath) {
  if (!fsSync.existsSync(filePath)) return
  const raw = fsSync.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(path.join(process.cwd(), '.env.server'))

// Runtime-konfiguration (dev-defaults används om env saknas).
const PORT = Number(process.env.CALENDAR_SERVER_PORT || 8787)
const HOST = process.env.CALENDAR_SERVER_HOST || '127.0.0.1'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api/google-calendar/auth/callback`
const TOKEN_ENCRYPTION_SECRET = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || ''

const OAUTH_SESSION_COOKIE = 'gc_oauth_session'
const CONNECTION_COOKIE = 'gc_connection'
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000

const STORE_PATH = path.join(process.cwd(), 'server', 'data', 'google-connections.json')
const oauthSessions = new Map()
let connectionStore = { connections: {} }

// Kräver att OAuth-konfiguration finns innan Google-rutter används.
function hasGoogleConfig() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && TOKEN_ENCRYPTION_SECRET)
}

// Deriverar 32-byte nyckel från hemlighet i env.
function encryptionKey() {
  if (!TOKEN_ENCRYPTION_SECRET) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY saknas.')
  }
  return crypto.createHash('sha256').update(TOKEN_ENCRYPTION_SECRET).digest()
}

// Krypterar text (refresh token) med AES-GCM.
function encryptText(plain) {
  const key = encryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

// Dekrypterar text som tidigare krypterats med encryptText.
function decryptText(payload) {
  const [ivB64, tagB64, encryptedB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Ogiltigt tokenformat.')
  }
  const key = encryptionKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const encrypted = Buffer.from(encryptedB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const out = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return out.toString('utf8')
}

// Slump-id för cookies/session/state.
function randomId(size = 32) {
  return crypto.randomBytes(size).toString('hex')
}

// Cookie-parser för inkommande request header.
function parseCookies(header) {
  if (!header) return {}
  return header.split(';').reduce((acc, part) => {
    const [k, ...rest] = part.trim().split('=')
    if (!k) return acc
    acc[k] = decodeURIComponent(rest.join('=') || '')
    return acc
  }, {})
}

// Lägg till Set-Cookie utan att skriva över redan satta cookies.
function appendSetCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie')
  if (!current) {
    res.setHeader('Set-Cookie', cookie)
    return
  }
  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookie])
    return
  }
  res.setHeader('Set-Cookie', [current, cookie])
}

// Serialiserar cookie med säkra standardflaggor.
function serializeCookie(name, value, { maxAgeSeconds, httpOnly = true } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
  ]
  if (httpOnly) parts.push('HttpOnly')
  if (maxAgeSeconds != null) parts.push(`Max-Age=${maxAgeSeconds}`)
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

function clearCookie(name) {
  return serializeCookie(name, '', { maxAgeSeconds: 0 })
}

// JSON-svarshjälpare.
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

// Enkel redirect-hjälpare.
function redirect(res, location) {
  res.writeHead(302, { Location: location })
  res.end()
}

// Tillåter redirect enbart tillbaka till frontend-origin.
function sanitizeReturnTo(returnToRaw) {
  if (!returnToRaw) return FRONTEND_ORIGIN
  try {
    const target = new URL(returnToRaw, FRONTEND_ORIGIN)
    if (target.origin !== FRONTEND_ORIGIN) return FRONTEND_ORIGIN
    return `${target.origin}${target.pathname}${target.search}${target.hash}`
  } catch {
    return FRONTEND_ORIGIN
  }
}

// Hjälpare för att sätta query-param i URL.
function appendQueryParam(url, key, value) {
  const u = new URL(url)
  u.searchParams.set(key, value)
  return u.toString()
}

// Städar utgångna OAuth state-sessions.
function cleanupExpiredOAuthSessions() {
  const now = Date.now()
  for (const [sessionId, state] of oauthSessions.entries()) {
    if (state.expiresAt <= now) oauthSessions.delete(sessionId)
  }
}

// Läser anslutningsdatabasen från disk (best effort).
async function loadConnectionStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.connections) {
      connectionStore = parsed
    }
  } catch {
    connectionStore = { connections: {} }
  }
}

// Skriver anslutningsdatabasen atomiskt via tempfil.
async function saveConnectionStore() {
  const dir = path.dirname(STORE_PATH)
  await fs.mkdir(dir, { recursive: true })
  const tempPath = `${STORE_PATH}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(connectionStore, null, 2), 'utf8')
  await fs.rename(tempPath, STORE_PATH)
}

function requireGoogleConfig(res) {
  if (hasGoogleConfig()) return true
  json(res, 500, {
    error:
      'Google OAuth är inte konfigurerat. Sätt GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET och GOOGLE_TOKEN_ENCRYPTION_KEY.',
  })
  return false
}

// POST helper för OAuth endpoints som använder form-encoded body.
async function postForm(url, formData) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(formData).toString(),
  })
  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  if (!response.ok) {
    const msg = data?.error_description || data?.error || response.statusText
    throw new Error(String(msg))
  }
  return data
}

// Exchange auth-code -> access/refresh token.
async function exchangeCodeForTokens(code) {
  return postForm('https://oauth2.googleapis.com/token', {
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  })
}

// Refresh flow: refresh token -> ny access token.
async function refreshAccessToken(refreshToken) {
  return postForm('https://oauth2.googleapis.com/token', {
    refresh_token: refreshToken,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  })
}

// Hämtar användarinfo för att visa anslutet konto i UI.
async function fetchUserInfo(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

// Parsar YYYY-MM-DD till lokalt datum.
function parseDateOnly(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '')
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (![y, mo, d].every(Number.isFinite)) return null
  return new Date(y, mo - 1, d, 0, 0, 0, 0)
}

// Normaliserar Google event-format till appens eventschema.
function normalizeGoogleEvent(item, category = 'Google') {
  if (!item || item.status === 'cancelled') return null
  let start = null
  let end = null
  const isAllDay = Boolean(item.start?.date && item.end?.date)

  if (item.start?.dateTime) {
    start = new Date(item.start.dateTime)
  } else if (item.start?.date) {
    start = parseDateOnly(item.start.date)
  }

  if (item.end?.dateTime) {
    end = new Date(item.end.dateTime)
  } else if (item.end?.date) {
    end = parseDateOnly(item.end.date)
  }

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null
  }

  if (end <= start) {
    end = new Date(start.getTime() + 60 * 60 * 1000)
  }

  return {
    title: item.summary || 'Google-bokning',
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: isAllDay,
    category,
  }
}

// Returnerar veckointervall [måndag, måndag+7d), antingen från query eller aktuell vecka.
function getWeekRange(weekStartRaw) {
  const fromQuery = parseDateOnly(String(weekStartRaw || ''))
  let start = fromQuery
  if (!start) {
    const now = new Date()
    const dayIndexFromMonday = (now.getDay() + 6) % 7
    start = new Date(now)
    start.setDate(start.getDate() - dayIndexFromMonday)
    start.setHours(0, 0, 0, 0)
  }
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

// Hämtar events från användarens valda Google-kalendrar för en viss vecka.
async function fetchGoogleEvents(accessToken, weekStartRaw) {
  const { start, end } = getWeekRange(weekStartRaw)
  const warnings = []
  const events = []

  const googleGetJson = async (urlObj) => {
    // Intern helper med gemensam felhantering för Google API-svar.
    const response = await fetch(urlObj, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) {
      const txt = await response.text()
      throw new Error(`Google API fel (${response.status}): ${txt.slice(0, 140)}`)
    }
    return response.json()
  }

  // Hämta kalendrar användaren har valda i Google Calendar (inte bara primary).
  const calendars = []
  let calendarPageToken = null
  for (let page = 0; page < 10; page++) {
    const listUrl = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList')
    listUrl.searchParams.set('maxResults', '250')
    if (calendarPageToken) listUrl.searchParams.set('pageToken', calendarPageToken)
    const data = await googleGetJson(listUrl)
    for (const cal of data.items || []) {
      if (cal.selected === false) continue
      if (cal.accessRole === 'none') continue
      if (!cal.id) continue
      calendars.push({
        id: cal.id,
        summary: cal.summary || 'Google',
      })
    }
    calendarPageToken = data.nextPageToken || null
    if (!calendarPageToken) break
  }

  if (calendars.length === 0) {
    warnings.push('Inga valda Google-kalendrar hittades för kontot.')
    return { events, warnings }
  }

  const calendarsToFetch = calendars.slice(0, 20)
  if (calendars.length > calendarsToFetch.length) {
    warnings.push('Många kalendrar hittades; bara de första 20 synkades.')
  }

  // Hämta events kalender för kalender, paginerat.
  for (const cal of calendarsToFetch) {
    let pageToken = null
    let pages = 0
    while (pages < 10) {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`
      )
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('timeMin', start.toISOString())
      url.searchParams.set('timeMax', end.toISOString())
      url.searchParams.set('maxResults', '2500')
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const data = await googleGetJson(url)
      for (const item of data.items || []) {
        const category =
          cal.summary && cal.summary.toLowerCase() !== 'primary'
            ? `Google: ${cal.summary}`
            : 'Google'
        const normalized = normalizeGoogleEvent(item, category)
        if (normalized) events.push(normalized)
      }
      pageToken = data.nextPageToken || null
      pages += 1
      if (!pageToken) break
    }
    if (pageToken) {
      warnings.push(`Alla events kunde inte hämtas för kalendern "${cal.summary}".`)
    }
  }

  return { events, warnings }
}

async function handleAuthStart(req, res, urlObj) {
  if (!requireGoogleConfig(res)) return
  cleanupExpiredOAuthSessions()
  const cookies = parseCookies(req.headers.cookie)
  let sessionId = cookies[OAUTH_SESSION_COOKIE]
  if (!sessionId) {
    sessionId = randomId(16)
    appendSetCookie(
      res,
      serializeCookie(OAUTH_SESSION_COOKIE, sessionId, {
        maxAgeSeconds: Math.floor(OAUTH_SESSION_TTL_MS / 1000),
      })
    )
  }

  const state = randomId(16)
  const returnTo = sanitizeReturnTo(urlObj.searchParams.get('returnTo'))
  oauthSessions.set(sessionId, {
    state,
    returnTo,
    expiresAt: Date.now() + OAUTH_SESSION_TTL_MS,
  })

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid email https://www.googleapis.com/auth/calendar.readonly')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('include_granted_scopes', 'true')
  authUrl.searchParams.set('state', state)

  redirect(res, authUrl.toString())
}

// OAuth callback: verifierar state, sparar krypterad refresh token och sätter cookie.
async function handleAuthCallback(req, res, urlObj) {
  if (!requireGoogleConfig(res)) return
  const cookies = parseCookies(req.headers.cookie)
  const sessionId = cookies[OAUTH_SESSION_COOKIE]
  const session = sessionId ? oauthSessions.get(sessionId) : null

  if (!session) {
    redirect(res, appendQueryParam(FRONTEND_ORIGIN, 'google_oauth', 'error'))
    return
  }

  oauthSessions.delete(sessionId)

  const error = urlObj.searchParams.get('error')
  if (error) {
    redirect(res, appendQueryParam(session.returnTo, 'google_oauth', 'error'))
    return
  }

  const state = urlObj.searchParams.get('state')
  const code = urlObj.searchParams.get('code')
  if (!state || !code || state !== session.state) {
    redirect(res, appendQueryParam(session.returnTo, 'google_oauth', 'error'))
    return
  }

  try {
    const tokenData = await exchangeCodeForTokens(code)
    let refreshToken = tokenData.refresh_token || null

    const currentConnectionId = cookies[CONNECTION_COOKIE]
    const existing = currentConnectionId
      ? connectionStore.connections[currentConnectionId]
      : null
    if (!refreshToken && existing?.refreshTokenEncrypted) {
      refreshToken = decryptText(existing.refreshTokenEncrypted)
    }
    if (!refreshToken) {
      throw new Error('Ingen refresh token mottogs från Google. Godkänn åtkomst igen.')
    }

    const userInfo = tokenData.access_token
      ? await fetchUserInfo(tokenData.access_token)
      : null
    const email = userInfo?.email || existing?.email || null

    const connectionId = currentConnectionId && existing ? currentConnectionId : randomId(16)
    connectionStore.connections[connectionId] = {
      id: connectionId,
      email,
      refreshTokenEncrypted: encryptText(refreshToken),
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    }
    await saveConnectionStore()

    appendSetCookie(
      res,
      serializeCookie(CONNECTION_COOKIE, connectionId, {
        maxAgeSeconds: 60 * 60 * 24 * 365,
      })
    )
    redirect(res, appendQueryParam(session.returnTo, 'google_oauth', 'success'))
  } catch {
    redirect(res, appendQueryParam(session.returnTo, 'google_oauth', 'error'))
  }
}

// Hämtar aktiv anslutning baserat på cookie.
function getConnectionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie)
  const connectionId = cookies[CONNECTION_COOKIE]
  if (!connectionId) return null
  const connection = connectionStore.connections[connectionId]
  if (!connection) return null
  return { connectionId, connection }
}

// Returnerar om användaren är ansluten till Google och ev. e-postadress.
async function handleAuthStatus(req, res) {
  const found = getConnectionFromRequest(req)
  if (!found) {
    json(res, 200, { connected: false, email: null })
    return
  }
  json(res, 200, {
    connected: true,
    email: found.connection.email || null,
  })
}

// Kopplar från konto: revoker token (best effort), rensar lagring och cookie.
async function handleAuthDisconnect(req, res) {
  if (!requireGoogleConfig(res)) return
  const found = getConnectionFromRequest(req)
  if (found) {
    try {
      const refreshToken = decryptText(found.connection.refreshTokenEncrypted)
      await postForm('https://oauth2.googleapis.com/revoke', { token: refreshToken })
    } catch {
      // best effort revoke
    }
    delete connectionStore.connections[found.connectionId]
    await saveConnectionStore()
  }
  appendSetCookie(res, clearCookie(CONNECTION_COOKIE))
  json(res, 200, { connected: false })
}

// Hämtar Google events för vecka för den anslutna användaren.
async function handleGoogleEvents(req, res, urlObj) {
  if (!requireGoogleConfig(res)) return
  const found = getConnectionFromRequest(req)
  if (!found) {
    json(res, 401, { error: 'Inte ansluten till Google Calendar.' })
    return
  }

  try {
    const refreshToken = decryptText(found.connection.refreshTokenEncrypted)
    const tokenData = await refreshAccessToken(refreshToken)
    const accessToken = tokenData.access_token
    if (!accessToken) {
      throw new Error('Kunde inte få access token från Google.')
    }
    const { events, warnings } = await fetchGoogleEvents(
      accessToken,
      urlObj.searchParams.get('weekStart')
    )
    json(res, 200, { events, warnings })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/invalid_grant/i.test(message)) {
      delete connectionStore.connections[found.connectionId]
      await saveConnectionStore()
      appendSetCookie(res, clearCookie(CONNECTION_COOKIE))
      json(res, 401, {
        error: 'Google-anslutningen har gått ut. Anslut kalendern igen.',
      })
      return
    }
    json(res, 500, { error: `Google-import misslyckades: ${message}` })
  }
}

// Enkel CORS-policy begränsad till frontend-origin.
function applyCors(req, res) {
  const origin = req.headers.origin
  if (origin && origin === FRONTEND_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  }
}

// Startar HTTP-server och routar API-endpoints.
async function startServer() {
  await loadConnectionStore()

  const server = http.createServer(async (req, res) => {
    try {
      applyCors(req, res)
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const urlObj = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`)
      const pathname = urlObj.pathname

      // OAuth start/callback/status/disconnect + events endpoint.
      if (req.method === 'GET' && pathname === '/api/google-calendar/auth/start') {
        await handleAuthStart(req, res, urlObj)
        return
      }
      if (req.method === 'GET' && pathname === '/api/google-calendar/auth/callback') {
        await handleAuthCallback(req, res, urlObj)
        return
      }
      if (req.method === 'GET' && pathname === '/api/google-calendar/auth/status') {
        await handleAuthStatus(req, res)
        return
      }
      if (req.method === 'POST' && pathname === '/api/google-calendar/auth/disconnect') {
        await handleAuthDisconnect(req, res)
        return
      }
      if (req.method === 'GET' && pathname === '/api/google-calendar/events') {
        await handleGoogleEvents(req, res, urlObj)
        return
      }

      json(res, 404, { error: 'Not found' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      json(res, 500, { error: `Serverfel: ${message}` })
    }
  })

  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[google-calendar-proxy] Listening on http://${HOST}:${PORT} (frontend: ${FRONTEND_ORIGIN})`
    )
  })
}

// Global startup-fångst för fel vid boot.
startServer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[google-calendar-proxy] failed to start', err)
  process.exit(1)
})
