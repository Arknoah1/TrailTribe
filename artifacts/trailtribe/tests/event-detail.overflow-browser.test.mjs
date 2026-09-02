import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

process.env.PORT ??= "5173";

const { createServer: createViteServer } = await import("vite");
const here = dirname(fileURLToPath(import.meta.url));
const artifactRoot = resolve(here, "..");
const fixturePath = "/tests/fixtures/event-detail.browser.html";
const authedFetchSource = resolve(artifactRoot, "src/lib/use-authed-fetch.ts");
const authedFetchFixture = resolve(artifactRoot, "tests/fixtures/authenticated-fetch.fixture.ts");
const authedFetchFixtureSource = await readFile(authedFetchFixture, "utf8");

let viteServer;
let httpServer;
let baseUrl;

before(async () => {
  viteServer = await createViteServer({
    configFile: resolve(artifactRoot, "vite.config.ts"),
    plugins: [
      {
        name: "event-detail-authenticated-fetch-fixture",
        enforce: "pre",
        load(id) {
          if (id === authedFetchSource) {
            return authedFetchFixtureSource;
          }
          return null;
        },
      },
    ],
    server: { middlewareMode: true, hmr: false },
    logLevel: "error",
  });

  httpServer = createHttpServer((request, response) => {
    if (request.url?.startsWith("/events/42")) {
      const query = request.url.slice("/events/42".length);
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
        reject(new Error("The event fixture server did not expose a TCP address"));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolvePromise();
    });
  });
});

after(async () => {
  await viteServer?.close();
  if (httpServer) await new Promise((resolvePromise) => httpServer.close(resolvePromise));
});

const scenarios = [
  { name: "320px phone with normal counts", width: 320, counts: "normal" },
  { name: "375px phone with large counts", width: 375, counts: "large" },
  { name: "desktop with large counts", width: 1280, counts: "large" },
];

for (const scenario of scenarios) {
  test(`Logistics stays horizontally contained at ${scenario.name}`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: 900 } });
      await page.goto(`${baseUrl}/events/42?counts=${scenario.counts}`, { waitUntil: "networkidle" });
      await page.getByTestId("event-logistics-card").waitFor({ state: "visible" });

      const measurements = await page.evaluate(() => {
        const ids = [
          "event-logistics-card",
          "event-logistics-carpools",
          "event-logistics-carpools-label",
          "event-logistics-carpools-badge",
          "event-logistics-volunteers",
          "event-logistics-volunteers-label",
          "event-logistics-volunteers-badge",
        ];
        const card = document.querySelector('[data-testid="event-logistics-card"]');
        const cardRect = card?.getBoundingClientRect();
        return {
          viewportWidth: document.documentElement.clientWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          card: cardRect && { left: cardRect.left, right: cardRect.right },
          elements: ids.map((id) => {
            const element = document.querySelector(`[data-testid="${id}"]`);
            const rect = element?.getBoundingClientRect();
            return { id, left: rect?.left, right: rect?.right };
          }),
        };
      });

      assert.equal(measurements.pageScrollWidth, measurements.viewportWidth, "document must not overflow horizontally");
      assert.ok(measurements.bodyScrollWidth <= measurements.viewportWidth, "body must not overflow horizontally");
      assert.ok(measurements.card, "Logistics card should be measurable");
      assert.ok(measurements.card.left >= 0, "Logistics card must stay inside the viewport");
      assert.ok(measurements.card.right <= measurements.viewportWidth, "Logistics card must stay inside the viewport");

      for (const element of measurements.elements) {
        assert.notEqual(element.left, undefined, `${element.id} should be rendered`);
        assert.ok(element.left >= measurements.card.left, `${element.id} must not escape the card's left edge`);
        assert.ok(element.right <= measurements.card.right, `${element.id} must not escape the card's right edge`);
      }
    } finally {
      await browser.close();
    }
  });
}