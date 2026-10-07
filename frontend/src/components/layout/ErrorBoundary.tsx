
import React from 'react';

/**
 * THE ONLY THING THAT STOPS ONE BROKEN SCREEN FROM TAKING THE PLATFORM DOWN.
 *
 * React has exactly one rule about an exception thrown during render: it
 * unmounts the tree from the nearest error boundary upward, and if there is no
 * boundary at all, "the nearest" is the ROOT. There were none in this app.
 * Measured, on the real screen, by forcing one tab's render to throw:
 *
 *     healthy screen   1737 characters
 *     one tab throws      1 character      <- sidebar, header, every module
 *
 * Not the tab going blank. The APPLICATION going blank, needing a reload,
 * because of a bad shape in one API answer on one tab nobody else was using.
 *
 * It lives beside Header and Sidebar because it is shell furniture: App.tsx
 * wraps every module in one, so a module I do not own cannot take mine down
 * and mine cannot take theirs. It adds nothing to their files.
 *
 * WHAT IT DOES NOT CATCH, so nobody expects more of it than it gives: errors
 * thrown inside an event handler, a rejected promise, or a setTimeout
 * callback. React never sees those, so they never reach a boundary - and they
 * are already survivable for that same reason, because nothing is being
 * unmounted. This is for render, effects and constructors, which are the ones
 * that take the tree with them.
 */

type Props = {
  children: React.ReactNode;
  /** What broke, in the user's own words - "Strategies", "Knowledge & RAG". */
  what: string;
  /**
   * Change this and the boundary forgets the error and tries again. Pass the
   * tab or view key: WITHOUT IT a boundary stays broken after you navigate
   * away, because the boundary itself never unmounts - only its children do -
   * so one caught error would follow you onto screens that were working.
   */
  resetKey?: string;
};

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // KEPT IN THE CONSOLE ON PURPOSE. A boundary that swallows the stack turns
    // a five-minute fix into an afternoon of guessing, and the probes read the
    // console to tell a caught error apart from a screen that never rendered.
    console.error(`[${this.props.what}] render failed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-2xl border border-red-500/40 bg-slate-900 px-4 py-4 shadow-xl">
        <h3 className="text-sm font-bold text-red-200">
          {this.props.what} could not be shown
        </h3>
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
          Something in this screen failed while it was being drawn. The rest of
          the platform is unaffected — the other tabs and modules still work,
          so you can carry on and come back to this one.
        </p>
        <p className="text-[11px] text-slate-500 mt-2 font-mono break-all">
          {this.state.error.message || String(this.state.error)}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs
                     text-slate-300 hover:bg-slate-800"
        >
          Try again
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
