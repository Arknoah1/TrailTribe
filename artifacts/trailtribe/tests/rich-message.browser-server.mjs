// Isolated production-page fixture. Every API request is mocked; no family emails or DB writes.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
process.env.PORT ??= "5173";
const { createServer: createViteServer } = await import("vite");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createViteServer({
  configFile: resolve(root, "vite.config.ts"),
  server: { middlewareMode: true, hmr: false },
  plugins: [{
    name: "fixture-auth-only",
    enforce: "pre",
    async load(id) {
      if (id.split("?")[0] === resolve(root, "src/lib/use-authed-fetch.ts")) {
        return readFile(resolve(root, "tests/fixtures/authenticated-fetch.fixture.ts"), "utf8");
      }
    },
  }],
  logLevel: "error",
});
const server = createServer((request, response) => {
  if (request.url?.startsWith("/messages")) request.url = "/tests/fixtures/rich-message.browser.html";
  vite.middlewares(request, response, () => { response.writeHead(404); response.end(); });
});
server.listen(Number(process.env.RICH_FIXTURE_PORT ?? 5178), "0.0.0.0", () => console.log(`Rich message fixtures listening on ${server.address().port}`));
const stop = async () => { await vite.close(); server.close(() => process.exit(0)); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);