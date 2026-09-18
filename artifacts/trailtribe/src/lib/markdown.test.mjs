import assert from "node:assert/strict";
import test from "node:test";
import { stripMarkdown } from "./markdown.mjs";

test("stripMarkdown turns GFM tables and links into readable preview text", async () => {
  assert.equal(
    stripMarkdown(
      "# WSCL Race\n\n| Staging Time | Race Start |\n| --- | :---: |\n| 8:00 AM | 9:00 AM |\n\n[Schedule PDF](https://example.com/schedule.pdf)",
    ),
    "WSCL Race Staging Time Race Start 8:00 AM 9:00 AM Schedule PDF",
  );
});

test("stripMarkdown preserves ordinary descriptions without markdown", async () => {
  assert.equal(
    stripMarkdown("Meet at the north lot.\nBring water and a helmet."),
    "Meet at the north lot. Bring water and a helmet.",
  );
});