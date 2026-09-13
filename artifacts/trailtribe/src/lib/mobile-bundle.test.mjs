import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { verifyMobileBundle } from "../../scripts/verify-mobile-bundle.mjs";

const startupFallback = `
<div id="root"></div>
<script>window.addEventListener("error", () => {});
window.addEventListener("unhandledrejection", () => {});
document.body.append("TrailTeam failed to start");</script>
<script type="module" src="/assets/index.js"></script>
`;

async function createBundle({ nativeIndex = startupFallback, nativeAsset = "app" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "trailteam-mobile-bundle-"));
  const webDir = path.join(root, "web");
  const nativeDir = path.join(root, "native");
  await mkdir(path.join(webDir, "assets"), { recursive: true });
  await mkdir(path.join(nativeDir, "assets"), { recursive: true });
  await writeFile(path.join(webDir, "index.html"), startupFallback);
  await writeFile(path.join(webDir, "assets", "index.js"), "app");
  await writeFile(path.join(nativeDir, "index.html"), nativeIndex);
  await writeFile(path.join(nativeDir, "assets", "index.js"), nativeAsset);
  return { root, webDir, nativeDir };
}

test("the mobile bundle verifier accepts a current native web bundle", async () => {
  const bundle = await createBundle();
  try {
    await assert.doesNotReject(() => verifyMobileBundle(bundle));
  } finally {
    await rm(bundle.root, { recursive: true, force: true });
  }
});

test("the mobile bundle verifier rejects a missing native entrypoint", async () => {
  const bundle = await createBundle();
  await rm(path.join(bundle.nativeDir, "index.html"));
  try {
    await assert.rejects(
      () => verifyMobileBundle(bundle),
      /native web entrypoint is missing/,
    );
  } finally {
    await rm(bundle.root, { recursive: true, force: true });
  }
});

test("the mobile bundle verifier rejects a blank native entrypoint", async () => {
  const bundle = await createBundle({ nativeIndex: " \n" });
  try {
    await assert.rejects(
      () => verifyMobileBundle(bundle),
      /native web entrypoint is blank/,
    );
  } finally {
    await rm(bundle.root, { recursive: true, force: true });
  }
});

test("the mobile bundle verifier rejects stale assets and development credentials", async () => {
  const bundle = await createBundle({ nativeAsset: "stale" });
  try {
    await assert.rejects(
      () => verifyMobileBundle(bundle),
      /does not match the current web build/,
    );

    await writeFile(path.join(bundle.webDir, "assets", "index.js"), "pk_test_123456789012");
    await writeFile(path.join(bundle.nativeDir, "assets", "index.js"), "pk_test_123456789012");
    await assert.rejects(
      () => verifyMobileBundle(bundle),
      /development Clerk key found/,
    );
  } finally {
    await rm(bundle.root, { recursive: true, force: true });
  }
});