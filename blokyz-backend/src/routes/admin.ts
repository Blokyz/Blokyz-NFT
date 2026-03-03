import { Router } from "express";
import { upsertWallet, removeWallet, listWallets, Tier } from "../services/whitelistService.js";
import { getSignerAddress } from "../services/signerService.js";

const router = Router();

// Simple admin key check — replace with proper admin session/role in production
function requireAdmin(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void {
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
        res.status(403).json({ error: "Forbidden" });
        return;
    }
    next();
}

router.use(requireAdmin);

// ── GET /admin/whitelist ──────────────────────────────────────────────────────
router.get("/whitelist", async (_req, res) => {
    try {
        const wallets = await listWallets();
        res.json({ count: wallets.length, wallets });
    } catch (err) {
        res.status(500).json({ error: "Failed to list wallets" });
    }
});

// ── POST /admin/whitelist ─────────────────────────────────────────────────────
// Body: { address, tier: "GTD"|"WL", maxAlloc, notes? }
router.post("/whitelist", async (req, res) => {
    const { address, tier, maxAlloc, notes } = req.body as {
        address: string;
        tier: string;
        maxAlloc: number;
        notes?: string;
    };

    if (!address || !tier || maxAlloc === undefined) {
        res.status(400).json({ error: "address, tier, and maxAlloc are required" });
        return;
    }

    if (!Object.values(Tier).includes(tier as Tier)) {
        res.status(400).json({ error: `tier must be one of: ${Object.values(Tier).join(", ")}` });
        return;
    }

    try {
        const entry = await upsertWallet(address, tier as Tier, maxAlloc, notes);
        res.json({ ok: true, entry });
    } catch (err) {
        console.error("[admin] upsert error:", err);
        res.status(500).json({ error: "Failed to add wallet" });
    }
});

// ── DELETE /admin/whitelist ───────────────────────────────────────────────────
// Body: { address }
router.delete("/whitelist", async (req, res) => {
    const { address } = req.body as { address: string };
    if (!address) {
        res.status(400).json({ error: "address is required" });
        return;
    }
    try {
        await removeWallet(address);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to remove wallet" });
    }
});

// ── GET /admin/signer ─────────────────────────────────────────────────────────
// Verify the signer address matches what's in the contract
router.get("/signer", (_req, res) => {
    try {
        const address = getSignerAddress();
        res.json({ signerAddress: address });
    } catch (err) {
        res.status(500).json({ error: "SIGNER_PRIVATE_KEY not configured" });
    }
});

export { router as adminRouter };
