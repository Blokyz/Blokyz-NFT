import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
    getPublishedTokenIds,
    getOwnedTokenIdsByWallet,
    isCollectionRevealLive,
    isOwnerOfToken,
    publishToken,
} from "../services/profileService.js";

const router = Router();

router.get("/published", async (_req, res) => {
    try {
        const tokenIds = await getPublishedTokenIds();
        res.json({ tokenIds });
    } catch (err) {
        console.error("[profile] failed to fetch published tokens:", err);
        res.status(500).json({ error: "Failed to fetch published tokens" });
    }
});

router.get("/owned", requireAuth, async (req, res) => {
    const wallet = String(req.session.wallet ?? "").toLowerCase();
    if (!wallet) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }
    try {
        const tokenIds = await getOwnedTokenIdsByWallet(wallet);
        res.json({ tokenIds });
    } catch (err) {
        console.error("[profile] failed to fetch owned tokens:", err);
        res.status(500).json({ error: "Failed to fetch owned NFTs" });
    }
});

router.post("/publish", requireAuth, async (req, res) => {
    const wallet = String(req.session.wallet ?? "").toLowerCase();
    if (!wallet) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }
    const tokenId = Number(req.body?.tokenId);

    if (!Number.isInteger(tokenId) || tokenId <= 0) {
        res.status(400).json({ error: "tokenId must be a positive integer" });
        return;
    }

    try {
        const revealLive = await isCollectionRevealLive();
        if (!revealLive) {
            res.status(403).json({ error: "On-chain reveal is not active yet" });
            return;
        }

        const ownsToken = await isOwnerOfToken(tokenId, wallet);
        if (!ownsToken) {
            res.status(403).json({ error: "Only the current token owner can publish this NFT" });
            return;
        }

        const result = await publishToken(tokenId, wallet);
        res.json({
            ok: true,
            tokenId: result.tokenId,
            publisher: result.publisher,
            alreadyPublished: !result.created,
        });
    } catch (err) {
        console.error("[profile] publish failed:", err);
        res.status(500).json({ error: "Failed to publish NFT" });
    }
});

export { router as profileRouter };
