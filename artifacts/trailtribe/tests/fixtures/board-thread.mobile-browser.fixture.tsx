import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";
import BoardThread from "../../src/pages/board-thread";
import "../../src/index.css";

const viewer = new URLSearchParams(window.location.search).get("viewer") ?? "author";
const isAuthor = viewer === "author";
const deletedReplyStorageKey = "trailteam-fixture-reply-deleted";

function isReplyDeleted() {
  return window.localStorage.getItem(deletedReplyStorageKey) === "true";
}

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

const me = {
  id: isAuthor ? 1 : 2,
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

window.fetch = async (input, init) => {
  const requestUrl = new URL(
    typeof input === "string" ? input : input instanceof Request ? input.url : String(input),
    window.location.origin,
  );
  const method = init?.method?.toUpperCase() ?? "GET";

  if (requestUrl.pathname === "/api/users/me") return jsonResponse(me);
  if (requestUrl.pathname === "/api/board/threads/42") return jsonResponse(thread);
  if (requestUrl.pathname === "/api/board/threads/42/posts") {
    const deleted = isReplyDeleted();
    return jsonResponse([{
      id: 7,
      threadId: 42,
      authorUserId: 1,
      body: deleted ? "" : "A private reply that should be redacted after deletion",
      isDeleted: deleted,
      createdAt: "2026-08-26T09:00:00.000Z",
      author: {
        id: 1,
        firstName: "Alex",
        lastName: "Rider",
        avatarUrl: null,
      },
      reactions: {},
      permissions: { canDelete: isAuthor },
    }]);
  }
  if (requestUrl.pathname === "/api/board/posts/7" && method === "DELETE") {
    if (!isAuthor) return jsonResponse({ error: "Forbidden" }, 403);
    window.localStorage.setItem(deletedReplyStorageKey, "true");
    return new Response(null, { status: 204 });
  }
  if (requestUrl.pathname === "/api/board/unread-count") return jsonResponse({ count: 0 });
  return jsonResponse({ message: `Unexpected fixture request: ${requestUrl.pathname}` }, 404);
};

const simulatedVisualViewport = new EventTarget() as EventTarget & {
  height: number;
  offsetTop: number;
};
simulatedVisualViewport.height = window.innerHeight;
simulatedVisualViewport.offsetTop = 0;
Object.defineProperty(window, "visualViewport", {
  configurable: true,
  value: simulatedVisualViewport,
});

(window as Window & { setSimulatedVisualViewport?: (height: number) => void }).setSimulatedVisualViewport = (
  height,
) => {
  simulatedVisualViewport.height = height;
  simulatedVisualViewport.dispatchEvent(new Event("resize"));
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Infinity },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <Router>
      <Route path="/messages/thread/:id" component={BoardThread} />
    </Router>
  </QueryClientProvider>,
);