import assert from "node:assert/strict";
import test from "node:test";
import { splitLinkifiedText } from "./linkify-text.mjs";

test("linkifies multiple http and https URLs while preserving surrounding text", () => {
  assert.deepEqual(
    splitLinkifiedText("First https://example.com/a\nthen http://example.org/b"),
    [
      { type: "text", value: "First " },
      { type: "link", value: "https://example.com/a" },
      { type: "text", value: "\nthen " },
      { type: "link", value: "http://example.org/b" },
    ],
  );
});

test("keeps sentence punctuation outside links", () => {
  assert.deepEqual(splitLinkifiedText("Visit (https://example.com/path?q=1)."), [
    { type: "text", value: "Visit (" },
    { type: "link", value: "https://example.com/path?q=1" },
    { type: "text", value: ")." },
  ]);
});

test("leaves plain text and unsafe schemes unlinked", () => {
  const text = "No link: example.com or javascript:alert(1)";
  assert.deepEqual(splitLinkifiedText(text), [{ type: "text", value: text }]);
});

test("keeps balanced closing punctuation that belongs to a URL", () => {
  assert.deepEqual(splitLinkifiedText("https://en.wikipedia.org/wiki/Trail_(network)"), [
    { type: "link", value: "https://en.wikipedia.org/wiki/Trail_(network)" },
  ]);
});