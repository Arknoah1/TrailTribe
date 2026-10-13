import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const pbxproj = await readFile(
  resolve(here, "../../ios/App/App.xcodeproj/project.pbxproj"),
  "utf8",
);

test("the iOS app targets iPhone only, so App Store Connect asks for no iPad screenshots", () => {
  const settings = pbxproj.match(/TARGETED_DEVICE_FAMILY = [^;]+;/g) ?? [];
  assert.ok(settings.length >= 2, "expected the Debug and Release app configurations");
  for (const setting of settings) {
    assert.equal(setting, "TARGETED_DEVICE_FAMILY = 1;");
  }
});
