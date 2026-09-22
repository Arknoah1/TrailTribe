import type { User } from "@workspace/api-client-react";

export type UserRole = "super_admin" | "coach" | "parent" | "student";
export type UserRoleSource = Pick<User, "role"> & { roles?: UserRole[] };

export function hasUserRole(user: UserRoleSource | null | undefined, role: UserRole): boolean {
  if (!user) return false;
  return user.role === role || user.roles?.includes(role) === true;
}

export function isOperationalStaff(user: UserRoleSource | null | undefined): boolean {
  return hasUserRole(user, "coach") || hasUserRole(user, "super_admin");
}

export function isStudentOnly(user: UserRoleSource | null | undefined): boolean {
  return hasUserRole(user, "student") && !isOperationalStaff(user) && !hasUserRole(user, "parent");
}

export function canManageOwnHousehold(user: UserRoleSource | null | undefined): boolean {
  return hasUserRole(user, "parent") || isOperationalStaff(user);
}