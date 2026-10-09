/**
 * On-screen diagnostics for native builds. NOT part of normal builds: it only
 * runs when the app was built with VITE_DEBUG_OVERLAY=true (the iOS workflow's
 * `debug_overlay` input, off by default).
 *
 * Exists because the iOS WebView can't be inspected from a Windows machine, so
 * "sign-in bounces back to the sign-in screen" had no client-side evidence at
 * all. It shows a small log panel with: console output, uncaught errors,
 * fetch calls (method, path, status, timing, response header NAMES), page
 * navigation/unload events, cookie NAMES, and changes in Clerk's own state
 * (loaded, client id, sign-in id/status, sessions, user).
 *
 * Privacy: never logs cookie values, header values, request/response bodies,
 * tokens, or URL query strings.
 */

type AnyRecord = Record<string, unknown>;
const win = (): AnyRecord => window as unknown as AnyRecord;

const MAX_LINES = 400;

export function installDebugOverlay(): void {
  if (typeof window === "undefined" || win().__ttDebugOverlay) return;
  win().__ttDebugOverlay = true;

  const lines: string[] = [];
  const t0 = Date.now();
  let panel: HTMLDivElement | null = null;
  let body: HTMLPreElement | null = null;
  let collapsed = false;

  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6, " ");

  function render() {
    if (!body) return;
    body.textContent = lines.join("\n");
    body.scrollTop = body.scrollHeight;
  }

  function log(message: string) {
    lines.push(`${stamp()} ${message}`.slice(0, 400));
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    render();
  }

  const safe = (value: unknown): string => {
    try {
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      if (typeof value === "string") return value;
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const cleanUrl = (input: unknown): string => {
    try {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request)?.url;
      const url = new URL(raw, window.location.href);
      const host = url.host === window.location.host ? "" : url.host;
      return `${host}${url.pathname}`.replace(/^trailteam\.app/, "");
    } catch {
      return "(unparseable url)";
    }
  };

  const cookieNames = (): string => {
    try {
      const names = document.cookie
        .split(";")
        .map((c) => c.split("=")[0].trim())
        .filter(Boolean);
      return names.length ? names.join(",") : "(none)";
    } catch {
      return "(unreadable)";
    }
  };

  // --- console + uncaught errors -------------------------------------------
  for (const level of ["log", "info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      log(`console.${level}: ${args.map(safe).join(" ")}`);
      original(...args);
    };
  }
  window.addEventListener("error", (e) => log(`window.error: ${e.message} @${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => log(`unhandledrejection: ${safe(e.reason)}`));

  // --- fetch ---------------------------------------------------------------
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    const label = `${method} ${cleanUrl(input)}`;
    const started = Date.now();
    try {
      const response = await originalFetch(input, init);
      let headerNames = "";
      try {
        const names: string[] = [];
        response.headers.forEach((_value, name) => names.push(name));
        const interesting = names.filter((n) => /cookie|authorization|clerk/i.test(n));
        headerNames = interesting.length ? ` hdrs[${interesting.join(",")}]` : "";
      } catch {
        // ignore
      }
      log(`fetch ${label} -> ${response.status} ${Date.now() - started}ms${headerNames}`);
      return response;
    } catch (error) {
      log(`fetch ${label} -> FAILED ${safe(error)} ${Date.now() - started}ms`);
      throw error;
    }
  };

  // --- navigation / lifecycle ---------------------------------------------
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
      log(`history.${method} -> ${url ? cleanUrl(String(url)) : "(same)"}`);
      original(data, unused, url);
    };
  }
  window.addEventListener("popstate", () => log(`popstate -> ${window.location.pathname}`));
  window.addEventListener("pagehide", () => log("pagehide (page unloading)"));
  window.addEventListener("beforeunload", () => log("beforeunload"));
  document.addEventListener("visibilitychange", () => log(`visibility: ${document.visibilityState}`));
  log(`boot origin=${window.location.origin} path=${window.location.pathname} cookies=${cookieNames()}`);

  // --- Clerk state changes -------------------------------------------------
  let lastClerk = "";
  window.setInterval(() => {
    const clerk = win().Clerk as AnyRecord | undefined;
    let snapshot: string;
    if (!clerk) {
      snapshot = "Clerk: not on window";
    } else {
      const client = clerk.client as AnyRecord | undefined;
      const signIn = client?.signIn as AnyRecord | undefined;
      const signUp = client?.signUp as AnyRecord | undefined;
      const sessions = (client?.sessions as unknown[] | undefined)?.length;
      snapshot =
        `Clerk loaded=${clerk.loaded} client=${client ? String(client.id).slice(-6) : "none"}` +
        ` signIn=${signIn?.id ? `${String(signIn.id).slice(-6)}:${signIn.status}` : "none"}` +
        ` signUp=${signUp?.id ? `${String(signUp.id).slice(-6)}:${signUp.status}` : "none"}` +
        ` sessions=${sessions ?? "n/a"} user=${clerk.user ? "yes" : "no"}` +
        ` cookies=${cookieNames()}`;
    }
    if (snapshot !== lastClerk) {
      lastClerk = snapshot;
      log(snapshot);
    }
  }, 500);

  // --- panel ---------------------------------------------------------------
  function mount() {
    panel = document.createElement("div");
    panel.setAttribute("data-debug-overlay", "true");
    panel.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.86);" +
      "color:#9fe;font:10px/1.3 ui-monospace,Menlo,monospace;padding-bottom:env(safe-area-inset-bottom);";

    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:6px;padding:4px 6px;background:#123;color:#fff;";
    const title = document.createElement("span");
    title.textContent = "TT debug";
    title.style.flex = "1";
    bar.appendChild(title);

    const button = (text: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.style.cssText = "background:#345;color:#fff;border:0;border-radius:4px;padding:6px 10px;font:inherit;";
      b.addEventListener("click", onClick);
      bar.appendChild(b);
    };
    button("Hide/Show", () => {
      collapsed = !collapsed;
      if (body) body.style.display = collapsed ? "none" : "block";
    });
    button("Clear", () => {
      lines.length = 0;
      render();
    });
    button("Copy", () => {
      void navigator.clipboard?.writeText(lines.join("\n")).then(
        () => log("copied to clipboard"),
        () => log("copy failed"),
      );
    });

    body = document.createElement("pre");
    body.style.cssText = "margin:0;padding:4px 6px;max-height:38vh;overflow:auto;white-space:pre-wrap;word-break:break-all;";

    panel.append(bar, body);
    document.body.appendChild(panel);
    render();
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
}
