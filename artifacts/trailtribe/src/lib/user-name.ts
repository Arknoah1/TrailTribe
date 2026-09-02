type UserNameFields = {
  firstName?: string | null;
  lastName?: string | null;
};

/**
 * Treat the legacy auto-created "New User" value as incomplete so those
 * accounts are sent through the required name step instead of proceeding
 * with a placeholder identity.
 */
export function hasRequiredUserName(user: UserNameFields | null | undefined): boolean {
  const firstName = user?.firstName?.trim() ?? "";
  const lastName = user?.lastName?.trim() ?? "";

  if (!firstName || !lastName) return false;
  return !(firstName.toLowerCase() === "new" && lastName.toLowerCase() === "user");
}