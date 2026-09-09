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
const fixturePath = "/tests/fixtures/family-link.browser.html";
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
    if (request.url?.startsWith("/admin")) {
      const query = request.url.slice("/admin".length);
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
      if (!address || typeof address === "string") return reject(new Error("Fixture server has no TCP address"));
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolvePromise();
    });
  });
});

after(async () => {
  await viteServer?.close();
  if (httpServer) await new Promise((resolvePromise) => httpServer.close(resolvePromise));
});

async function openScenario(browser, scenario, viewport) {
  const context = await browser.newContext({
    viewport,
    hasTouch: viewport.width < 600,
    isMobile: viewport.width < 600,
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(`${baseUrl}/admin?scenario=${scenario}`, { waitUntil: "networkidle" });
  await page.getByTestId("active-family-card").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {
    throw new Error(`Family-link fixture did not render: ${browserErrors.join(" | ") || "no browser error reported"}`);
  });
  return { context, page };
}

test("native share succeeds with the base path and encoded join route", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await openScenario(browser, "share-success", { width: 390, height: 844 });
    await page.getByRole("button", { name: "Share family link" }).click();
    const events = await page.evaluate(() => window.familyLinkEvents);
    assert.equal(events[0].type, "share");
    assert.equal(events[0].url, `${baseUrl}/trailteam/join/family%2Fcode`);
    assert.equal(events[1].title, "Family link shared");
    await context.close();
  } finally {
    await browser.close();
  }
});

test("cancelling native share does not copy or open the manual fallback", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await openScenario(browser, "share-cancel", { width: 390, height: 844 });
    await page.getByRole("button", { name: "Share family link" }).click();
    assert.deepEqual((await page.evaluate(() => window.familyLinkEvents)).map((event) => event.type), ["share"]);
    assert.equal(await page.getByRole("dialog").count(), 0);
    await context.close();
  } finally {
    await browser.close();
  }
});

test("failed native share recovers through clipboard copying", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await openScenario(browser, "share-failure", { width: 1280, height: 900 });
    await page.getByRole("button", { name: "Share family link" }).click();
    const events = await page.evaluate(() => window.familyLinkEvents);
    assert.deepEqual(events.map((event) => event.type), ["share", "clipboard", "notice"]);
    assert.equal(events[1].url, `${baseUrl}/trailteam/join/family%2Fcode`);
    assert.equal(events[2].title, "Family link copied");
    await context.close();
  } finally {
    await browser.close();
  }
});

test("blocked automatic options show a selectable manual link", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await openScenario(browser, "manual", { width: 390, height: 844 });
    await page.getByRole("button", { name: "Share family link" }).click();
    const input = page.getByRole("textbox", { name: "Family invite link" });
    await input.waitFor({ state: "visible" });
    assert.equal(await input.inputValue(), `${baseUrl}/trailteam/join/family%2Fcode`);
    await input.focus();
    assert.equal(await input.evaluate((element) => element.selectionStart), 0);
    assert.equal(await input.evaluate((element) => element.selectionEnd), (await input.inputValue()).length);
    await context.close();
  } finally {
    await browser.close();
  }
});

for (const viewport of [{ width: 320, height: 720 }, { width: 1280, height: 900 }]) {
  test(`family cards keep sharing usable without overflow at ${viewport.width}px`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const { context, page } = await openScenario(browser, "manual", viewport);
      const activeCard = page.getByTestId("active-family-card");
      const archivedCard = page.getByTestId("archived-family-card");
      const shareButton = page.getByRole("button", { name: "Share family link" });
      assert.equal(await shareButton.count(), 1, "archived cards must never expose sharing");
      assert.equal(await archivedCard.getByRole("button", { name: "Share family link" }).count(), 0);
      const contained = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="active-family-card"]').getBoundingClientRect();
        const button = [...document.querySelectorAll("button")].find((node) => node.textContent.includes("Share family link")).getBoundingClientRect();
        return {
          noPageOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
          buttonInsideCard: button.left >= card.left && button.right <= card.right,
        };
      });
      assert.deepEqual(contained, { noPageOverflow: true, buttonInsideCard: true });
      await context.close();
    } finally {
      await browser.close();
    }
  });
}