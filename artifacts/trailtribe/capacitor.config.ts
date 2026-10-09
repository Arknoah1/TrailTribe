import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.trailteam.trailteam",
  appName: "TrailTeam",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: {
    // Native release builds use the bundled Vite output. A dev server can be
    // supplied without changing source code via CAP_SERVER_URL.
    url: process.env.CAP_SERVER_URL || undefined,
    cleartext: process.env.CAP_CLEAR_TEXT === "true",
    hostname: "app.trailteam.app",
    androidScheme: "https",
    // NOT also setting iosScheme: "https" here — it's a dead end. Apple's
    // WKWebView refuses to let a custom URLSchemeHandler register for a
    // scheme it already natively handles ("http"/"https" included), so
    // Capacitor's own config validation silently resets iosScheme back to
    // the default "capacitor" whenever it's set to "https" (confirmed in
    // @capacitor/ios's CAPInstanceDescriptor.swift, normalize()). iOS's
    // WebView origin is unavoidably "capacitor://app.trailteam.app" —
    // that's why it's explicitly allowlisted in the API server's CORS config
    // (artifacts/api-server/src/app.ts, PRODUCTION_ORIGINS) instead.
    allowNavigation: [
      "trailteam.app",
      "trailtribemtb.com",
      "*.trailtribemtb.com",
      "*.clerk.accounts.dev",
      "*.clerk.com",
    ],
  },
  plugins: {
    // iOS only (set by ios-testflight.yml via CAP_NATIVE_HTTP): route fetch/XHR
    // and document.cookie through Capacitor's native layer. On iOS the WebView's
    // origin is capacitor://app.trailteam.app, which is cross-site to the
    // https://trailteam.app Clerk proxy, so WKWebView's tracking prevention
    // refuses to store/send Clerk's client cookie and sign-in resets. Native
    // requests (NSURLSession + the shared cookie store) are not subject to
    // that. Off by default so Android — which works today — is unchanged.
    ...(process.env.CAP_NATIVE_HTTP === "true"
      ? {
          CapacitorHttp: { enabled: true },
          CapacitorCookies: { enabled: true },
        }
      : {}),
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#0f1117",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f1117",
      overlaysWebView: true,
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;