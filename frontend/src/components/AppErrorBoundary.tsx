import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[app-render-error]", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="app-error-boundary" role="alert">
        <div className="app-error-boundary-card">
          <p className="prio-label">Something went wrong</p>
          <h1>We lost our place.</h1>
          <p>Try again, or return to the home page and continue from there.</p>
          <div className="app-error-boundary-actions">
            <button onClick={() => this.setState({ hasError: false })} type="button">Try again</button>
            <button onClick={() => window.location.assign("/")} type="button">Go home</button>
          </div>
        </div>
      </main>
    );
  }
}
