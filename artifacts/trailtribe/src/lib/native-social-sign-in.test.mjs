import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appSource = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), "../App.tsx"), "utf8");

test("social sign-in buttons are hidden only inside the native apps", () => {
  assert.match(appSource, /const hideSocialSignIn = Capacitor\.isNativePlatform\(\);/);
  assert.match(
    appSource,
    /\.\.\.\(hideSocialSignIn \? \{ socialButtonsRoot: "!hidden", dividerRow: "!hidden" \} : \{\}\)/,
  );
});
