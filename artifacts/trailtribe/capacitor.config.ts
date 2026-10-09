import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.trailteam.trailteam",
  appName: "TrailTeam",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: {
    // Native release builds use the bundled Vite output. A dev server can be
    // supplied without changing source code via CAP_SERVER_URL.
    url: process.env.CAP_SERVER_URL,
    cleartext: process.env.CAP_CLEAR_TEXT === "true",
    hostname: "app.trailteam.app",
    androidScheme: "https",
    // Capacitor's iOS default is the "capacitor" scheme, which makes the iOS
    // WebView's origin "capacitor://app.trailteam.app" — different from
    // Android's "https://app.trailteam.app" above. The API server's CORS
    // allowlist (artifacts/api-server/src/app.ts, PRODUCTION_ORIGINS) only
    // contains "https://app.trailteam.app", so every fetch from the iOS app
    // (including Clerk's own sign-in/sign-up calls through the proxy) was
    // being CORS-blocked — the request goes out, but the browser refuses to
    // hand the response to JS, so Clerk's client sees it as a failed
    // sign-in attempt and the UI just falls back to the sign-in screen with
    // no visible error. A non-https scheme is also not a "secure context",
    // which can itself break cookie-based session storage. Matching
    // Android's https scheme here fixes both at once, with no backend
    // change needed.
    iosScheme: "https",
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