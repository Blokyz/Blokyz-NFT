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
 * Tier hierarchy (highest → lowest access):
 *   GTD_FREE  → eligible for GTD_FREE, GTD_MINT, WL_FCFS, PUBLIC
 *   GTD_MINT  → eligible for              GTD_MINT, WL_FCFS, PUBLIC
 *   WL        → eligible for                         WL_FCFS, PUBLIC
 *
 * requiredTier = the minimum tier needed to enter the current phase.
 */
export function isTierEligible(entry: WalletAllocation, requiredTier: Tier): boolean {
    switch (requiredTier) {
        case Tier.GTD_FREE:
            // Only GTD_FREE wallets can enter the GTD_FREE phase
            return entry.tier === Tier.GTD_FREE;
        case Tier.GTD_MINT:
            // GTD_FREE and GTD_MINT wallets can enter the GTD_MINT phase
            return entry.tier === Tier.GTD_FREE || entry.tier === Tier.GTD_MINT;
        case Tier.WL:
            // All tiers can enter the WL phase
            return true;
    }
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
