import { Router } from "express";
import { SiweMessage } from "siwe";

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

        // Store the authenticated wallet in session
        req.session.wallet = result.data.address.toLowerCase();
        req.session.nonce = undefined; // clear nonce after use

        res.json({ ok: true, wallet: req.session.wallet });
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
    if (!req.session?.wallet) {
        res.status(401).json({ authenticated: false });
        return;
    }
    res.json({ authenticated: true, wallet: req.session.wallet });
});

export { router as authRouter };
