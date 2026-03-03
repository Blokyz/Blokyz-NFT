import { Router } from "express";
import { resolveWallet } from "../services/delegateService.js";
import { getWalletEntry, isTierEligible, Tier } from "../services/whitelistService.js";
import { getCurrentPhase, getPhaseInfo, getMintedCount } from "../services/phaseService.js";
import { Phase } from "../services/signerService.js";

const router = Router();

// ── GET /eligibility ──────────────────────────────────────────────────────────
// Check wallet eligibility for the current phase (no side effects)
router.get("/", async (req, res) => {
    const hotWallet = req.session.wallet as string;

    try {
        const phase = await getCurrentPhase();

        if (phase === Phase.NONE) {
            res.json({ eligible: false, reason: "No active mint phase" });
            return;
        }

        const phaseInfo = await getPhaseInfo(phase);
        const resolvedWallet = await resolveWallet(hotWallet);
        const isDelegated = resolvedWallet !== hotWallet;

        // PUBLIC phase — everyone eligible
        if (phase === Phase.PUBLIC) {
            const minted = await getMintedCount(phase, hotWallet);
            const remaining = phaseInfo.walletCap - minted;
            res.json({
                eligible: remaining > 0,
                phase: Phase[phase],
                resolvedWallet: isDelegated ? resolvedWallet : undefined,
                alreadyMinted: minted,
                remaining,
                walletCap: phaseInfo.walletCap,
                price: phaseInfo.price.toString(),
            });
            return;
        }

        // GTD / WL phases — need allowlist entry
        const entry = await getWalletEntry(resolvedWallet);
        if (!entry) {
            res.json({
                eligible: false,
                reason: isDelegated
                    ? `Vault wallet ${resolvedWallet} is not on the allowlist`
                    : "Wallet is not on the allowlist",
                resolvedWallet: isDelegated ? resolvedWallet : undefined,
            });
            return;
        }

        const requiredTier = phase === Phase.GTD_FREE || phase === Phase.GTD_MINT ? Tier.GTD : Tier.WL;
        if (!isTierEligible(entry, requiredTier)) {
            res.json({ eligible: false, reason: `Wallet tier '${entry.tier}' not eligible for ${Phase[phase]}` });
            return;
        }

        const minted = await getMintedCount(phase, hotWallet);
        const remaining = entry.maxAlloc - minted;

        res.json({
            eligible: remaining > 0,
            phase: Phase[phase],
            tier: entry.tier,
            resolvedWallet: isDelegated ? resolvedWallet : undefined,
            alreadyMinted: minted,
            remaining,
            maxAlloc: entry.maxAlloc,
            price: phaseInfo.price.toString(),
        });
    } catch (err) {
        console.error("[eligibility] error:", err);
        res.status(500).json({ error: "Failed to check eligibility" });
    }
});

export { router as eligibilityRouter };
