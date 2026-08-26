import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.trailtribemtb.trailtribe",
  appName: "TrailTeam",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: {
    // Native release builds use the bundled Vite output. A dev server can be
    // supplied without changing source code via CAP_SERVER_URL.
    url: process.env.CAP_SERVER_URL,
    cleartext: process.env.CAP_CLEAR_TEXT === "true",
    allowNavigation: ["trailtribemtb.com", "*.clerk.accounts.dev", "*.clerk.com"],
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