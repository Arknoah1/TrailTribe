import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type ApprovalUser = {
  role: string | null;
  householdId: number | null;
  approved: boolean;
};

/**
 * Students are created by a household member, rather than self-onboarding.
 * A household link is therefore the approval signal for student-safe routes.
 * Do not broaden this to any user with a household: parents still require
 * coach approval.
 */
export function hasStudentAccess(user: ApprovalUser): boolean {
  return user.role === "student" && user.householdId != null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkUserId = userId;
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  (req as any).clerkUserId = auth?.userId ?? null;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkUserId = clerkUserId;
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden: admin role required" });
    return;
  }
  next();
}

export async function requireCoachOrAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkUserId = clerkUserId;
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!user || (user.role !== "coach" && user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden: coach or admin role required" });
    return;
  }
  next();
}

/**
 * Like requireAuth but also enforces that the user has been approved by a coach.
 * Use on endpoints that expose sensitive team-wide data (rosters, messages, events, etc.)
 * so that newly-registered users cannot read team PII before vetting.
 */
export async function requireApproved(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkUserId = clerkUserId;
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!user.approved && !hasStudentAccess(user)) {
    res.status(403).json({ error: "Forbidden: your account is pending coach approval" });
    return;
  }
  // Repair linked student rows created before student approval was persisted.
  // This is intentionally limited to student rows with a household link.
  if (!user.approved && hasStudentAccess(user)) {
    await db.update(usersTable).set({ approved: true }).where(eq(usersTable.id, user.id));
  }
  next();
}
