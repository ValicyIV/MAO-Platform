// Catches render errors so the app does not stay blank. Surfaces React "minified error #N"
// with a link to https://react.dev/errors/N (full messages only in dev / with source maps).

import { Component, type ErrorInfo, type ReactNode } from "react";

function reactDocsUrl(message: string): string | null {
  const m = /#(\d+)/.exec(message);
  return m ? `https://react.dev/errors/${m[1]}` : null;
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[MAO UI] render error:", error.message, error.stack);
    console.error("[MAO UI] component stack:", info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const msg = error.message || String(error);
    const doc = reactDocsUrl(msg);

    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 font-sans">
        <h1 className="text-lg font-semibold text-red-400 mb-2">Something broke in the UI</h1>
        <p className="text-sm text-neutral-400 mb-4 max-w-xl">
          The message below is often minified in production builds. Use{" "}
          <code className="text-neutral-300 bg-neutral-900 px-1 rounded">pnpm dev</code> in{" "}
          <code className="text-neutral-300 bg-neutral-900 px-1 rounded">apps/web</code> for the full error, or open the browser console (F12).
        </p>
        <pre className="text-xs bg-neutral-900 border border-neutral-800 rounded p-4 overflow-auto max-w-3xl whitespace-pre-wrap text-neutral-300">
          {msg}
        </pre>
        {doc && (
          <p className="mt-4 text-sm">
            <a href={doc} className="text-blue-400 underline hover:text-blue-300" target="_blank" rel="noreferrer">
              Open React docs for this error code
            </a>
          </p>
        )}
      </div>
    );
  }
}
