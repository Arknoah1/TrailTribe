import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "admin.tsx"),
  "utf8",
);

test("admin privileged controls require the super_admin role", () => {
  assert.match(source, /useGetMe/);
  assert.match(source, /const isSuperAdmin = .*role.*=== "super_admin"/);
  assert.match(source, /\{isSuperAdmin && \(\s*<Button[\s\S]*?Manage Household/);
  assert.match(source, /\{isSuperAdmin && <AlertDialog open=\{deleteConfirmId !== null\}/);
  assert.match(source, /\{isSuperAdmin && <Card id="account-cleanup">/);
  assert.match(source, /isSuperAdmin \? "Configure how your team appears/);
  assert.match(source, /Staff Access/);
  assert.match(source, /Make super admin/);
  assert.match(source, /The last super admin cannot be demoted/);
});

test("coaches retain archive and restore controls", () => {
  assert.match(source, /onClick=\{\(\) => setArchiveConfirmId\(household\.id\)\}/);
  assert.match(source, /onClick=\{\(\) => handleUnarchiveFamily\(household\.id\)\}/);
  assert.match(source, /Staff roles are super-admin only/);
});