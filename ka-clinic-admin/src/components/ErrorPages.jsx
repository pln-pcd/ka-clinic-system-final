// Full-page fallbacks, centred in the main content area (sidebar and header
// stay visible when signed in):
//   <NotFoundPage>      404 for a URL that matches no page.
//   <PageErrorBoundary> 500 when a page crashes while rendering. The real
//                       error goes to the console only; users see plain text.
// Both share one layout: tinted icon circle, large code, title, one muted
// line, then two buttons (secondary left, primary right).
// These are fallbacks only: normal navigation never shows them.
import { Component } from 'react';
import { AlertTriangle, ArrowLeft, FileQuestion, Home, RotateCcw } from 'lucide-react';
import { BTN, BTN_ICON } from '../lib/buttons';

function ErrorPage({ icon: Icon, tone, code, title, text, secondary, primary }) {
  return (
    <div role="alert" className="min-h-full w-full flex items-center justify-center px-4 py-16 bg-[#F0F4FA]">
      <div className="w-full max-w-md text-center">
        <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${tone}`}>
          <Icon size={34} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <p className="mt-6 text-7xl font-extrabold tracking-tight text-[#0a1d47] leading-none tabular-nums">{code}</p>
        <h1 className="mt-4 text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">{text}</p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button type="button" onClick={secondary.onClick} className={BTN.outline}>
            <secondary.icon size={BTN_ICON} aria-hidden="true" /> {secondary.label}
          </button>
          <button type="button" onClick={primary.onClick} className={BTN.primary}>
            <primary.icon size={BTN_ICON} aria-hidden="true" /> {primary.label}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage({ onDashboard }) {
  // Back leaves the unknown URL; with nothing to go back to, go home.
  const back = () => (window.history.length > 1 ? window.history.back() : onDashboard());
  return (
    <ErrorPage
      icon={FileQuestion}
      tone="bg-indigo-100 text-[#3B50DF] ring-8 ring-indigo-50"
      code="404"
      title="Page not found"
      text="The page you're looking for doesn't exist or was moved."
      secondary={{ label: 'Back', icon: ArrowLeft, onClick: back }}
      primary={{ label: 'Go to Dashboard', icon: Home, onClick: onDashboard }}
    />
  );
}

// Catches a crash inside a page (render error, or its code failing to
// download) and shows the 500 page instead of unmounting the whole app.
// resetKey: the error clears when it changes (e.g. the active page).
// onReset: called by "Try again" before the page renders again (e.g. to let
// a failed lazy page download again). onDashboard: "Go to Dashboard".
export class PageErrorBoundary extends Component {
  state = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error, info) {
    console.error('[PageErrorBoundary] page crashed:', error, info?.componentStack);
  }

  tryAgain = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  goDashboard = () => {
    this.setState({ error: null });
    if (this.props.onDashboard) this.props.onDashboard();
    else window.location.assign('/');
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorPage
        icon={AlertTriangle}
        tone="bg-amber-100 text-amber-600 ring-8 ring-amber-50"
        code="500"
        title="Something went wrong"
        text="This page couldn't load. Try again or go back to the Dashboard."
        secondary={{ label: 'Go to Dashboard', icon: Home, onClick: this.goDashboard }}
        primary={{ label: 'Try again', icon: RotateCcw, onClick: this.tryAgain }}
      />
    );
  }
}
