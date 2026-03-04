import { Tier } from "@prisma/client";
import { prisma } from "../lib/prisma";

export { Tier };

export interface WalletAllocation {
    address: string;
    tier: Tier;
    maxAlloc: number;
    active: boolean;
}

/**
 * Look up a wallet in the allowlist.
 * Returns null if not found or inactive.
 */
export async function getWalletEntry(address: string): Promise<WalletAllocation | null> {
    const entry = await prisma.walletEntry.findUnique({
        where: { address: address.toLowerCase() },
    });

    if (!entry || !entry.active) return null;
    return entry;
}

/**
 * Check if a wallet is eligible for a given tier.
 * GTD wallets are eligible for both GTD and WL phases.
 */
export function isTierEligible(entry: WalletAllocation, requiredTier: Tier): boolean {
    if (requiredTier === Tier.WL) {
        return entry.tier === Tier.GTD || entry.tier === Tier.WL;
    }
    return entry.tier === Tier.GTD;
}

/**
 * Add or update a wallet in the allowlist.
 */
export async function upsertWallet(
    address: string,
    tier: Tier,
    maxAlloc: number,
    notes?: string
): Promise<WalletAllocation> {
    return prisma.walletEntry.upsert({
        where: { address: address.toLowerCase() },
        update: { tier, maxAlloc, active: true, notes },
        create: { address: address.toLowerCase(), tier, maxAlloc, notes },
    });
}

/**
 * Deactivate a wallet (soft delete).
 */
export async function removeWallet(address: string): Promise<void> {
    await prisma.walletEntry.update({
        where: { address: address.toLowerCase() },
        data: { active: false },
    });
}

/**
 * List all active wallets (admin use).
 */
export async function listWallets(): Promise<WalletAllocation[]> {
    return prisma.walletEntry.findMany({ where: { active: true } });
}
