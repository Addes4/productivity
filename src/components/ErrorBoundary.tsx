import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface State {
  hasError: boolean
  message: string
}

// Fångar synkrona renderingsfel och visar ett läsbart felmeddelande i stället för en tom sida.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error)
    return { hasError: true, message }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-rose-200 p-8 space-y-4">
            <h1 className="text-xl font-bold text-rose-700">Något gick fel</h1>
            <p className="text-sm text-slate-600">
              Ett oväntat fel inträffade. Om felet kvarstår kan du prova att rensa webbläsarens
              lokala data för appen.
            </p>
            {this.state.message && (
              <pre className="text-xs bg-slate-100 rounded-lg p-3 text-slate-700 overflow-auto max-h-40">
                {this.state.message}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 text-sm"
            >
              Försök igen
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
