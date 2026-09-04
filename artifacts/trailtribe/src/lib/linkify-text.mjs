const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function trimTrailingPunctuation(candidate) {
  let url = candidate.replace(/[.,!?;:]+$/g, "");

  const pairs = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ];
  for (const [open, close] of pairs) {
    while (url.endsWith(close)) {
      const opens = [...url].filter((character) => character === open).length;
      const closes = [...url].filter((character) => character === close).length;
      if (closes <= opens) break;
      url = url.slice(0, -1);
    }
  }

  return url;
}

export function splitLinkifiedText(text) {
  const segments = [];
  let cursor = 0;
  const appendText = (value) => {
    if (!value) return;
    const previous = segments.at(-1);
    if (previous?.type === "text") previous.value += value;
    else segments.push({ type: "text", value });
  };

  for (const match of text.matchAll(HTTP_URL_PATTERN)) {
    const index = match.index ?? 0;
    const candidate = match[0];
    const url = trimTrailingPunctuation(candidate);

    if (index > cursor) {
      appendText(text.slice(cursor, index));
    }
    segments.push({ type: "link", value: url });

    const punctuation = candidate.slice(url.length);
    appendText(punctuation);
    cursor = index + candidate.length;
  }

  if (cursor < text.length || segments.length === 0) {
    appendText(text.slice(cursor));
  }

  return segments;
}