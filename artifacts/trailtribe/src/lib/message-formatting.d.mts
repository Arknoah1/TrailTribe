export function rowsToMarkdownTable(rows: string[][]): string | null;
export function spreadsheetTextToMarkdown(text: string): string | null;
export function validateMessageLink(address: string): string;
export function formatSelection(value: string, start: number, end: number, action: string, linkUrl?: string): {
  value: string; start: number; end: number;
};
export function messageLinkPreviewText(text: string): string;