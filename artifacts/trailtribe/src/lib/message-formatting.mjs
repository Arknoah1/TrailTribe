/** Convert clipboard cells to safe, editable GFM, never clipboard HTML. */
export function rowsToMarkdownTable(rows) {
  if (!rows.length) return null;
  const columns = Math.max(...rows.map(row => row.length));
  if (columns < 2) return null;
  if (rows.length > 200 || columns > 40) throw new Error("Paste up to 200 rows and 40 columns at a time.");
  const escape = value => String(value ?? "").trim()
    .replace(/\\/g, "\\\\")
    .replace(/([|*_[\]`<>])/g, "\\$1")
    .replace(/\r?\n/g, " ");
  const line = row => `| ${Array.from({ length: columns }, (_, index) => escape(row[index])).join(" | ")} |`;
  return [line(rows[0]), line(Array(columns).fill("---")), ...rows.slice(1).map(line),
    ...(rows.length === 1 ? [line([])] : [])].join("\n");
}

export function spreadsheetTextToMarkdown(text) {
  if (!text.includes("\t")) return null;
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"' && (quoted || cell === "")) {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (character === "\t" || character === "\n" || character === "\r")) {
      row.push(cell); cell = "";
      if (character !== "\t") {
        rows.push(row); row = [];
        if (character === "\r" && text[index + 1] === "\n") index++;
      }
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rowsToMarkdownTable(rows);
}

export function formatSelection(value, start, end, action, linkUrl = "https://example.com") {
  const blockAction = ["heading", "bullets", "numbers"].includes(action);
  if (blockAction) {
    start = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
    const endProbe = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const nextLine = value.indexOf("\n", endProbe);
    end = nextLine < 0 ? value.length : nextLine;
  }
  const selected = value.slice(start, end);
  const lines = (selected || (action === "heading" ? "Heading" : "List item"))
    .split("\n").map(line => line.replace(/^\s*(?:#{1,6}|[-*+]|\d+\.)\s+/, ""));
  const replacements = {
    bold: selected.startsWith("**") && selected.endsWith("**") && selected.length > 4 ? selected.slice(2, -2) : `**${selected || "bold text"}**`,
    italic: selected.startsWith("*") && selected.endsWith("*") && !selected.startsWith("**") && selected.length > 2 ? selected.slice(1, -1) : `*${selected || "italic text"}*`,
    heading: lines.map(line => line ? `## ${line}` : "").join("\n"),
    bullets: lines.map(line => line ? `- ${line}` : "").join("\n"),
    numbers: lines.map((line, index) => line ? `${index + 1}. ${line}` : "").join("\n"),
    link: `[${(selected || "Link text").replace(/[\[\]]/g, "\\$&")}](<${linkUrl.replace(/>/g, "%3E")}>)`,
    table: "\n\n| Rider | Lap 1 | Lap 2 |\n| --- | --- | --- |\n| Name | 00:00 | 00:00 |\n\n",
  };
  const replacement = replacements[action] ?? action;
  return { value: value.slice(0, start) + replacement + value.slice(end), start, end: start + replacement.length };
}

/** Don't request website previews for Markdown images or raw HTML. */
export function messageLinkPreviewText(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\](?:\[[^\]]*\])?/g, "")
    .replace(/^\s*\[[^\]]+\]:.*$/gm, "")
    .replace(/<[^>]*>/g, tag => /^<(?:https?:\/\/|mailto:)/i.test(tag) ? tag.slice(1, -1) : "");
}