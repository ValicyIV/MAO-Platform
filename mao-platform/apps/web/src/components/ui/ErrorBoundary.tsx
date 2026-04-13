// ErrorBoundary.tsx — Catches rendering errors and shows a fallback UI
// instead of crashing the entire app with a white screen.

import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
          <span className="text-3xl">⚠️</span>
          <p className="text-sm text-neutral-300">Something went wrong rendering this view.</p>
          {this.state.error && (
            <pre className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 max-w-lg overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <Button variant="primary" size="md" onClick={this.handleReset}>
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
