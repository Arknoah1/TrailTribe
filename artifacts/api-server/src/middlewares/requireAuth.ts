import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
