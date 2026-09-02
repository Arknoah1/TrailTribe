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
  viteServer = await createViteServer({
    configFile: resolve(artifactRoot, "vite.config.ts"),
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
    await reply.fill("I can bring the trail map and first-aid kit.");
    await reply.focus();

    await page.evaluate(() => {
      window.setSimulatedVisualViewport?.(420);
    });
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="reply-composer"]');
      return element && getComputedStyle(element).bottom === "502px";
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
    const deleteReply = page.getByRole("button", { name: "Delete reply" });
    await deleteReply.waitFor({ state: "visible" });

    page.once("dialog", (dialog) => dialog.accept());
    await deleteReply.click();

    const deletedMessage = page.getByText("[This message was deleted]", { exact: true });
    await deletedMessage.waitFor({ state: "visible" });
    assert.equal(await page.getByText(originalBody, { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Delete reply" }).count(), 0);

    await page.reload({ waitUntil: "networkidle" });
    await deletedMessage.waitFor({ state: "visible" });
    assert.equal(await page.getByText(originalBody, { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Delete reply" }).count(), 0);
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