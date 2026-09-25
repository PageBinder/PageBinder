import React from 'react'

interface State {
  error: Error | null
}

/** Keeps a renderer exception from blanking the window: shows what happened and offers to continue. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    void window.pagebinder.log(`render error: ${error.stack ?? error.message}\n${info.componentStack ?? ''}`)
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="crash">
          <h2>Something went wrong in the window</h2>
          <p>Your notes are safe: every change was saved or held in a draft. The error was recorded in the settings folder as renderer-errors.log.</p>
          <pre>{this.state.error.stack ?? this.state.error.message}</pre>
          <button type="button" className="primary" onClick={() => this.setState({ error: null })}>
            Continue
          </button>
          <button type="button" onClick={() => window.location.reload()} style={{ marginLeft: 8 }}>
            Reload the window
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
