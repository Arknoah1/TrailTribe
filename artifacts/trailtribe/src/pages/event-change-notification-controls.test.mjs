import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const eventDetail = await readFile(new URL("./event-detail.tsx", import.meta.url), "utf8");
const admin = await readFile(new URL("./admin.tsx", import.meta.url), "utf8");

test("event-detail edits default to notifying and reset on every open", () => {
  assert.match(eventDetail, /const \[notifyFamilies, setNotifyFamilies\] = useState\(true\)/);
  assert.match(eventDetail, /const openEdit = \(\) => \{[\s\S]*setNotifyFamilies\(true\)[\s\S]*setShowEdit\(true\)/);
  assert.match(eventDetail, /notifyFamilies,/);
  assert.match(eventDetail, /Notify families about these changes/);
});

test("admin event and series edits default to notifying but send explicit choices", () => {
  assert.match(admin, /notifyFamilies: true/);
  assert.match(admin, /notifyFamilies: editingEventData\.notifyFamilies !== false/);
  assert.match(admin, /notifyFamilies: shiftNotifyFamilies\[seriesId\] !== false/);
  assert.match(admin, /checked=\{shiftNotifyFamilies\[sid\] !== false\}/);
  assert.match(admin, /delete n\[seriesId\]/);
});