export type LinkifiedTextSegment = {
  type: "text" | "link";
  value: string;
};

export function splitLinkifiedText(text: string): LinkifiedTextSegment[];