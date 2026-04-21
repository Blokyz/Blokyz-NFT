import { ethers } from "ethers";
import { prisma } from "../lib/prisma";

const NFT_ABI = [
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function totalSupply() view returns (uint256)",
    "function revealed() view returns (bool)",
];

const OWNER_SCAN_BATCH_SIZE = Number(process.env.OWNER_SCAN_BATCH_SIZE ?? "50");
const OWNER_SCAN_CACHE_TTL_MS = Number(process.env.OWNER_SCAN_CACHE_TTL_MS ?? "15000");

const providerCache = new Map<string, ethers.JsonRpcProvider>();
const contractCache = new Map<string, ethers.Contract>();
const ownershipCache = new Map<string, { tokenIds: number[]; fetchedAt: number; totalSupply: number }>();

function getProvider(): ethers.JsonRpcProvider {
    const chainId = process.env.CHAIN_ID ?? "11155111";
    const network = chainId === "1" ? "homestead" : "sepolia";
    const rpcUrl = `https://eth-${network}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
    const existing = providerCache.get(rpcUrl);
    if (existing) return existing;
    const created = new ethers.JsonRpcProvider(rpcUrl);
    providerCache.set(rpcUrl, created);
    return created;
}

function getNftContract(): ethers.Contract {
    const address = process.env.NFT_CONTRACT_ADDRESS;
    if (!address) throw new Error("NFT_CONTRACT_ADDRESS not configured");
    const normalizedAddress = address.toLowerCase();
    const existing = contractCache.get(normalizedAddress);
    if (existing) return existing;
    const created = new ethers.Contract(address, NFT_ABI, getProvider());
    contractCache.set(normalizedAddress, created);
    return created;
}

export async function getPublishedTokenIds(): Promise<number[]> {
    const rows = await prisma.publishedToken.findMany({
        orderBy: { tokenId: "asc" },
        select: { tokenId: true },
    });
    return rows.map((row) => row.tokenId);
}

export async function isCollectionRevealLive(): Promise<boolean> {
    const contract = getNftContract();
    return Boolean(await contract.revealed());
}

export async function isOwnerOfToken(tokenId: number, wallet: string): Promise<boolean> {
    const contract = getNftContract();
    const owner = String(await contract.ownerOf(tokenId)).toLowerCase();
    return owner === wallet.toLowerCase();
}

export async function publishToken(tokenId: number, wallet: string): Promise<{ tokenId: number; publisher: string; created: boolean }> {
    const normalizedWallet = wallet.toLowerCase();
    const existing = await prisma.publishedToken.findUnique({ where: { tokenId } });
    if (existing) {
        return { tokenId: existing.tokenId, publisher: existing.publisher, created: false };
    }

    const created = await prisma.publishedToken.create({
        data: {
            tokenId,
            publisher: normalizedWallet,
        },
    });
    return { tokenId: created.tokenId, publisher: created.publisher, created: true };
}

export async function getOwnedTokenIdsByWallet(wallet: string): Promise<number[]> {
    const contract = getNftContract();
    const normalized = wallet.toLowerCase();
    const totalSupply = Number(await contract.totalSupply());
    const now = Date.now();
    const cached = ownershipCache.get(normalized);
    if (
        cached &&
        now - cached.fetchedAt < OWNER_SCAN_CACHE_TTL_MS &&
        cached.totalSupply === totalSupply
    ) {
        return cached.tokenIds;
    }

    // Contract is not ERC721Enumerable, so derive ownership via ownerOf scan.
    const owned: number[] = [];
    for (let start = 1; start <= totalSupply; start += OWNER_SCAN_BATCH_SIZE) {
        const end = Math.min(totalSupply, start + OWNER_SCAN_BATCH_SIZE - 1);
        const batch = Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
        const ownershipResults = await Promise.all(
            batch.map(async (tokenId) => {
                try {
                    const owner = String(await contract.ownerOf(tokenId)).toLowerCase();
                    return owner === normalized ? tokenId : null;
                } catch {
                    // Skip non-existent / inaccessible token IDs defensively.
                    return null;
                }
            })
        );
        for (const tokenId of ownershipResults) {
            if (tokenId !== null) owned.push(tokenId);
        }
    }

    ownershipCache.set(normalized, {
        tokenIds: owned,
        fetchedAt: now,
        totalSupply,
    });
    return owned;
}
