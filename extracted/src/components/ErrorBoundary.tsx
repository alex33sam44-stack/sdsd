import { Component, ErrorInfo, ReactNode } from "react";
import { withTranslation, WithTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { toUserMessage } from "@/lib/serviceError";
import i18n, { isRtl } from "@/i18n";

type Props = {
  children: ReactNode;
  /** Optional title shown above the message. */
  title?: string;
  /** Optional fallback renderer; receives the error and a reset callback. */
  fallback?: (error: unknown, reset: () => void) => ReactNode;
  /** Logical scope for log entries, e.g. "route:/admin/line". */
  scope?: string;
} & Partial<WithTranslation>;

type State = { error: unknown | null };

/**
 * Production-safe error boundary. Catches render-time errors anywhere in the
 * tree below it, logs once, and shows a localized fallback with a reset action.
 */
class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logger.error("react boundary caught", {
      scope: this.props.scope ?? "react.boundary",
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { value: String(error) },
      componentStack: info.componentStack,
    });
    // Report the raw Error directly to Sentry so the stack is preserved.
    captureException(error, {
      scope: this.props.scope ?? "react.boundary",
      componentStack: info.componentStack,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error == null) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);

    const t = this.props.t ?? ((k: string) => k);
    const dir = isRtl(i18n.language) ? "rtl" : "ltr";

    return (
      <div
        dir={dir}
        className="min-h-screen grid place-items-center px-6 text-center bg-background text-foreground"
      >
        <div className="max-w-md space-y-3">
          <p className="text-2xl font-black text-secondary">
            {this.props.title ?? t("errorBoundary.title")}
          </p>
          <p className="text-sm text-muted-foreground">{toUserMessage(this.state.error)}</p>
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={this.reset}
              className="rounded-md bg-secondary text-secondary-foreground px-4 py-2 text-sm font-bold"
            >
              {t("errorBoundary.retry")}
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="rounded-md border border-border px-4 py-2 text-sm font-bold"
            >
              {t("errorBoundary.home")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner) as unknown as React.ComponentType<Props>;
