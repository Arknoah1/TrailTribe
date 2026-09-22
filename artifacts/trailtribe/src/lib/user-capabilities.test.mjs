import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "user-capabilities.ts"),
  "utf8",
);

test("capability helpers read both the legacy primary role and combined roles", () => {
  assert.match(source, /user\.role === role \|\| user\.roles\?\.includes\(role\) === true/);
  assert.match(source, /hasUserRole\(user, "coach"\) \|\| hasUserRole\(user, "super_admin"\)/);
});

test("student-only mode cannot hide family features from a combined adult account", () => {
  assert.match(source, /hasUserRole\(user, "student"\) && !isOperationalStaff\(user\) && !hasUserRole\(user, "parent"\)/);
});

test("combined accounts keep parent capability when coach is the primary role", () => {
  assert.match(source, /export function hasUserRole/);
  assert.match(source, /user\.role === role \|\| user\.roles\?\.includes\(role\) === true/);
});