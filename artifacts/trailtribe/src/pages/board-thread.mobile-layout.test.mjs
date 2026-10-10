import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getKeyboardInset } from "../lib/mobile-keyboard-layout.ts";
import { getReplyScrollTarget } from "../lib/board-reaction-link.ts";

const pagesDir = dirname(fileURLToPath(import.meta.url));
const threadSource = await readFile(resolve(pagesDir, "board-thread.tsx"), "utf8");
const editorSource = await readFile(resolve(pagesDir, "../components/rich-message-editor.tsx"), "utf8");
const layoutSource = await readFile(resolve(pagesDir, "../components/layout.tsx"), "utf8");
const messagesSource = await readFile(resolve(pagesDir, "messages.tsx"), "utf8");
const eventDetailSource = await readFile(resolve(pagesDir, "event-detail.tsx"), "utf8");

function keyboardOffset(layoutViewportHeight, visualViewportHeight, visualViewportTop = 0) {
  return getKeyboardInset(layoutViewportHeight, visualViewportHeight, visualViewportTop);
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
  assert.match(threadSource, /bottom-\[max\(var\(--mobile-bottom-nav-height,78px\),var\(--keyboard-offset\)\)\]/);
  assert.match(threadSource, /pb-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(layoutSource, /new ResizeObserver\(updateMobileNavHeight\)/);
  assert.match(layoutSource, /--mobile-bottom-nav-height/);
});


test("visual viewport keyboard changes move the reply composer above the keyboard", () => {
  assert.equal(keyboardOffset(800, 480), 320);
  assert.equal(keyboardOffset(800, 480, 24), 296);

  assert.match(threadSource, /visualViewport\?\.height \?\? window\.innerHeight/);
  assert.match(threadSource, /visualViewport\?\.offsetTop \?\? 0/);
  assert.match(threadSource, /getKeyboardInset\(/);
  assert.match(threadSource, /visualViewport\?\.addEventListener\("resize", updateKeyboardOffset\)/);
  assert.match(threadSource, /visualViewport\?\.addEventListener\("scroll", updateKeyboardOffset\)/);
  assert.match(threadSource, /window\.addEventListener\("orientationchange", handleOrientationChange\)/);
  assert.match(threadSource, /layoutViewportHeightRef\.current = window\.innerHeight/);
  assert.match(threadSource, /--keyboard-offset.*keyboardOffset/);
  assert.match(threadSource, /bottom-\[max\(var\(--mobile-bottom-nav-height,78px\),var\(--keyboard-offset\)\)\]/);
});

test("reply deep links open a visible reply and fall back to the thread when it is gone", () => {
  const posts = [
    { id: 42, isDeleted: false },
    { id: 43, isDeleted: true },
  ];

  assert.equal(getReplyScrollTarget(posts, "42"), "board-thread-post-42");
  assert.equal(getReplyScrollTarget(posts, "43"), "board-thread-starter");
  assert.equal(getReplyScrollTarget(posts, "999"), "board-thread-starter");
  assert.equal(getReplyScrollTarget(posts, "not-a-reply"), "board-thread-starter");
  assert.equal(getReplyScrollTarget(posts, null, "starter"), "board-thread-starter");
  assert.equal(getReplyScrollTarget(posts, null), null);

  assert.match(threadSource, /new URLSearchParams\(search\)\.get\("reply"\)/);
  assert.match(threadSource, /new URLSearchParams\(search\)\.get\("target"\)/);
  assert.match(threadSource, /getReplyScrollTarget\(posts, replyIdParam, replyTargetParam\)/);
  assert.match(threadSource, /id="board-thread-starter"/);
  assert.match(threadSource, /id=\{`board-thread-post-\$\{post\.id\}`\}/);
  assert.match(threadSource, /target\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
});

test("native keyboard events keep the composer above the iOS keyboard without double-counting viewport resize", () => {
  assert.equal(getKeyboardInset(800, 800, 0, 320), 320);
  assert.equal(getKeyboardInset(800, 480, 0, 0), 320);
  assert.equal(getKeyboardInset(800, 480, 24, 240), 296);
  assert.equal(getKeyboardInset(800, 480, 0, 320, 480), 0, "a resized Android layout already ends above the keyboard");
  const keyboardInset = getKeyboardInset(800, 480, 0, 0);
  const composerBottom = Math.max(78, keyboardInset);
  assert.equal(800 - composerBottom, 480, "the composer bottom should meet the keyboard top, not overlap it");

  assert.match(threadSource, /Keyboard\.addListener\("keyboardWillShow", \(\{ keyboardHeight \}\)/);
  assert.match(threadSource, /nativeKeyboardInset\.current = keyboardHeight/);
  assert.match(threadSource, /Keyboard\.addListener\("keyboardWillHide"/);
  assert.match(threadSource, /!composerHasFocus/);
  assert.match(threadSource, /bottom-\[max\(var\(--mobile-bottom-nav-height,78px\),var\(--keyboard-offset\)\)\]/);
});

test("the compact discussion toolbar stays in one row and omits the table action", () => {
  assert.doesNotMatch(editorSource, /Heading2/);
  assert.doesNotMatch(editorSource, /action:\s*"heading"/);
  assert.match(editorSource, /compact\s*\?\s*"flex flex-nowrap items-center gap-0\.5"\s*:\s*compactOnMobile\s*\?/);
  assert.match(editorSource, /"flex flex-nowrap items-center gap-0 sm:flex-wrap sm:gap-1"/);
  assert.match(editorSource, /\.filter\(\(\{ action \}\) => !compact \|\| action !== "table"\)/);
  assert.match(editorSource, /compact\s*\?\s*"h-9 w-9 shrink-0"\s*:\s*compactOnMobile\s*\?/);
  assert.match(editorSource, /"h-8 w-8 shrink-0 sm:h-9 sm:w-9 md:h-8 md:w-8"/);
  assert.match(editorSource, /aria-label=\{preview \? "Write message" : "Preview message"\}/);
  assert.match(editorSource, /action: "table", label: "Insert table"/);
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
  assert.match(threadSource, /<RichMessageEditor[\s\S]*?rows=\{1\}/);
  assert.match(threadSource, /className="!min-h-10 max-h-32 overflow-y-auto/);
  assert.match(threadSource, /const maxHeight = 128/);
  assert.match(threadSource, /Math\.min\(Math\.max\(textarea\.scrollHeight, 40\), maxHeight\)/);
  assert.match(threadSource, /<Button[\s\S]*?aria-label="Send reply"/);
  assert.match(threadSource, /className="shrink-0 h-10 w-10/);
  assert.match(threadSource, /disabled=\{!replyBody\.trim\(\) \|\| createPost\.isPending \|\| replyImagesUploading\}/);
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

test("thread and reply actions use server-provided permissions", () => {
  assert.match(threadSource, /const canDeleteThread = thread\?\.permissions\?\.canDelete === true;/);
  assert.match(threadSource, /const canPinThread = thread\?\.permissions\?\.canPin === true;/);
  // The actions menu is shown to every member (it holds "Report to coach");
  // pin and delete stay gated individually by the server-provided permissions.
  assert.match(threadSource, /<DropdownMenu>\s*<DropdownMenuTrigger asChild>/);
  assert.match(threadSource, /aria-label="Thread actions"/);
  assert.match(threadSource, /setReportDialogOpen\(true\)[^>]*>\s*<Flag[^>]*\/> Report to coach/);
  assert.match(threadSource, /\{canPinThread && \(\s*<DropdownMenuItem onClick=\{handlePin\}/);
  assert.match(threadSource, /\{canDeleteThread && \(\s*<DropdownMenuItem onClick=\{handleDeleteThread\}/);
  assert.match(threadSource, /const canDelete = post\.permissions\?\.canDelete === true;/);
  assert.doesNotMatch(threadSource, /const canDelete = isCoachOrAdmin \|\| post\.authorUserId === me\?\.id;/);
});

test("members can mute a single discussion without changing the global Board activity preference", async () => {
  const profileSource = await readFile(resolve(pagesDir, "profile.tsx"), "utf8");

  assert.match(threadSource, /useSetBoardThreadMute/);
  assert.match(threadSource, /aria-label=\{isThreadMuted \? "Unmute discussion alerts" : "Mute discussion alerts"\}/);
  assert.match(threadSource, /setThreadMute\.mutate\(\{ id, data: \{ muted: !isThreadMuted \} \}/);
  assert.match(threadSource, /mutedBoardDiscussionIds\?\.includes\(id\)/);
  assert.match(profileSource, /key: "boardReplies", label: "Board activity"/);
  assert.match(profileSource, /new discussions, replies, and reactions across the board/);
});

test("saved event discussion links explain access changes without exposing event details", () => {
  assert.match(threadSource, /EVENT_DISCUSSION_ACCESS_REVOKED/);
  assert.match(threadSource, /candidate\.status !== 403/);
  assert.match(threadSource, /data-testid="event-discussion-access-error"/);
  assert.match(
    threadSource,
    /This saved link no longer opens the event discussion because access has changed or been removed\./,
  );
  assert.match(threadSource, /href="\/messages\?tab=events"/);
  assert.match(threadSource, /refetchThread\(\)/);
});