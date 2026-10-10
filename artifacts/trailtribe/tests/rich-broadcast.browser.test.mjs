import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
let server, browser, baseUrl;
before(async () => {
  server = spawn(process.execPath, [resolve(here, "rich-message.browser-server.mjs")], {
    env: { ...process.env, RICH_FIXTURE_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", chunk => process.stderr.write(chunk));
  baseUrl = await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error("Fixture server startup timed out")), 20000);
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`Fixture server exited ${code}`)); });
    server.stdout.on("data", chunk => {
      const match = String(chunk).match(/listening on (\d+)/);
      if (match) { clearTimeout(timer); resolveReady(`http://127.0.0.1:${match[1]}`); }
    });
  });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server && server.exitCode == null) { const exited = once(server, "exit"); server.kill("SIGTERM"); await exited; }
});

for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  for (const composer of ["broadcast", "thread"]) {
    test(`${composer} formatting toolbar stays usable at ${viewport.width}px`, async () => {
      const page = await browser.newPage({ viewport });
      try {
        await page.goto(`${baseUrl}${composer === "broadcast" ? "/messages/new" : "/messages?tab=general"}`);
        if (composer === "thread") await page.getByRole("button", { name: "New Thread", exact: true }).click();

        const toolbar = page.getByTestId("message-formatting-toolbar");
        await toolbar.getByRole("button", { name: "Insert table", exact: true }).waitFor();
        const layout = await toolbar.evaluate(element => {
          const buttons = [...element.querySelectorAll("button")].map(button => {
            const rect = button.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          });
          return {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            buttons,
            viewportWidth: document.documentElement.clientWidth,
          };
        });
        assert.equal(layout.scrollWidth, layout.clientWidth, "formatting actions should fit without horizontal toolbar scrolling");
        assert.equal(layout.buttons.length, 7, "all formatting actions, including tables and preview, should remain available");
        for (const button of layout.buttons) {
          assert.ok(button.left >= 0 && button.right <= layout.viewportWidth, "each formatting action should stay inside the phone viewport");
        }
        if (viewport.width < 640) {
          assert.equal(new Set(layout.buttons.map(button => button.top)).size, 1, "the compact mobile toolbar should stay on one row");
        }
        assert.equal(await page.getByRole("button", { name: "Insert table", exact: true }).isVisible(), true);
      } finally {
        await page.close();
      }
    });
  }
}

async function pasteAddress(page, address, text) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  await page.evaluate(text => navigator.clipboard.writeText(text), text);
  await address.focus();
  await address.press("Control+V");
  assert.equal(await address.inputValue(), text, "Paste must insert the clipboard text into the existing field, not replace a hidden prefix");
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  for (const composer of ["broadcast", "thread", "reply"]) {
    test(`${composer} link entry pastes safely and keeps invalid edits at ${viewport.width}px`, async () => {
      const page = await browser.newPage({ viewport });
      try {
        await page.goto(`${baseUrl}${composer === "broadcast" ? "/messages/new" : composer === "thread" ? "/messages" : "/messages/thread/42"}`);
        if (composer === "thread") await page.getByRole("button", { name: "New Thread", exact: true }).click();
        const message = page.getByPlaceholder(composer === "broadcast" ? "Type your message here..." : composer === "thread" ? "Share your thoughts..." : "Add to the conversation…");
        const editor = message.locator("..");
        const open = editor.getByRole("button", { name: "Insert link", exact: true });
        const address = editor.getByRole("textbox", { name: "Link address" });
        const add = editor.getByRole("button", { name: "Add link", exact: true });
        await message.fill("See Team site today.");
        await message.evaluate(input => input.setSelectionRange(4, 13));
        await open.click();
        assert.equal(await address.inputValue(), "");
        assert.equal(await address.getAttribute("placeholder"), "https://example.com");
        assert.equal(await address.evaluate(input => input === document.activeElement), true);
        assert.equal(await add.isDisabled(), true);
        await pasteAddress(page, address, "https://https://example.test/team");
        await add.click();
        await page.getByText("The address contains two http:// or https:// prefixes. Paste the full link with only one prefix.", { exact: true }).waitFor();
        assert.equal(await message.inputValue(), "See Team site today.");
        assert.equal(await address.inputValue(), "https://https://example.test/team");
        assert.deepEqual(await message.evaluate(input => [input.selectionStart, input.selectionEnd]), [4, 13]);
        // Correction must still use the original message selection.
        await address.fill("https://example.test/team?next=https://other.test/a#results");
        await add.click();
        assert.equal(await message.inputValue(), "See [Team site](<https://example.test/team?next=https://other.test/a#results>) today.");
        await editor.getByTestId("toggle-message-preview").click();
        assert.equal(await editor.getByTestId("message-preview").getByRole("link", { name: "Team site", exact: true }).getAttribute("href"),
          "https://example.test/team?next=https://other.test/a#results");
        await editor.getByTestId("toggle-message-preview").click();

        // Cancel never changes the message, and reopening must discard the address.
        await message.fill("Team site");
        await message.evaluate(input => input.setSelectionRange(0, 9));
        await open.click();
        await address.pressSequentially("https://cancelled.test");
        await editor.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(await message.inputValue(), "Team site");
        await open.click();
        assert.equal(await address.inputValue(), "");
        assert.equal(await add.isDisabled(), true);
        const destination = composer === "reply" ? "mailto:coach@example.test?subject=Practice%20update"
          : composer === "thread" ? "http://example.test/team" : "https://example.test/team";
        await pasteAddress(page, address, `  ${destination}  `);
        await add.click();
        assert.equal(await message.inputValue(), `[Team site](<${destination}>)`);
        await editor.getByTestId("toggle-message-preview").click();
        assert.equal(await editor.getByTestId("message-preview").getByRole("link", { name: "Team site", exact: true }).getAttribute("href"), destination);
        assert.equal(await page.evaluate(() => window.richSubmitted.length), 0, "Link controls must not submit their enclosing composer");
      } finally { await page.close(); }
    });
  }
  test(`broadcast submit remains reachable and preserves formatted pictures at ${viewport.width}px`, async () => {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(`${baseUrl}/messages/new`);
      await page.getByRole("checkbox", { name: "All Team", exact: true }).check();
      await page.getByPlaceholder("e.g. Practice relocated today").fill("Fixture lap results");
      const message = page.getByPlaceholder("Type your message here...");
      await message.fill("Team site");
      await message.evaluate(input => input.setSelectionRange(0, 9));
      await page.getByRole("button", { name: "Insert link", exact: true }).click();
      await pasteAddress(page, page.getByRole("textbox", { name: "Link address" }), "https://example.test/team");
      await page.getByRole("button", { name: "Add link", exact: true }).click();
      assert.equal(await message.inputValue(), "[Team site](<https://example.test/team>)");

      const markdown = "## Results\n\n| Rider | Lap 1 | Lap 2 |\n| --- | --- | --- |\n| **Alex** | 1:22 | 1:24 |";
      await message.fill(markdown);
      const png = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 400; canvas.height = 200;
        const context = canvas.getContext("2d");
        context.fillStyle = "#008777"; context.fillRect(0, 0, 400, 200);
        context.fillStyle = "#fff"; context.fillText("Excel screenshot fixture", 20, 40);
        return canvas.toDataURL("image/png").split(",")[1];
      });
      await page.getByTestId("input-message-pictures").setInputFiles({
        name: "results.png", mimeType: "image/png", buffer: Buffer.from(png, "base64"),
      });
      const send = page.getByTestId("send-broadcast");
      await page.getByRole("button", { name: "Uploading…" }).waitFor();
      assert.equal(await send.isDisabled(), true);
      await page.getByRole("button", { name: "Add pictures" }).waitFor();
      await send.scrollIntoViewIfNeeded();
      assert.equal(await send.evaluate(button => {
        const rect = button.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest("button") === button;
      }), true, "Send must not be covered by fixed navigation");
      await send.click({ timeout: 5000 });
      await page.waitForURL("**/messages?tab=announcements");
      await page.getByRole("heading", { name: "Results", exact: true }).waitFor();
      const image = page.getByTestId("message-image-0");
      await image.waitFor();
      await image.evaluate(img => img.decode());
      assert.equal(await image.evaluate(img => Math.abs(img.getBoundingClientRect().width / img.getBoundingClientRect().height - 2) < 0.02), true);
      assert.equal(await page.getByText("**literal stars**", { exact: false }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      const submitted = await page.evaluate(() => window.richSubmitted[0]);
      assert.equal(submitted.bodyFormat, "markdown");
      assert.equal(submitted.body, markdown);
      assert.equal(submitted.channel, "email");
      assert.equal(submitted.isAllTeam, true);
      assert.equal(submitted.imageObjectPaths.length, 1);
    } finally { await page.close(); }
  });
}

test("broadcast log orders active and archived cards newest-first and keeps search filtering", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${baseUrl}/messages?tab=announcements`);
    const cards = page.locator('[data-testid^="broadcast-card-"]');
    const cardIds = () => cards.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-testid")));

    await page.getByTestId("broadcast-card-6").getByText("Date unavailable").waitFor();
    assert.deepEqual(await cardIds(), [
      "broadcast-card-3",
      "broadcast-card-6",
      "broadcast-card-1",
      "broadcast-card-2",
    ]);

    const search = page.getByPlaceholder("Search broadcasts...");
    await search.fill("Older active");
    assert.deepEqual(await cardIds(), ["broadcast-card-2"]);
    await search.fill("");

    await page.getByRole("button", { name: "2 archived broadcasts" }).click();
    assert.deepEqual(await cardIds(), [
      "broadcast-card-3",
      "broadcast-card-6",
      "broadcast-card-1",
      "broadcast-card-2",
      "broadcast-card-5",
      "broadcast-card-4",
    ]);
  } finally { await page.close(); }
});