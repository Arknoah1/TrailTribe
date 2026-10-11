import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const appSource = await readFile(resolve(here, "../App.tsx"), "utf8");
const nativeSource = await readFile(resolve(here, "native-app.ts"), "utf8");

test("native apps expose the installed version and build code", () => {
  assert.match(nativeSource, /export function useNativeBuildLabel\(\): string \| null/);
  assert.match(nativeSource, /App\.getInfo\(\)/);
  assert.match(nativeSource, /`\$\{version\} \(\$\{build\}\)`/);
  // Web visitors must never see a build label.
  assert.match(nativeSource, /if \(!Capacitor\.isNativePlatform\(\)\) return;\n\s+let disposed = false;\n\s+App\.getInfo/);
});

test("the build label is shown under the policy links on the sign-in and sign-up screens", () => {
  assert.match(appSource, /const buildLabel = useNativeBuildLabel\(\);/);
  assert.match(appSource, /data-testid="text-app-build"/);
  assert.match(appSource, /App version \{buildLabel\}/);
});
