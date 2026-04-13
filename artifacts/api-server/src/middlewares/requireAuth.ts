import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

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
