import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(resolve(here, relativePath), "utf8");

const [app, recoveryUi, carpools, profile, clientFetch, routePerformance, skeletons, layout, admin, roster, messages] = await Promise.all([
  readSource("../App.tsx"),
  readSource("../components/network-status.tsx"),
  readSource("carpools.tsx"),
  readSource("profile.tsx"),
  readFile(resolve(here, "../../../../lib/api-client-react/src/custom-fetch.ts"), "utf8"),
  readSource("../lib/route-performance.ts"),
  readSource("../components/route-skeletons.tsx"),
  readSource("../components/layout.tsx"),
  readSource("admin.tsx"),
  readSource("roster.tsx"),
  readSource("messages.tsx"),
]);

test("Android-style offline and online events refetch active queries without reloading", () => {
  const browser = new EventTarget();
  const lifecycle = [];
  let refetches = 0;
  const onOffline = () => lifecycle.push("offline");
  const onOnline = () => lifecycle.push("online");
  const cleanup = (eventTarget, refetchActiveQueries, offline, online) => {
    const markOffline = () => offline();
    const markOnline = () => {
      refetchActiveQueries();
      online();
    };
    eventTarget.addEventListener("offline", markOffline);
    eventTarget.addEventListener("online", markOnline);
    return () => {
      eventTarget.removeEventListener("offline", markOffline);
      eventTarget.removeEventListener("online", markOnline);
    };
  };

  const removeListeners = cleanup(browser, () => { refetches += 1; }, onOffline, onOnline);
  browser.dispatchEvent(new Event("offline"));
  browser.dispatchEvent(new Event("online"));

  assert.deepEqual(lifecycle, ["offline", "online"]);
  assert.equal(refetches, 1);

  removeListeners();
  browser.dispatchEvent(new Event("offline"));
  browser.dispatchEvent(new Event("online"));
  assert.deepEqual(lifecycle, ["offline", "online"]);
  assert.equal(refetches, 1);
  assert.match(recoveryUi, /subscribeToNetworkRecovery/);
});

test("mobile requests have a bounded deadline instead of loading forever", () => {
  assert.match(clientFetch, /DEFAULT_REQUEST_TIMEOUT_MS = 20_000/);
  assert.match(clientFetch, /export async function fetchWithTimeout/);
  assert.match(clientFetch, /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
  assert.match(clientFetch, /API_REQUEST_SLOW_MS = 1_000/);
  assert.match(clientFetch, /\[TrailTeam API\]/);
  assert.match(clientFetch, /path: performancePath\(resolveUrl\(input\)\)/);
});

test("a restored connection refreshes visible screen data", () => {
  assert.match(recoveryUi, /eventTarget\.addEventListener\("offline", markOffline\)/);
  assert.match(recoveryUi, /eventTarget\.addEventListener\("online", markOnline\)/);
  assert.match(recoveryUi, /queryClient\.refetchQueries\(\{ type: "active" \}\)/);
});

test("expired sessions are not retried as ordinary loading failures", () => {
  assert.match(app, /retry: \(failureCount, error\)/);
  assert.match(app, /status !== 401 && failureCount < 1/);
  assert.match(app, /function SessionExpiryHandler/);
  assert.match(app, /signOut\(\{ redirectUrl: `\$\{basePath\}\/sign-in` \}\)/);
});

test("carpool and household sections expose a recoverable failure state", () => {
  assert.match(carpools, /isError: offersError/);
  assert.match(carpools, /feature="ride requests"/);
  assert.match(carpools, /feature="ride offers"/);
  assert.match(profile, /const \[ridersError, setRidersError\]/);
  assert.match(profile, /const \[complianceError, setComplianceError\]/);
  assert.match(profile, /feature="your household"/);
  assert.match(profile, /feature="your riders"/);
  assert.match(profile, /feature="season documents"/);
});

test("carpool ride actions stack on phones and return to an inline row on wider screens", () => {
  assert.match(carpools, /<div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row">\s*<Button className="w-full sm:w-auto" onClick=\{\(\) => \{/);
  assert.match(carpools, /<Plus className="h-4 w-4 mr-2" \/> Request a Ride<\/Button>/);
  assert.match(carpools, /<Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" \/> Offer a Ride<\/Button>/);
});

test("long carpool driver, pickup, and rider details wrap within phone-width cards", () => {
  for (const card of [
    'className={cn("min-w-0 max-w-full overflow-hidden", isMatched',
    'className={cn("min-w-0 max-w-full overflow-hidden", offer.isOverCapacity',
  ]) {
    assert.ok(carpools.includes(card), `carpool card should shrink within its grid: ${card}`);
  }

  for (const field of [
    /<CardTitle className="min-w-0 break-words text-lg \[overflow-wrap:anywhere\]">\s*\{request\.rider\?\.firstName\}/,
    /<CardTitle className="min-w-0 break-words text-lg \[overflow-wrap:anywhere\]">\s*\{offer\.driver\?\.firstName\}/,
    /<span className="min-w-0 break-words \[overflow-wrap:anywhere\]">\{offer\.departureLocation\}<\/span>/,
    /<span className="min-w-0 flex-1 break-words font-medium \[overflow-wrap:anywhere\]">\{claim\.rider\?\.firstName\}/,
  ]) {
    assert.match(carpools, field, `long carpool text should wrap safely: ${field}`);
  }

  assert.match(carpools, /flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1 text-sm/);
});

test("coach and admin mobile routes expose retryable connection-drop states", () => {
  for (const [route, source, feature] of [
    ["/admin", admin, "the admin dashboard"],
    ["/roster", roster, "the roster"],
    ["/messages", messages, "threads"],
  ]) {
    assert.match(app, new RegExp(`path="${route}"`), `${route} must remain a protected route`);
    assert.match(source, /LoadErrorCard/, `${route} should use the shared recoverable error state`);
    assert.match(source, new RegExp(`feature="${feature}"`), `${route} should identify the failed feature`);
    assert.match(source, /onRetry=/, `${route} should expose a retry action`);
    assert.doesNotMatch(source, /window\.location\.reload|location\.reload/, `${route} must recover without a full reload`);
  }
  assert.match(recoveryUi, /queryClient\.refetchQueries\(\{ type: "active" \}\)/);
});

test("community board actions stay within the viewport for both action sets", () => {
  assert.match(messages, /<div className="w-full min-w-0 max-w-4xl/);
  assert.match(messages, /<div className="flex min-w-0 flex-col md:flex-row/);
  assert.match(messages, /<div className="min-w-0">\s*<h1[^>]+break-words/);
  assert.match(messages, /<div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row md:w-auto">/);
  assert.match(messages, /isCoachOrAdmin && \(/);
  assert.match(messages, /activeTab !== "events" && activeTab !== "announcements"/);
  assert.equal(
    (messages.match(/w-full min-w-0 max-w-full border-2 border-\[#0a0c10\] sm:w-auto/g) ?? []).length,
    2,
    "broadcast and thread actions should both use contained responsive widths",
  );
});

test("mobile routes report real browser timing marks against Android targets", () => {
  assert.match(routePerformance, /ANDROID_CHROME_TARGETS_MS/);
  assert.match(routePerformance, /"first-useful-content": 1_500/);
  assert.match(routePerformance, /interactive: 3_000/);
  assert.match(routePerformance, /performance\.measure/);
  assert.match(routePerformance, /withinTarget/);
});

test("slow routes show mobile-sized structure and preload likely navigation targets", () => {
  assert.match(skeletons, /export function CalendarSkeleton/);
  assert.match(skeletons, /export function EventDetailSkeleton/);
  assert.match(skeletons, /export function CarpoolBoardSkeleton/);
  assert.match(skeletons, /export function ProfileSkeleton/);
  assert.match(layout, /onPointerEnter=\{\(\) => preloadRoute\(item\.preloadHref \?\? item\.href\)\}/);
  assert.match(profile, /setTimeout\(\(\) => setLoadCalendarFeed\(true\), 700\)/);
});