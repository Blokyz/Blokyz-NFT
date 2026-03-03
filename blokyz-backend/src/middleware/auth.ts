import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that requires a valid SIWE session.
 * Attaches req.session.wallet (the authenticated hot wallet) to the request.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.session?.wallet) {
        res.status(401).json({ error: "Not authenticated. Sign in with Ethereum first." });
        return;
    }
    next();
}
