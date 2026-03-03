import type { Request, Response, NextFunction } from "express";

// In-memory rate limiting per wallet/IP (replace with Redis in production)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    // Only rate limit the signature endpoint
    if (!req.path.includes("/mint/signature")) {
        next();
        return;
    }

    const key = (req.session?.wallet as string | undefined) ?? req.ip ?? "unknown";
    const now = Date.now();
    const entry = requestCounts.get(key);

    if (!entry || entry.resetAt < now) {
        requestCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
        next();
        return;
    }

    if (entry.count >= MAX_REQUESTS) {
        res.status(429).json({ error: "Too many requests. Try again in a minute." });
        return;
    }

    entry.count++;
    next();
}
