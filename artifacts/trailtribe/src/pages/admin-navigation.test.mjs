import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("./admin.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("./profile.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../components/layout.tsx", import.meta.url), "utf8");

const sections = [
  "roster",
  "approvals",
  "events",
  "season-builder",
  "seasons",
  "documents",
  "pods",
  "trailheads",
  "volunteer-templates",
  "settings",
];

test("Admin groups keep all ten existing sections reachable", () => {
  assert.match(admin, /const \[activeTab, setActiveTab\] = useState<AdminTab>\("roster"\)/);
  assert.match(admin, /const \[activeGroup, setActiveGroup\] = useState<AdminGroup>\("people"\)/);
  for (const section of sections) {
    assert.match(admin, new RegExp(`value: "${section}"`));
    assert.match(admin, new RegExp(`<TabsContent value="${section}"`));
  }
});

test("switching groups preserves a valid section and otherwise selects the first", () => {
  assert.match(admin, /ADMIN_GROUPS\[group\]\.some\(\(section\) => section\.value === activeTab\)/);
  assert.match(admin, /setActiveTab\(ADMIN_GROUPS\[group\]\[0\]\.value\)/);
});

test("Admin section controls use responsive grids without horizontal scrolling", () => {
  assert.match(admin, /activeGroup === "people"\s*\? "grid-cols-2"/);
  assert.match(admin, /activeGroup === "schedule"\s*\? "grid-cols-3"/);
  assert.match(admin, /"grid-cols-2 sm:grid-cols-5"/);
  assert.doesNotMatch(admin, /overflow-x-auto[\s\S]{0,600}admin-section-/);
});

test("guidance names the real desktop and mobile Admin locations", () => {
  assert.match(dashboard, /Admin appears in the desktop sidebar or the mobile overflow menu/);
  assert.doesNotMatch(profile, /Admin and Season Builder tabs/);
  assert.doesNotMatch(layout, /seasonBuilderNavItem/);
  assert.doesNotMatch(layout, /\bLayers\b/);
});