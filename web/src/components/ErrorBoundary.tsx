import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    // TanStack Router uses throw for redirects — these are not Error instances.
    // Do not catch them; let them propagate normally.
    if (!(error instanceof Error)) {
      throw error;
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Only log actual errors, not router redirects
    if (!(error instanceof Error)) return;
    // TODO: integrate a production error reporter here (e.g. Sentry, Datadog)
    // Example: errorReporter.captureException(error, { extra: info })
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4 p-8">
            <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">Please refresh the page to try again.</p>
            <button type="button" className="text-sm text-primary underline" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
