import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function renderMarkdown(markdown) {
  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkGfm] },
      markdown,
    ),
  );
}

test("event markdown renders GFM tables and clickable links", () => {
  const html = renderMarkdown(
    "| Staging Time | Race Start |\n| --- | --- |\n| 8:00 AM | 9:00 AM |\n\nhttps://example.com/schedule.pdf",
  );

  assert.match(html, /<table>/);
  assert.match(html, /<th>Staging Time<\/th>/);
  assert.match(html, /<td>8:00 AM<\/td>/);
  assert.match(html, /href="https:\/\/example\.com\/schedule\.pdf"/);
  assert.match(html, />https:\/\/example\.com\/schedule\.pdf<\/a>/);
});

test("event markdown does not pass raw HTML through", () => {
  const html = renderMarkdown("Safe text\n\n<script>alert('unsafe')</script>");

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Safe text/);
});

test("ordinary event descriptions remain readable", () => {
  assert.equal(
    renderMarkdown("Meet at the north lot."),
    "<p>Meet at the north lot.</p>",
  );
});