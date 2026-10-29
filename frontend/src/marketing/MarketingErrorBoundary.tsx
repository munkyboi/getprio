import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@vendor/components/ui/button";
export default class MarketingErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[app-render-error]", error, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return <main className="marketing-page" role="alert"><h1>We lost our place.</h1><p>Try again, or return to the home page and continue from there.</p><div className="marketing-actions"><Button onClick={() => window.location.reload()}>Try again</Button><Button variant="outline" render={<a href="/" />}>Go home</Button></div></main>;
  }
}
