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