import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "layout.tsx"),
  "utf8",
);

test("the mobile actions menu keeps notifications visible while grouping account controls", () => {
  assert.match(source, /<NotificationBell\s*\/>/);
  assert.match(source, /<DropdownMenu>/);
  assert.match(source, /<MoreHorizontal className="h-5 w-5"\s*\/>/);
  assert.match(source, /rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground data-\[state=open\]:bg-secondary data-\[state=open\]:text-primary transition-colors/);
  assert.match(source, /onSelect=\{\(\) => navigate\("\/profile"\)\}/);
  assert.match(source, /\{showAdminTabs && \(/);
  assert.match(source, /onSelect=\{toggleTheme\}/);
});

test("the mobile bottom bar replaces Profile with the existing Volunteer destination", () => {
  assert.match(source, /href: "\/profile\?tab=volunteer"/);
  assert.match(source, /label: "Volunteer"/);
  assert.match(source, /const mobileItems = \[\.\.\.baseNavItems\.slice\(0, 4\), volunteerNavItem\]/);
  assert.doesNotMatch(source, /const mobileItems = baseNavItems/);
});

test("the Volunteer tab stays highlighted and the bottom-nav safe area remains measured", () => {
  assert.match(source, /getPathname\(location\) === "\/profile" && new URLSearchParams\(search\)\.get\("tab"\) === "volunteer"/);
  assert.match(source, /--mobile-bottom-nav-height/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
});