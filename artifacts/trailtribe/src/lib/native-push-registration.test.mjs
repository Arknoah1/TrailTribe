import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const nativeSource = await readFile(resolve(here, "native-app.ts"), "utf8");
const workflowDir = resolve(here, "../../../../.github/workflows");

test("push registration is gated on a build-time Firebase flag, asks permission, then registers", () => {
  assert.match(nativeSource, /const PUSH_ENABLED = import\.meta\.env\.VITE_PUSH_ENABLED === "true";/);
  const body = nativeSource.slice(nativeSource.indexOf("const registerPush = async () => {"));
  assert.match(body, /if \(!PUSH_ENABLED\) return;/);
  assert.ok(
    body.indexOf("checkPermissions()") < body.indexOf("requestPermissions()")
      && body.indexOf("requestPermissions()") < body.indexOf("PushNotifications.register()"),
    "permission must be checked and requested before register()",
  );
  assert.match(body, /permission\.receive !== "granted"/);
});

for (const workflow of ["android-release-aab.yml", "android-debug-apk.yml", "ios-testflight.yml"]) {
  test(`${workflow} enables push only when it writes Firebase config`, async () => {
    const yml = await readFile(resolve(workflowDir, workflow), "utf8");
    const step = yml.slice(yml.indexOf("Write Firebase config for push notifications"));
    const flag = step.indexOf('echo "VITE_PUSH_ENABLED=true" >> "$GITHUB_ENV"');
    assert.ok(flag > 0, "workflow must export VITE_PUSH_ENABLED");
    // The export sits in the branch that wrote the config file, before the
    // build step that bakes the flag into the web bundle.
    assert.ok(flag < step.indexOf("Build web app and sync into native project"));
    assert.ok(flag < step.indexOf("not set"));
  });
}
