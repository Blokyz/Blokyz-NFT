import { Router } from "express";
import { resolveWallet } from "../services/delegateService.js";
import { getWalletEntry, isTierEligible, Tier } from "../services/whitelistService.js";
import { getCurrentPhase, getPhaseInfo, getMintedCount } from "../services/phaseService.js";
import { generateMintSignature, Phase } from "../services/signerService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── GET /mint/phase ───────────────────────────────────────────────────────────
// Returns current phase info + timing
router.get("/phase", async (_req, res) => {
    try {
        const phase = await getCurrentPhase();
        const info = await getPhaseInfo(phase);
        res.json({
            ...info,
            price: info.price.toString(), // bigint → string for JSON
        });
    } catch (err) {
        console.error("[mint] phase error:", err);
        res.status(500).json({ error: "Failed to fetch phase info" });
    }
});

// ── POST /mint/signature ──────────────────────────────────────────────────────
// Core endpoint: validates eligibility, resolves delegate, returns signed payload
router.post("/signature", requireAuth, async (req, res) => {
    const hotWallet = req.session.wallet as string;

    try {
        // 1. Get current phase
        const phase = await getCurrentPhase();

        if (phase === Phase.NONE) {
            res.status(403).json({ error: "No active mint phase" });
            return;
        }

        // 2. Resolve delegate.xyz — vault wallet used for whitelist check
        const resolvedWallet = await resolveWallet(hotWallet);
        const isDelegated = resolvedWallet !== hotWallet;

        // 3. Get phase info (always needed for price) + whitelist check
        const phaseInfo = await getPhaseInfo(phase);
        let maxAlloc: number;

        if (phase === Phase.PUBLIC) {
            // Anyone can mint — use phase walletCap
            maxAlloc = phaseInfo.walletCap;
        } else {
            // GTD_FREE, GTD_MINT, WL_FCFS — must be on the list
            const entry = await getWalletEntry(resolvedWallet);

            if (!entry) {
                res.status(403).json({
                    error: isDelegated
                        ? `Vault wallet ${resolvedWallet} is not on the allowlist`
                        : "Wallet is not on the allowlist",
                });
                return;
            }

            // Check tier eligibility for current phase
            const requiredTier =
                phase === Phase.GTD_FREE ? Tier.GTD_FREE :
                phase === Phase.GTD_MINT ? Tier.GTD_MINT :
                Tier.WL; // WL_FCFS

            if (!isTierEligible(entry, requiredTier)) {
                res.status(403).json({ error: `Wallet tier '${entry.tier}' not eligible for current phase` });
                return;
            }

            maxAlloc = entry.maxAlloc;
        }

        // 4. Check on-chain mint count (hot wallet = msg.sender = what contract tracks)
        const alreadyMinted = await getMintedCount(phase, hotWallet);
        const remaining = maxAlloc - alreadyMinted;

        if (remaining <= 0) {
            res.status(403).json({ error: "Allocation fully used" });
            return;
        }

        // 5. Generate signature for hot wallet (msg.sender in contract)
        const payload = await generateMintSignature(hotWallet, phase, maxAlloc);

        res.json({
            ...payload,
            phase: Number(payload.phase),
            price: phaseInfo.price.toString(), // always use fresh on-chain price
            resolvedWallet: isDelegated ? resolvedWallet : undefined,
            alreadyMinted,
            remaining,
        });
    } catch (err) {
        console.error("[mint] signature error:", err);
        res.status(500).json({ error: "Failed to generate signature" });
    }
});

export { router as mintRouter };
