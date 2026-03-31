import { Router } from "express";
import { SiweMessage } from "siwe";
import jwt from "jsonwebtoken";

function jwtSecret(): string {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error("JWT_SECRET env var not set");
    return s;
}

function signToken(wallet: string): string {
    return jwt.sign({ wallet }, jwtSecret(), { expiresIn: "24h" });
}

export function verifyToken(token: string): string | null {
    try {
        const payload = jwt.verify(token, jwtSecret()) as { wallet: string };
        return payload.wallet;
    } catch {
        return null;
    }
}

const router = Router();

// ── POST /auth/nonce ─────────────────────────────────────────────────────────
// Returns a random nonce the frontend must include in their SIWE message
router.get("/nonce", (req, res) => {
    const nonce = Math.random().toString(36).slice(2);
    req.session.nonce = nonce;
    res.json({ nonce });
});

// ── POST /auth/verify ────────────────────────────────────────────────────────
// Verifies the signed SIWE message and creates a session
router.post("/verify", async (req, res) => {
    try {
        const { message, signature } = req.body as { message: string; signature: string };

        if (!message || !signature) {
            res.status(400).json({ error: "message and signature are required" });
            return;
        }

        const siweMessage = new SiweMessage(message);
        const result = await siweMessage.verify({
            signature,
            nonce: req.session.nonce as string | undefined,
        });

        if (!result.success) {
            res.status(401).json({ error: "Invalid SIWE signature" });
            return;
        }

        const wallet = result.data.address.toLowerCase();
        req.session.wallet = wallet;
        req.session.nonce = undefined;

        const token = signToken(wallet);
        res.json({ ok: true, wallet, token });
    } catch (err) {
        console.error("[auth] verify error:", err);
        res.status(401).json({ error: "Authentication failed" });
    }
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ ok: true });
    });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get("/me", (req, res) => {
    // Check session first, then JWT header
    const sessionWallet = req.session?.wallet as string | undefined;
    if (sessionWallet) {
        res.json({ authenticated: true, wallet: sessionWallet });
        return;
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        const wallet = verifyToken(authHeader.slice(7));
        if (wallet) {
            res.json({ authenticated: true, wallet });
            return;
        }
    }

    res.status(401).json({ authenticated: false });
});

export { router as authRouter };
