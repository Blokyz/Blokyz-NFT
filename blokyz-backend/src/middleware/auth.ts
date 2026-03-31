import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../routes/auth.js";

/**
 * Accepts either a session cookie OR a JWT Bearer token.
 * JWT is the primary path for cross-origin deployments (Brave/Safari block 3rd-party cookies).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    // 1. Session cookie (same-origin / permissive browsers)
    if (req.session?.wallet) return next();

    // 2. Authorization: Bearer <jwt> (cross-origin, privacy browsers)
    const authHeader = req.headers.authorization;
    console.log(`[auth] ${req.method} ${req.path} — session: ${!!req.session?.wallet} header: ${authHeader ? authHeader.slice(0, 30) + "…" : "none"}`);

    if (authHeader?.startsWith("Bearer ")) {
        const wallet = verifyToken(authHeader.slice(7));
        if (wallet) {
            req.session.wallet = wallet;
            return next();
        }
        console.log("[auth] JWT verification failed — invalid or expired token");
    }

    res.status(401).json({ error: "Not authenticated. Sign in with Ethereum first." });
}
