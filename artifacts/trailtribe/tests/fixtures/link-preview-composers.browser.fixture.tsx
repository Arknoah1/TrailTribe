import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";
import Messages from "../../src/pages/messages";
import BoardThread from "../../src/pages/board-thread";
import "../../src/index.css";

type SubmittedThread = { title: string; body: string } | null;
type SubmittedReply = { body: string } | null;

declare global {
  interface Window {
    submittedThread: SubmittedThread;
    submittedReply: SubmittedReply;
  }
}

window.submittedThread = null;
window.submittedReply = null;

const me = {
  id: 1,
  householdId: null,
  firstName: "Alex",
  lastName: "Rider",
  email: "alex@example.com",
  phone: null,
  role: "parent",
  podId: null,
  avatarUrl: null,
  isActive: true,
  gender: null,
  grade: null,
  coachCertLevel: null,
  notificationsEnabled: true,
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: false,
  defaultCarpoolSeats: null,
  defaultCarpoolTrays: null,
  notificationPreferences: null,
  createdAt: "2026-08-26T08:00:00.000Z",
};

const thread = {
  id: 42,
  title: "Saturday ride plan",
  body: "Meet at the north trailhead",
  authorUserId: 1,
  isPinned: false,
  isLocked: false,
  replyCount: 0,
  createdAt: "2026-08-26T08:00:00.000Z",
  updatedAt: "2026-08-26T08:00:00.000Z",
  author: {
    id: 1,
    firstName: "Alex",
    lastName: "Rider",
    avatarUrl: null,
  },
  event: null,
  reactions: {},
  permissions: {
    canPin: false,
    canDelete: false,
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requestBody(init?: RequestInit) {
  return typeof init?.body === "string" ? JSON.parse(init.body) : {};
}

window.fetch = async (input, init) => {
  const requestUrl = new URL(
    typeof input === "string" ? input : input instanceof Request ? input.url : String(input),
    window.location.origin,
  );
  const method = init?.method?.toUpperCase() ?? "GET";

  if (requestUrl.pathname === "/api/users/me") return jsonResponse(me);
  if (requestUrl.pathname === "/api/pods") return jsonResponse([]);
  if (requestUrl.pathname === "/api/board/unread-count") return jsonResponse({ count: 0 });
  if (requestUrl.pathname === "/api/board/seen" && method === "POST") return new Response(null, { status: 204 });
  if (requestUrl.pathname === "/api/board/threads" && method === "GET") return jsonResponse([]);
  if (requestUrl.pathname === "/api/broadcasts") return jsonResponse([]);
  if (requestUrl.pathname === "/api/board/threads" && method === "POST") {
    window.submittedThread = await requestBody(init);
    return jsonResponse({ ...thread, ...window.submittedThread, id: 43 });
  }
  if (requestUrl.pathname === "/api/board/threads/42") return jsonResponse(thread);
  if (requestUrl.pathname === "/api/board/threads/42/posts" && method === "GET") return jsonResponse([]);
  if (requestUrl.pathname === "/api/board/threads/42/posts" && method === "POST") {
    window.submittedReply = await requestBody(init);
    return jsonResponse({
      id: 8,
      threadId: 42,
      authorUserId: 1,
      body: window.submittedReply?.body ?? "",
      isDeleted: false,
      createdAt: "2026-08-26T10:00:00.000Z",
      author: thread.author,
      reactions: {},
      permissions: { canDelete: true },
    });
  }
  if (requestUrl.pathname === "/api/board/link-preview") {
    const url = requestUrl.searchParams.get("url") ?? "";
    if (url.includes("fails.example")) return jsonResponse({ message: "Metadata unavailable" }, 502);
    if (url.includes("first.example")) {
      await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 650));
      return jsonResponse({
        url,
        hostname: "first.example",
        siteName: "First Trail",
        title: "Old trail preview",
        description: "This delayed response must not replace a newer URL.",
        imageUrl: null,
      });
    }
    if (url.includes("second.example")) {
      return jsonResponse({
        url,
        hostname: "second.example",
        siteName: "Second Trail",
        title: "Current trail preview",
        description: "The current URL metadata.",
        imageUrl: null,
      });
    }
  }

  return jsonResponse({ message: `Unexpected fixture request: ${method} ${requestUrl.pathname}` }, 404);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Infinity },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <Router>
      <Route path="/messages" component={Messages} />
      <Route path="/messages/thread/:id" component={BoardThread} />
    </Router>
  </QueryClientProvider>,
);