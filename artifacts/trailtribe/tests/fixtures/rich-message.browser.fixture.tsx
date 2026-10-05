import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";
import Messages from "../../src/pages/messages";
import BoardThread from "../../src/pages/board-thread";
import NewBroadcast from "../../src/pages/new-broadcast";
import { Toaster } from "../../src/components/ui/toaster";
import "../../src/index.css";

declare global {
  interface Window { richSubmitted: Record<string, unknown>[]; }
}
window.richSubmitted = [];
const me = {
  id: 1, firstName: "Test", lastName: "Coach", role: "coach", roles: ["coach"],
  isActive: true, approved: true, podId: null, email: "test@example.invalid",
  notificationsEnabled: true, emailNotifications: true, notificationPreferences: {},
};
const author = { id: 1, firstName: "Test", lastName: "Coach", avatarUrl: null };
const thread = {
  id: 42, title: "Lap split results", body: "## Results\n\n| Rider | Lap 1 | Lap 2 |\n| --- | --- | --- |\n| Alex | 1:22 | 1:24 |",
  bodyFormat: "markdown", authorUserId: 1, author, isPinned: false, isLocked: false,
  replyCount: 0, createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z",
  reactions: {}, permissions: { canDelete: true, canPin: true }, imageObjectPaths: [],
};
let posts: unknown[] = [];
let broadcasts: unknown[] = [{
  id: 1, subject: "Legacy plain message", body: "**literal stars**\n<not HTML>", bodyFormat: "plain", sender: author,
  isAllTeam: true, channel: "email", createdAt: thread.createdAt, sentAt: thread.createdAt, emailConfigured: true,
  recipientCount: 1, deliveredCount: 1, failedCount: 0,
}, {
  id: 2, subject: "Older active broadcast", body: "Older active message", bodyFormat: "plain", sender: author,
  isAllTeam: true, channel: "email", createdAt: "2026-09-30T12:00:00Z", sentAt: "2026-09-30T12:00:00Z", archivedAt: null,
  emailConfigured: true, recipientCount: 1, deliveredCount: 1, failedCount: 0,
}, {
  id: 3, subject: "Newest active broadcast", body: "Newest active message", bodyFormat: "plain", sender: author,
  isAllTeam: true, channel: "email", createdAt: "2026-10-03T12:00:00Z", sentAt: "2026-10-03T12:00:00Z", archivedAt: null,
  emailConfigured: true, recipientCount: 1, deliveredCount: 1, failedCount: 0,
}, {
  id: 4, subject: "Older archived broadcast", body: "Older archived message", bodyFormat: "plain", sender: author,
  isAllTeam: true, channel: "email", createdAt: "2026-09-25T12:00:00Z", sentAt: "2026-09-25T12:00:00Z", archivedAt: "2026-10-01T12:00:00Z",
  emailConfigured: true, recipientCount: 1, deliveredCount: 1, failedCount: 0,
}, {
  id: 5, subject: "Newest archived broadcast", body: "Newest archived message", bodyFormat: "plain", sender: author,
  isAllTeam: true, channel: "email", createdAt: "2026-10-04T12:00:00Z", sentAt: "2026-10-04T12:00:00Z", archivedAt: "2026-10-05T12:00:00Z",
  emailConfigured: true, recipientCount: 1, deliveredCount: 1, failedCount: 0,
}];
const images = new Map<string, Blob>();
let sequence = 0;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : String(input), location.origin);
  const method = init?.method ?? "GET";
  const payload = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  if (url.pathname === "/api/users/me") return json(me);
  if (url.pathname === "/api/pods") return json([{ id: "pod1", name: "Trail Pod" }]);
  if (url.pathname.endsWith("/attachments/request-url")) {
    const scope = url.pathname.includes("/messages/") ? "broadcast" : "discussion";
    const objectPath = `/objects/${scope}-images/fixture-${++sequence}`;
    return json({ objectPath, uploadURL: `/fixture-upload${objectPath}` });
  }
  if (url.pathname.startsWith("/fixture-upload/") && method === "PUT") {
    await new Promise(resolve => setTimeout(resolve, 500));
    images.set(url.pathname.replace("/fixture-upload", ""), init?.body as Blob);
    return new Response(null, { status: 200 });
  }
  if (url.pathname.includes("/attachments/")) {
    const path = `/objects/${url.pathname.split("/attachments/")[1]}`;
    return images.has(path) ? new Response(images.get(path), { headers: { "Content-Type": images.get(path)!.type } }) : json({}, 404);
  }
  if (url.pathname === "/api/messages" && method === "GET") return json(broadcasts);
  if (url.pathname === "/api/messages" && method === "POST") {
    window.richSubmitted.push(payload);
    const broadcast = { ...payload, id: 2, sender: author, recipientCount: 1, deliveredCount: 1, failedCount: 0, emailConfigured: true, sentAt: thread.createdAt, createdAt: thread.createdAt };
    broadcasts = [...broadcasts, broadcast];
    return json(broadcast, 201);
  }
  if (url.pathname === "/api/board/seen") return new Response(null, { status: 204 });
  if (url.pathname === "/api/board/unread-count") return json({ count: 0 });
  if (url.pathname === "/api/board/threads" && method === "GET") return json([thread]);
  if (url.pathname === "/api/board/threads" && method === "POST") {
    window.richSubmitted.push(payload);
    return json({ ...thread, ...payload, id: 43 }, 201);
  }
  if (url.pathname === "/api/board/threads/42") return json(thread);
  if (url.pathname === "/api/board/threads/42/posts" && method === "GET") return json(posts);
  if (url.pathname === "/api/board/threads/42/posts" && method === "POST") {
    window.richSubmitted.push(payload);
    const post = { ...payload, id: 9, threadId: 42, authorUserId: 1, author, createdAt: thread.createdAt, isDeleted: false, reactions: {}, permissions: { canDelete: true } };
    posts = [...posts, post];
    return json(post, 201);
  }
  if (url.pathname === "/api/board/link-preview") return json({ url: url.searchParams.get("url"), title: "Safe link preview", hostname: "example.com", imageUrl: null });
  return json({ error: `Unexpected fixture request ${method} ${url.pathname}` }, 404);
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <Router>
      <Route path="/messages" component={Messages} />
      <Route path="/messages/new" component={NewBroadcast} />
      <Route path="/messages/thread/:id" component={BoardThread} />
    </Router>
    <Toaster />
  </QueryClientProvider>,
);