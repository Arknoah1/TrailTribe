import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const profile = await readFile(resolve(here, "profile.tsx"), "utf8");

test("the co-parent dialog offers email delivery and retains the copy-link alternative", () => {
  assert.match(profile, /useSendCoParentInvite/);
  assert.match(profile, /coParentInviteSchema/);
  assert.match(profile, /canInviteCoParent: boolean/);
  assert.match(profile, /canInviteCoParent=\{canManageOwnHousehold\(user\)\}/);
  assert.match(profile, /Only a responsible adult in this household can invite a parent or guardian\./);
  assert.match(profile, /id="co-parent-email"/);
  assert.match(profile, /Send invite/);
  assert.match(profile, /Or share the household link/);
  assert.match(profile, /navigator\.clipboard\.writeText\(inviteUrl\)/);
});

test("co-parent delivery gives a sender-visible success or failure result", () => {
  assert.match(profile, /Invitation emailed to \$\{email\}/);
  assert.match(profile, /You can still copy the link instead/);
  assert.match(profile, /sendCoParentInvite\.isPending/);
});

test("co-parent invitations are listed and can be managed", () => {
  assert.match(profile, /useListCoParentInvites/);
  assert.match(profile, /useCancelCoParentInvite/);
  assert.match(profile, /Pending and past invitations/);
  assert.match(profile, /button-cancel-invite/);
  assert.match(profile, /button-resend-invite/);
  assert.match(profile, /queryClient\.invalidateQueries/);
});