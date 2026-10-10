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
    // Keep the native WebView origin on the real published domain so OAuth
    // redirects can resolve and Android App Links can reopen the app.
    hostname: "trailteam.app",
    androidScheme: "https",
    // NOT also setting iosScheme: "https" here — it's a dead end. Apple's
    // WKWebView refuses to let a custom URLSchemeHandler register for a
    // scheme it already natively handles ("http"/"https" included), so
    // Capacitor's own config validation silently resets iosScheme back to
    // the default "capacitor" whenever it's set to "https" (confirmed in
    // @capacitor/ios's CAPInstanceDescriptor.swift, normalize()). iOS's
    // WebView origin is unavoidably "capacitor://trailteam.app" —
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
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#0f1117",
      showSpinner: false,
    },
    StatusBar: {
      // The native launch surface is dark, so use light icons before the web
      // app can apply the user's saved theme.
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