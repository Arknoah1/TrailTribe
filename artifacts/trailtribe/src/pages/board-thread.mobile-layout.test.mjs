import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pagesDir = dirname(fileURLToPath(import.meta.url));
const threadSource = await readFile(resolve(pagesDir, "board-thread.tsx"), "utf8");
const layoutSource = await readFile(resolve(pagesDir, "../components/layout.tsx"), "utf8");

function keyboardOffset(layoutViewportHeight, visualViewportHeight, visualViewportTop = 0) {
  const visibleViewportBottom = visualViewportHeight + visualViewportTop;
  return Math.max(0, layoutViewportHeight - visibleViewportBottom);
}

test("visual viewport keyboard changes move the reply composer above the keyboard", () => {
  assert.equal(keyboardOffset(800, 480), 320);
  assert.equal(keyboardOffset(800, 480, 24), 296);

  assert.match(threadSource, /visualViewport\.height \+ visualViewport\.offsetTop/);
  assert.match(threadSource, /Math\.max\(0, layoutViewportHeight - visibleViewportBottom\)/);
  assert.match(threadSource, /visualViewport\?\.addEventListener\("resize", updateKeyboardOffset\)/);
  assert.match(threadSource, /visualViewport\?\.addEventListener\("scroll", updateKeyboardOffset\)/);
  assert.match(threadSource, /--keyboard-offset.*keyboardOffset/);
  assert.match(threadSource, /bottom-\[calc\(78px\+env\(safe-area-inset-bottom\)\+var\(--keyboard-offset\)\)\]/);
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