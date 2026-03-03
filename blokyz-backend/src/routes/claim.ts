import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";

const router = Router();
const prisma = new PrismaClient();

const NFT_ABI = [
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
];

function getNFTContract() {
    const chainId = process.env.CHAIN_ID ?? "11155111";
    const network = chainId === "1" ? "homestead" : "sepolia";
    const provider = new ethers.JsonRpcProvider(
        `https://eth-${network}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    );
    return new ethers.Contract(process.env.NFT_CONTRACT_ADDRESS!, NFT_ABI, provider);
}

// ── GET /claim ────────────────────────────────────────────────────────────────
// Get claim status for all tokens owned by the authenticated wallet
router.get("/", async (req, res) => {
    const wallet = req.session.wallet as string;
    try {
        const claims = await prisma.claimRecord.findMany({
            where: { wallet: wallet.toLowerCase() },
            orderBy: { tokenId: "asc" },
        });
        res.json({ wallet, claims });
    } catch (err) {
        console.error("[claim] GET error:", err);
        res.status(500).json({ error: "Failed to fetch claims" });
    }
});

// ── GET /claim/:tokenId ────────────────────────────────────────────────────────
router.get("/:tokenId", async (req, res) => {
    const tokenId = parseInt(req.params.tokenId ?? "0");
    if (isNaN(tokenId)) {
        res.status(400).json({ error: "Invalid tokenId" });
        return;
    }
    try {
        const claim = await prisma.claimRecord.findUnique({ where: { tokenId } });
        if (!claim) {
            res.status(404).json({ error: "Claim record not found" });
            return;
        }
        res.json(claim);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch claim" });
    }
});

// ── POST /claim/submit ────────────────────────────────────────────────────────
// Submit shipping info for a token. Re-verifies ownership on-chain.
router.post("/submit", async (req, res) => {
    const wallet = req.session.wallet as string;
    const { tokenId, name, email, shippingAddress, country } = req.body as {
        tokenId: number;
        name: string;
        email: string;
        shippingAddress: string;
        country: string;
    };

    if (!tokenId || !name || !email || !shippingAddress || !country) {
        res.status(400).json({ error: "tokenId, name, email, shippingAddress, country are required" });
        return;
    }

    try {
        // Re-verify token ownership on-chain (never trust session alone)
        const nft = getNFTContract();
        const owner = await nft.ownerOf(tokenId) as string;
        if (owner.toLowerCase() !== wallet.toLowerCase()) {
            res.status(403).json({ error: "You do not own this token" });
            return;
        }

        const claim = await prisma.claimRecord.upsert({
            where: { tokenId },
            update: {
                name, email, shippingAddress, country,
                status: "SUBMITTED",
                submittedAt: new Date(),
                wallet: wallet.toLowerCase(),
            },
            create: {
                tokenId, name, email, shippingAddress, country,
                status: "SUBMITTED",
                submittedAt: new Date(),
                wallet: wallet.toLowerCase(),
            },
        });

        res.json({ ok: true, claim });
    } catch (err) {
        console.error("[claim] submit error:", err);
        res.status(500).json({ error: "Failed to submit claim" });
    }
});

export { router as claimRouter };
