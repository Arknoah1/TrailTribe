import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(resolve(here, relativePath), "utf8");

const [app, recoveryUi, carpools, profile, clientFetch] = await Promise.all([
  readSource("../App.tsx"),
  readSource("../components/network-status.tsx"),
  readSource("carpools.tsx"),
  readSource("profile.tsx"),
  readFile(resolve(here, "../../../../lib/api-client-react/src/custom-fetch.ts"), "utf8"),
]);

test("mobile requests have a bounded deadline instead of loading forever", () => {
  assert.match(clientFetch, /DEFAULT_REQUEST_TIMEOUT_MS = 20_000/);
  assert.match(clientFetch, /export async function fetchWithTimeout/);
  assert.match(clientFetch, /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
});

test("a restored connection refreshes visible screen data", () => {
  assert.match(recoveryUi, /window\.addEventListener\("offline", markOffline\)/);
  assert.match(recoveryUi, /window\.addEventListener\("online", markOnline\)/);
  assert.match(recoveryUi, /queryClient\.refetchQueries\(\{ type: "active" \}\)/);
});

test("expired sessions are not retried as ordinary loading failures", () => {
  assert.match(app, /retry: \(failureCount, error\)/);
  assert.match(app, /status !== 401 && failureCount < 1/);
  assert.match(app, /function SessionExpiryHandler/);
  assert.match(app, /signOut\(\{ redirectUrl: `\$\{basePath\}\/sign-in` \}\)/);
});

test("carpool and household sections expose a recoverable failure state", () => {
  assert.match(carpools, /isError: offersError/);
  assert.match(carpools, /const retryCarpools/);
  assert.match(carpools, /<LoadErrorCard feature="carpools"/);
  assert.match(profile, /const \[ridersError, setRidersError\]/);
  assert.match(profile, /const \[complianceError, setComplianceError\]/);
  assert.match(profile, /feature="your household"/);
  assert.match(profile, /feature="your riders"/);
  assert.match(profile, /feature="season documents"/);
});