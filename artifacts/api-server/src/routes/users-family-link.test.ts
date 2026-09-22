import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("household family-link redemption", () => {
  it("requires the household to still be active before granting membership", async () => {
    const source = await readFile(new URL("./users.ts", import.meta.url), "utf8");

    expect(source).toMatch(
      /where: and\(\s*eq\(householdsTable\.inviteCode, inviteCode\),\s*isNull\(householdsTable\.archivedAt\)/,
    );
    expect(source).toMatch(
      /if \(!household \|\| household\.archivedAt\) \{ res\.status\(404\)\.json\(\{ error: "Invalid invite code" \}\)/,
    );
  });
});

describe("combined parent responsibilities", () => {
  it("keeps parent-only enrollment and role filters available to a primary coach", async () => {
    const source = await readFile(new URL("./users.ts", import.meta.url), "utf8");

    expect(source).toMatch(
      /if \(!hasUserRole\(user, "parent"\)\) \{ res\.status\(403\)\.json\(\{ error: "Only parents can re-enroll" \}\)/,
    );
    expect(source).toMatch(
      /if \(role\) conditions\.push\(sql`\$\{role\} = ANY\(\$\{usersTable\.roles\}\)`\)/,
    );
  });
});