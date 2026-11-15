import { Component, type ReactNode } from 'react';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="page">
          <h1>We couldn’t display this page.</h1>
          <p>
            No successful payment or stock change is implied by this error. Reload, then review the
            server’s latest state before retrying a change.
          </p>
          <button className="button primary" onClick={() => window.location.reload()}>
            Reload Orvexa
          </button>
        </main>
      );
    return this.props.children;
  }
}
