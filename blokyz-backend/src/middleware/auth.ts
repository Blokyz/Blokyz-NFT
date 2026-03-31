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
    if (authHeader?.startsWith("Bearer ")) {
        const wallet = verifyToken(authHeader.slice(7));
        if (wallet) {
            req.session.wallet = wallet; // hydrate session for downstream handlers
            return next();
        }
    }

    res.status(401).json({ error: "Not authenticated. Sign in with Ethereum first." });
}
