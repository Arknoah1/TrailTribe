import { createRoot } from "react-dom/client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

type RootErrorBoundaryState = {
  error: Error | null;
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return [
      `Name: ${error.name || "Error"}`,
      `Message: ${error.message || "(no message)"}`,
      "Stack:",
      error.stack || "(no stack trace available)",
    ].join("\n");
  }

  return [
    "Name: Error",
    `Message: ${String(error)}`,
    "Stack:",
    "(no stack trace available)",
  ].join("\n");
}

class RootErrorBoundary extends Component<
  { children: ReactNode },
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Root render error", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            overflow: "auto",
            padding: "24px",
            background: "#111827",
            color: "#f9fafb",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        >
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {formatError(this.state.error)}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

setBaseUrl(Capacitor.isNativePlatform() ? import.meta.env.VITE_API_ORIGIN : undefined);
if (Capacitor.isNativePlatform() && import.meta.env.VITE_API_ORIGIN) {
  const apiOrigin = import.meta.env.VITE_API_ORIGIN.replace(/\/$/, "");
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith("/api")) {
      input = `${apiOrigin}${input}`;
    } else if (input instanceof Request && input.url.startsWith(window.location.origin)) {
      const requestUrl = new URL(input.url);
      if (requestUrl.pathname.startsWith("/api")) {
        input = new Request(`${apiOrigin}${requestUrl.pathname}${requestUrl.search}`, input);
      }
    }
    return nativeFetch(input, init);
  };
}

const rootElement = document.getElementById("root");
try {
  createRoot(rootElement!).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>,
  );
} catch (error) {
  if (rootElement) {
    rootElement.textContent = formatError(error);
  }
}
