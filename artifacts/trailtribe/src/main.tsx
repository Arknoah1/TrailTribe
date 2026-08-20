import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

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
createRoot(document.getElementById("root")!).render(<App />);
