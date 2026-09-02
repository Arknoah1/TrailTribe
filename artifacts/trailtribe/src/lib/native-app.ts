import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { Preferences } from "@capacitor/preferences";
import { PushNotifications, type ActionPerformed, type Token } from "@capacitor/push-notifications";
import { StatusBar, Style } from "@capacitor/status-bar";
import { useAuth, useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { useEffect } from "react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const PENDING_LINK_KEY = "trailtribe.pending-link";
const PUSH_TOKEN_KEY = "trailtribe.push-token";
const API_BASE = `${(import.meta.env.VITE_API_ORIGIN ?? BASE_URL).replace(/\/$/, "")}/api`;

function appRoute(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl, "https://trailteam.app");
    if (url.origin !== "https://trailteam.app") return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    const normalized = path.replace(/^\/+/, "/");
    const knownRoute = /^\/(events\/\d+(?:\?focus=volunteer)?|messages(?:\/thread\/\d+)?(?:\?tab=(?:events|pod|announcements))?|carpools(?:\/\d+)?|volunteer|family-invite\/[^/]+|rider-invite\/[^/]+|join\/[^/]+|dashboard|calendar|profile(?:\?tab=family)?|admin|onboarding|reenroll|sign-in|sign-up)(?:[/?#]|$)/;
    return knownRoute.test(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

async function savePendingLink(route: string) {
  await Preferences.set({ key: PENDING_LINK_KEY, value: route });
}

async function takePendingLink(): Promise<string | null> {
  const { value } = await Preferences.get({ key: PENDING_LINK_KEY });
  await Preferences.remove({ key: PENDING_LINK_KEY });
  return value;
}

export function NativeAppBridge() {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { isSignedIn, user } = useUser();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    const routeOrQueue = async (rawUrl: string | null | undefined) => {
      const route = appRoute(rawUrl);
      if (!route || disposed) return;
      await savePendingLink(route);
      if (!disposed) setLocation(route);
    };

    const listeners = [
      App.addListener("appUrlOpen", ({ url }) => void routeOrQueue(url)),
      App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack && window.history.length > 1) window.history.back();
        else setLocation("/dashboard");
      }),
      PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
        const data = action.notification.data as { link?: string; url?: string } | undefined;
        void routeOrQueue(data?.link ?? data?.url);
      }),
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive && isSignedIn) {
          void takePendingLink().then((route) => route && setLocation(route));
        }
      }),
      Keyboard.addListener("keyboardWillShow", () => document.body.classList.add("keyboard-open")),
      Keyboard.addListener("keyboardWillHide", () => document.body.classList.remove("keyboard-open")),
    ];

    void App.getLaunchUrl().then((launch) => routeOrQueue(launch?.url));
    void StatusBar.setOverlaysWebView({ overlay: true });
    void StatusBar.setStyle({ style: Style.Dark });

    return () => {
      disposed = true;
      void Promise.all(listeners.map((listener) => listener.then((handle) => handle.remove())));
      document.body.classList.remove("keyboard-open");
    };
  }, [isSignedIn, setLocation]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isSignedIn) return;
    void takePendingLink().then((route) => route && setLocation(route));
  }, [isSignedIn, setLocation]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isSignedIn || !user) return;
    let cancelled = false;

    const registerPush = async () => {
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") {
        permission = await PushNotifications.requestPermissions();
      }
      if (permission.receive !== "granted" || cancelled) return;

      await PushNotifications.register();
    };

    const tokenListener = PushNotifications.addListener("registration", (token: Token) => {
      void syncPushToken(token, getToken);
    });
    const errorListener = PushNotifications.addListener("registrationError", (error) => {
      console.warn("[TrailTeam] push registration failed", error);
    });
    void registerPush().catch((error) => console.warn("[TrailTeam] push setup failed", error));

    return () => {
      cancelled = true;
      void tokenListener.then((handle) => handle.remove());
      void errorListener.then((handle) => handle.remove());
    };
  }, [getToken, isSignedIn, user]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || isSignedIn) return;
    void getStoredPushToken().then(async (token) => {
      if (!token) return;
      const authToken = await getToken();
      await fetch(`${API_BASE}/push-devices/${encodeURIComponent(token)}`, {
        method: "DELETE",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      }).catch(() => {});
      await Preferences.remove({ key: PUSH_TOKEN_KEY });
    });
  }, [getToken, isSignedIn]);

  return null;
}

async function getStoredPushToken() {
  return (await Preferences.get({ key: PUSH_TOKEN_KEY })).value;
}

async function syncPushToken(token: Token, getToken: () => Promise<string | null>) {
  const authToken = await getToken();
  if (!authToken) return;
  const platform = Capacitor.getPlatform();
  if (platform !== "ios" && platform !== "android") return;
  await Preferences.set({ key: PUSH_TOKEN_KEY, value: token.value });
  await fetch(`${API_BASE}/push-devices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ token: token.value, platform }),
  });
}

export { appRoute };