export type LinkifiedTextSegment = {
  type: "text" | "link";
  value: string;
};

export function splitLinkifiedText(text: string): LinkifiedTextSegment[];
export function firstLinkifiedUrl(text: string): string;