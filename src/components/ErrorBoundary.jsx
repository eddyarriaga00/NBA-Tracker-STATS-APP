import { Component } from 'react';

/** Catches render errors so one broken section never blanks the whole app. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    // Clear the error when the user navigates somewhere else.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error, info) {
    console.error('Render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-2xl bg-card px-6 py-10 text-center">
        <div className="text-[16px] font-semibold">Something went wrong on this page</div>
        <p className="mt-1 text-[13px] text-label-2">The rest of the app still works. Try again or go back.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white"
          >
            Try Again
          </button>
          <button onClick={() => window.history.back()} className="rounded-full bg-fill px-4 py-1.5 text-[14px] font-semibold">
            Go Back
          </button>
        </div>
      </div>
    );
  }
}
