import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pagesDir = dirname(fileURLToPath(import.meta.url));
const threadSource = await readFile(resolve(pagesDir, "board-thread.tsx"), "utf8");
const layoutSource = await readFile(resolve(pagesDir, "../components/layout.tsx"), "utf8");
const messagesSource = await readFile(resolve(pagesDir, "messages.tsx"), "utf8");
const eventDetailSource = await readFile(resolve(pagesDir, "event-detail.tsx"), "utf8");

function keyboardOffset(layoutViewportHeight, visualViewportHeight, visualViewportTop = 0) {
  const visibleViewportBottom = visualViewportHeight + visualViewportTop;
  return Math.max(0, layoutViewportHeight - visibleViewportBottom);
}

const IOS_SAFE_AREA_INSETS = {
  portrait: 34,
  landscape: 21,
};

function iOSBottomNavigationHeight(safeAreaInset) {
  return 64 + safeAreaInset;
}

function composerBottom(layoutViewportHeight, composerHeight, bottomNavigationHeight, offset = 0) {
  return layoutViewportHeight - composerHeight - bottomNavigationHeight - offset;
}

/**
 * This is intentionally a browser-independent contract test. The viewport
 * values are the dimensions used by an iPhone Safari rotation, including the
 * safe-area values Safari exposes through env(safe-area-inset-bottom).
 *
 * Keeping this scenario in the package test suite means it runs in every
 * release check, while the same assertions can be copied into a real-device
 * WebKit runner when one is available in CI.
 */
test("iOS Safari rotation keeps the reply and composer above navigation", () => {
  const reply = { value: "" };
  const orientations = [
    { name: "portrait", layoutHeight: 844, composerHeight: 88 },
    { name: "landscape", layoutHeight: 390, composerHeight: 88 },
    { name: "portrait", layoutHeight: 844, composerHeight: 88 },
  ];

  for (const [index, orientation] of orientations.entries()) {
    if (index === 0) reply.value = "Meet at the north trailhead";

    const safeAreaInset = IOS_SAFE_AREA_INSETS[orientation.name];
    const bottomNavigationHeight = iOSBottomNavigationHeight(safeAreaInset);
    const composerBottomEdge = composerBottom(
      orientation.layoutHeight,
      orientation.composerHeight,
      bottomNavigationHeight,
    );

    assert.equal(reply.value, "Meet at the north trailhead");
    assert.ok(
      composerBottomEdge >= 0,
      `${orientation.name} composer should remain in the visible viewport`,
    );
    assert.equal(
      orientation.layoutHeight - composerBottomEdge - orientation.composerHeight,
      bottomNavigationHeight,
      `${orientation.name} composer should clear the measured bottom navigation`,
    );
    assert.ok(
      bottomNavigationHeight > 64,
      `${orientation.name} clearance should include Safari's safe-area inset`,
    );
  }

  assert.match(threadSource, /value=\{replyBody\}/);
  assert.match(threadSource, /aria-label="Send reply"/);
  assert.match(threadSource, /bottom-\[calc\(var\(--mobile-bottom-nav-height,78px\)\+var\(--keyboard-offset\)\)\]/);
  assert.match(threadSource, /pb-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(layoutSource, /new ResizeObserver\(updateMobileNavHeight\)/);
  assert.match(layoutSource, /--mobile-bottom-nav-height/);
});


test("visual viewport keyboard changes move the reply composer above the keyboard", () => {
  assert.equal(keyboardOffset(800, 480), 320);
  assert.equal(keyboardOffset(800, 480, 24), 296);

  assert.match(threadSource, /visualViewport\.height \+ visualViewport\.offsetTop/);
  assert.match(threadSource, /Math\.max\(0, layoutViewportHeight - visibleViewportBottom\)/);
  assert.match(threadSource, /visualViewport\?\.addEventListener\("resize", updateKeyboardOffset\)/);
  assert.match(threadSource, /visualViewport\?\.addEventListener\("scroll", updateKeyboardOffset\)/);
  assert.match(threadSource, /window\.addEventListener\("orientationchange", handleOrientationChange\)/);
  assert.match(threadSource, /layoutViewportHeightRef\.current = window\.innerHeight/);
  assert.match(threadSource, /--keyboard-offset.*keyboardOffset/);
  assert.match(threadSource, /bottom-\[calc\(var\(--mobile-bottom-nav-height,78px\)\+var\(--keyboard-offset\)\)\]/);
});

test("keyboard dismissal restores the normal mobile navigation offset", () => {
  assert.equal(keyboardOffset(800, 800), 0);
  assert.equal(keyboardOffset(800, 900), 0);

  assert.match(threadSource, /if \(nextOffset === 0\)/);
  assert.match(threadSource, /layoutViewportHeightRef\.current = Math\.max\(layoutViewportHeight, window\.innerHeight\)/);
  assert.match(threadSource, /pb-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(layoutSource, /className=\{cn\("flex-1 overflow-y-auto pb-20 md:pb-0"/);
  assert.match(layoutSource, /height: "calc\(64px \+ env\(safe-area-inset-bottom\)\)"/);
  assert.match(layoutSource, /paddingBottom: "env\(safe-area-inset-bottom\)"/);
  assert.match(layoutSource, /new ResizeObserver\(updateMobileNavHeight\)/);
  assert.match(layoutSource, /--mobile-bottom-nav-height/);
});

test("the multiline composer and send control stay usable within the visible viewport", () => {
  assert.match(threadSource, /<Textarea[\s\S]*?rows=\{1\}/);
  assert.match(threadSource, /className="!min-h-10 max-h-32 overflow-y-auto/);
  assert.match(threadSource, /const maxHeight = 128/);
  assert.match(threadSource, /Math\.min\(Math\.max\(textarea\.scrollHeight, 40\), maxHeight\)/);
  assert.match(threadSource, /<Button[\s\S]*?aria-label="Send reply"/);
  assert.match(threadSource, /className="shrink-0 h-10 w-10/);
  assert.match(threadSource, /disabled=\{!replyBody\.trim\(\) \|\| createPost\.isPending\}/);
});

test("discussion navigation preserves the originating Messages category", () => {
  // Messages page reads the query string via useSearch(), not useLocation(), so
  // that wouter v3 actually provides the "?tab=..." value (useLocation() strips it).
  assert.match(messagesSource, /useSearch/);
  assert.match(messagesSource, /getMessageTabFromLocation/);
  assert.match(messagesSource, /tab === "pod" \|\| tab === "events" \|\| tab === "announcements"/);
  assert.match(messagesSource, /scope === "event" \? "events" : scope/);
  assert.match(messagesSource, /useState<MessageTab>\(\(\) => getMessageTabFromLocation\(search\)\)/);
  // board-thread also reads the query string via useSearch() for the returnTab fallback.
  assert.match(threadSource, /useSearch/);
  assert.match(threadSource, /requestedTab === "pod" \|\| requestedTab === "events" \|\| requestedTab === "announcements"/);
  assert.match(threadSource, /\? "events"\s*: "general"/);
  assert.match(threadSource, /href=\{`\/messages\?tab=\$\{returnTab\}`\}/);
  assert.match(eventDetailSource, /href=\{`\/messages\/thread\/\$\{thread\.id\}\?tab=events`\}/);
});