import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsToMarkdownTable, spreadsheetTextToMarkdown, formatSelection, messageLinkPreviewText, validateMessageLink } from "./message-formatting.mjs";

test("Excel paste becomes a rectangular editable table", () => {
  assert.equal(spreadsheetTextToMarkdown("Rider\tLap 1\tLap 2\r\nAlice\t1:22\t1:24\r\nBob\t1:30\r\n"),
    "| Rider | Lap 1 | Lap 2 |\n| --- | --- | --- |\n| Alice | 1:22 | 1:24 |\n| Bob | 1:30 |  |");
});
test("block formatting preserves surrounding inline emphasis and acts on complete lines", () => {
  assert.equal(formatSelection("**Rider notes**", 2, 7, "heading").value, "## **Rider notes**");
  assert.equal(formatSelection("## **Rider notes**\nAnother line", 5, 10, "bullets").value, "- **Rider notes**\nAnother line");
  assert.equal(formatSelection("**Rider notes**", 0, 15, "bold").value, "Rider notes");
});
test("links use the supplied safe destination and remote images do not generate previews", () => {
  assert.equal(formatSelection("Team site", 0, 9, "link", "https://example.test/team").value, "[Team site](<https://example.test/team>)");
  assert.equal(messageLinkPreviewText("![pixel](https://remote.test/pixel.png) https://example.test/team"), " https://example.test/team");
  assert.equal(messageLinkPreviewText("[Team site](<https://example.test/team>)"), "[Team site](https://example.test/team)");
});
test("link validation preserves full safe destinations and trims only outer whitespace", () => {
  for (const url of [
    "https://example.test/team?next=https://other.test/a#results",
    "http://example.test:8080/path?q=hello%20world#top",
    "HTTPS://example.test/CaseSensitive?key=Value",
    "mailto:coach@example.test?subject=Practice%20update",
  ]) {
    assert.equal(validateMessageLink(` \t${url}\n `), url);
    assert.equal(formatSelection("Go to Team site now", 6, 15, "link", validateMessageLink(url)).value,
      `Go to [Team site](<${url}>) now`);
  }
});
test("link validation explicitly rejects doubled leading schemes without silently repairing them", () => {
  for (const url of ["https://https://example.test", "https://http://example.test",
    "http://https://example.test", "HTTPS://HTTPS://example.test"]) {
    assert.throws(() => validateMessageLink(url), /two.*prefixes/);
  }
});
test("link validation rejects empty or missing destinations and unsafe syntax", () => {
  for (const url of ["", "  ", "https://", "http://", "mailto:", "mailto:?subject=Hi",
    "example.test", "https:example.test", "javascript:alert(1)", "data:text/html,test",
    "https://exa\nmple.test", "https://example.test/<script>", "https://example.test/has space"]) {
    assert.throws(() => validateMessageLink(url), /complete.*destination/);
  }
});
test("quoted tabs and newlines, pipes and HTML remain cell text", () => {
  assert.equal(spreadsheetTextToMarkdown('Name\tNotes\n"A\tB"\t"line 1\nline 2 | <script>"'),
    "| Name | Notes |\n| --- | --- |\n| A\tB | line 1 line 2 \\| \\<script\\> |");
});
test("ordinary prose is not converted and oversized tables fail explicitly", () => {
  assert.equal(spreadsheetTextToMarkdown("ordinary\nprose"), null);
  assert.throws(() => rowsToMarkdownTable(Array.from({ length: 201 }, () => ["a", "b"])), /200 rows/);
});
test("formatting inserts at the selection without losing surrounding text", () => {
  assert.deepEqual(formatSelection("Hello rider!", 6, 11, "bold"),
    { value: "Hello **rider**!", start: 6, end: 15 });
});