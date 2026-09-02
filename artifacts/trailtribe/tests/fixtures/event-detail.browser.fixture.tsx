import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";
import EventDetail from "../../src/pages/event-detail";
import "../../src/index.css";

const largeCounts = new URLSearchParams(window.location.search).get("counts") === "large";

const event = {
  id: 42,
  title: "Saturday Ridge Practice",
  description: "Authenticated event detail fixture",
  eventType: "race",
  startTime: "2026-09-05T15:00:00.000Z",
  endTime: "2026-09-05T18:00:00.000Z",
  locationOverride: "North Trailhead",
  googleMapsUrlOverride: null,
  trailheadId: null,
  trailhead: null,
  isAllTeam: true,
  podId: null,
  podIds: [],
  attachments: [],
  volunteerTasksEnabled: true,
  volunteerCount: largeCounts ? 987654321 : 8,
  carpoolSpotsAvailable: largeCounts ? 987654321 : 4,
  householdMemberRsvps: {},
  rsvpCounts: {
    attending: 8,
    maybe: 1,
    notAttending: 0,
    coachesGoing: 2,
    ridersGoing: 6,
    coachesMaybe: 0,
    ridersMaybe: 1,
    coachesNotAttending: 0,
    ridersNotAttending: 0,
  },
};

const me = {
  id: 7,
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

window.fetch = async (input) => {
  const requestUrl = new URL(
    typeof input === "string" ? input : input instanceof Request ? input.url : String(input),
    window.location.origin,
  );

  if (requestUrl.pathname === "/api/events/42") return jsonResponse(event);
  if (requestUrl.pathname === "/api/users/me") return jsonResponse(me);
  if (requestUrl.pathname === "/api/trailheads") return jsonResponse([]);
  if (requestUrl.pathname === "/api/pods") return jsonResponse([]);
  if (requestUrl.pathname === "/api/events/42/tasks") return jsonResponse([]);
  if (requestUrl.pathname === "/api/events/42/rsvps") return jsonResponse([]);
  if (requestUrl.pathname === "/api/board/threads") return jsonResponse([]);
  return jsonResponse({ message: `Unexpected fixture request: ${requestUrl.pathname}` }, 404);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Infinity },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <Router>
      <Route path="/events/:id" component={EventDetail} />
    </Router>
  </QueryClientProvider>,
);