import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

process.env.PORT ??= "5173";

const { createServer: createViteServer } = await import("vite");
const here = dirname(fileURLToPath(import.meta.url));
const artifactRoot = resolve(here, "..");
const fixturePath = "/tests/fixtures/board-thread.mobile-browser.html";

let viteServer;
let httpServer;
let baseUrl;

before(async () => {
  const fixtureAuthPlugin = {
    name: "trailteam-browser-fixture-auth",
    load(id) {
      if (id === resolve(artifactRoot, "src/lib/use-authed-fetch.ts")) {
        return `
          import { useCallback } from "react";
          export function useAuthedFetch() {
            return useCallback((url, options = {}) => fetch(url, options), []);
          }
        `;
      }
      return null;
    },
  };

  viteServer = await createViteServer({
    configFile: resolve(artifactRoot, "vite.config.ts"),
    plugins: [fixtureAuthPlugin],
    server: { middlewareMode: true, hmr: false },
    logLevel: "error",
  });

  httpServer = createHttpServer((request, response) => {
    if (request.url?.startsWith("/messages/thread/42")) {
      const query = request.url.slice("/messages/thread/42".length);
      request.url = `${fixturePath}${query}`;
    }
    viteServer.middlewares(request, response, () => {
      response.statusCode = 404;
      response.end("Not found");
    });
  });

  await new Promise((resolvePromise, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("The browser fixture server did not expose a TCP address"));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolvePromise();
    });
  });
});

after(async () => {
  await viteServer?.close();
  if (httpServer) {
    await new Promise((resolvePromise) => httpServer.close(resolvePromise));
  }
});

function rectFor(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
  });
}

test("mobile discussion keeps the reply controls visible through keyboard dismissal", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    page.on("console", (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(`[browser:error] ${error.stack ?? error.message}`));

    await page.goto(`${baseUrl}/messages/thread/42?tab=general`, { waitUntil: "networkidle" });

    const reply = page.getByRole("textbox", { name: "Reply to this discussion" });
    const send = page.getByRole("button", { name: "Send reply" });
    const composer = page.getByTestId("reply-composer");
    const bottomNavigation = page.getByTestId("mobile-bottom-nav");

    await reply.waitFor({ state: "visible", timeout: 5_000 });
    await page.getByText("Meet at the north trailhead").waitFor({ state: "visible" });
    await page.setViewportSize({ width: 320, height: 844 });

    const toolbar = page.getByRole("toolbar", { name: "Message formatting" });
    const narrowToolbar = await toolbar.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, right: rect.right };
      }),
    );
    assert.equal(narrowToolbar.length, 6, "the compact toolbar should keep five formatting actions and Preview");
    assert.equal(new Set(narrowToolbar.map((button) => button.top)).size, 1, "all compact actions should fit on one row");
    assert.ok(narrowToolbar.every((button) => button.right <= 320), "compact actions should remain inside a 320px screen");
    assert.equal(await page.getByTestId("format-table").count(), 0, "table formatting is omitted from discussion replies");

    await page.setViewportSize({ width: 390, height: 844 });
    await reply.fill("I can bring the trail map and first-aid kit.");
    await reply.focus();

    await page.evaluate(() => {
      window.setSimulatedVisualViewport?.(420);
    });
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="reply-composer"]');
      const visibleViewport = window.visualViewport;
      const expectedBottom = window.innerHeight - (visibleViewport?.height ?? window.innerHeight) - (visibleViewport?.offsetTop ?? 0);
      return element && getComputedStyle(element).bottom === `${expectedBottom}px`;
    });

    const reducedViewportMeasurements = await page.evaluate(() => {
      const visibleBottom = window.visualViewport?.height ?? window.innerHeight;
      const textarea = document.querySelector('[aria-label="Reply to this discussion"]')?.getBoundingClientRect();
      const sendButton = document.querySelector('[aria-label="Send reply"]')?.getBoundingClientRect();
      return {
        visibleBottom,
        textareaBottom: textarea?.bottom ?? -1,
        sendBottom: sendButton?.bottom ?? -1,
        activeElementIsReply: document.activeElement?.getAttribute("aria-label") === "Reply to this discussion",
      };
    });

    assert.equal(reducedViewportMeasurements.visibleBottom, 420);
    assert.ok(reducedViewportMeasurements.textareaBottom <= 420, "textarea should stay above the reduced visual viewport");
    assert.ok(reducedViewportMeasurements.sendBottom <= 420, "send control should stay above the reduced visual viewport");
    assert.equal(reducedViewportMeasurements.activeElementIsReply, true);

    await page.evaluate(() => {
      window.setSimulatedVisualViewport?.(844);
      (document.activeElement instanceof HTMLElement) && document.activeElement.blur();
    });
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="reply-composer"]');
      return element && getComputedStyle(element).bottom === "78px";
    });

    const restoredComposer = await rectFor(composer);
    const restoredNavigation = await rectFor(bottomNavigation);
    assert.ok(
      Math.abs(restoredComposer.bottom - restoredNavigation.top) <= 1,
      "dismissing the keyboard should restore the composer-to-navigation spacing",
    );

    await reply.focus();
    await page.setViewportSize({ width: 390, height: 420 });
    await page.evaluate(() => window.setSimulatedVisualViewport?.(window.innerHeight));
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="reply-composer"]');
      return element && getComputedStyle(element).bottom === "78px";
    });

    const resizedViewportMeasurements = await page.evaluate(() => {
      const composerRect = document.querySelector('[data-testid="reply-composer"]')?.getBoundingClientRect();
      const navRect = document.querySelector('[data-testid="mobile-bottom-nav"]')?.getBoundingClientRect();
      const textareaRect = document.querySelector('[aria-label="Reply to this discussion"]')?.getBoundingClientRect();
      const sendRect = document.querySelector('[aria-label="Send reply"]')?.getBoundingClientRect();
      const scrollRegion = document.querySelector("#root");
      return {
        composerBottom: composerRect?.bottom ?? -1,
        navigationTop: navRect?.top ?? -1,
        textareaBottom: textareaRect?.bottom ?? -1,
        sendBottom: sendRect?.bottom ?? -1,
        canScrollThread: Boolean(scrollRegion && scrollRegion.scrollHeight > scrollRegion.clientHeight),
        activeElementIsReply: document.activeElement?.getAttribute("aria-label") === "Reply to this discussion",
      };
    });

    assert.ok(
      Math.abs(resizedViewportMeasurements.composerBottom - resizedViewportMeasurements.navigationTop) <= 1,
      "when Android resizes the layout viewport, the composer should sit above navigation without adding the keyboard height twice",
    );
    assert.ok(resizedViewportMeasurements.textareaBottom <= resizedViewportMeasurements.navigationTop);
    assert.ok(resizedViewportMeasurements.sendBottom <= resizedViewportMeasurements.navigationTop);
    assert.ok(resizedViewportMeasurements.canScrollThread, "the discussion should remain scrollable above the docked composer");
    assert.equal(resizedViewportMeasurements.activeElementIsReply, true);

    await page.locator("#root").evaluate((scrollRegion) => {
      scrollRegion.scrollTop = scrollRegion.scrollHeight;
    });
    await page.waitForTimeout(50);
    const lastReply = await page.getByText("A private reply that should be redacted after deletion").boundingBox();
    const dockedComposer = await rectFor(composer);
    assert.ok(lastReply && lastReply.y + lastReply.height <= dockedComposer.top, "scrolling to the newest reply should not leave it underneath the composer");
  } finally {
    await browser.close();
  }
});

test("authenticated author sees a redacted reply with no delete control after refresh", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/messages/thread/42?tab=general&viewer=author`, { waitUntil: "networkidle" });

    const originalBody = "A private reply that should be redacted after deletion";
    await page.getByText(originalBody, { exact: true }).waitFor({ state: "visible" });
    const replyActions = page.getByRole("button", { name: "Reply actions for Alex" });
    await replyActions.click();
    const deleteReply = page.getByRole("menuitem", { name: "Delete reply" });
    await deleteReply.waitFor({ state: "visible" });

    page.once("dialog", (dialog) => dialog.accept());
    await deleteReply.evaluate((element) => element.click());

    const deletedMessage = page.getByText("[This message was deleted]", { exact: true });
    await deletedMessage.waitFor({ state: "visible" });
    assert.equal(await page.getByText(originalBody, { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Reply actions for Alex" }).count(), 0);

    await page.reload({ waitUntil: "networkidle" });
    await deletedMessage.waitFor({ state: "visible" });
    assert.equal(await page.getByText(originalBody, { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Reply actions for Alex" }).count(), 0);
  } finally {
    await browser.close();
  }
});

test("unauthorized viewer cannot delete a reply before or after refresh", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/messages/thread/42?tab=general&viewer=other`, { waitUntil: "networkidle" });

    const deleteReply = page.getByRole("button", { name: "Delete reply" });
    assert.equal(await deleteReply.count(), 0);
    assert.equal(
      await page.evaluate(async () => (await fetch("/api/board/posts/7", { method: "DELETE" })).status),
      403,
    );

    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByRole("button", { name: "Delete reply" }).count(), 0);
    assert.equal(
      await page.evaluate(async () => (await fetch("/api/board/posts/7", { method: "DELETE" })).status),
      403,
    );
  } finally {
    await browser.close();
  }
});