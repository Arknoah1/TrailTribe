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
const fixturePath = "/tests/fixtures/link-preview-composers.browser.html";

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
    if (request.url?.startsWith("/messages")) {
      const queryIndex = request.url.indexOf("?");
      const query = queryIndex >= 0 ? request.url.slice(queryIndex) : "";
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

async function mobilePage(browser, path) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  return { context, page };
}

async function replacePreviewUrl(page, textbox) {
  await textbox.fill("Ride details: https://first.example/route");
  await page.getByTestId("link-preview-loading").waitFor({ state: "visible" });
  await textbox.fill("Ride details: https://second.example/route");
  await page.getByText("Current trail preview", { exact: true }).waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  assert.equal(await page.getByText("Old trail preview", { exact: true }).count(), 0);

  await textbox.fill("Ride details without a link");
  await page.getByTestId("composer-link-preview").waitFor({ state: "detached" });
}

test("new-thread preview tracks edits and metadata failure cannot block posting on mobile", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await mobilePage(browser, "/messages?tab=general");
    await page.getByRole("button", { name: "New Thread" }).click();

    const subject = page.getByRole("textbox", { name: "Subject" });
    const message = page.getByRole("textbox", { name: "Message" });
    const post = page.getByRole("button", { name: "Post Thread" });
    await subject.fill("Preview regression check");
    await replacePreviewUrl(page, message);

    const failedDraft = "Draft survives https://fails.example/unavailable";
    await message.fill(failedDraft);
    await page.waitForTimeout(500);
    assert.equal(await page.getByTestId("link-preview-card").count(), 0);
    assert.equal(await message.inputValue(), failedDraft);

    const controls = await page.evaluate(() => {
      const textarea = document.querySelector('textarea[name="body"]')?.getBoundingClientRect();
      const button = [...document.querySelectorAll("button")].find((element) => element.textContent?.includes("Post Thread"))?.getBoundingClientRect();
      return { textarea, button, viewportWidth: document.documentElement.clientWidth, viewportHeight: window.innerHeight };
    });
    assert.ok(controls.textarea.left >= 0 && controls.textarea.right <= controls.viewportWidth);
    assert.ok(controls.button.left >= 0 && controls.button.right <= controls.viewportWidth);
    assert.ok(controls.button.bottom <= controls.viewportHeight);

    await post.click();
    await page.waitForFunction(() => window.submittedThread !== null);
    assert.deepEqual(
      await page.evaluate(() => window.submittedThread),
      { title: "Preview regression check", body: failedDraft, podId: null },
    );
    await context.close();
  } finally {
    await browser.close();
  }
});

test("reply preview tracks edits and metadata failure cannot block sending on mobile", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await mobilePage(browser, "/messages/thread/42?tab=general");
    const reply = page.getByRole("textbox", { name: "Reply to this discussion" });
    const send = page.getByRole("button", { name: "Send reply" });
    await replacePreviewUrl(page, reply);

    const failedDraft = "Reply survives https://fails.example/unavailable";
    await reply.fill(failedDraft);
    await page.waitForTimeout(500);
    assert.equal(await page.getByTestId("link-preview-card").count(), 0);
    assert.equal(await reply.inputValue(), failedDraft);

    const controls = await page.evaluate(() => {
      const textarea = document.querySelector('[aria-label="Reply to this discussion"]')?.getBoundingClientRect();
      const button = document.querySelector('[aria-label="Send reply"]')?.getBoundingClientRect();
      return { textarea, button, viewportWidth: document.documentElement.clientWidth, viewportHeight: window.innerHeight };
    });
    assert.ok(controls.textarea.left >= 0 && controls.textarea.right <= controls.viewportWidth);
    assert.ok(controls.button.left >= 0 && controls.button.right <= controls.viewportWidth);
    assert.ok(controls.textarea.bottom <= controls.viewportHeight);
    assert.ok(controls.button.bottom <= controls.viewportHeight);

    await send.click();
    await page.waitForFunction(() => window.submittedReply !== null);
    assert.deepEqual(await page.evaluate(() => window.submittedReply), { body: failedDraft });
    await context.close();
  } finally {
    await browser.close();
  }
});