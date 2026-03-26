/**
 * Add wallets to the whitelist directly via Prisma.
 * Usage: npx tsx scripts/addWallets.ts
 *
 * Edit the WALLETS array below, then run the script.
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";


const WALLETS: { address: string; tier: "GTD" | "WL"; maxAlloc: number; notes?: string }[] = [
    { address: "0xFA3be61d7A66D9A2AB0Aa6E0aedab9504e544Fe1", tier: "WL", maxAlloc: 1 },
    { address: "0x6Bd6e1C17547f88E432880Da700dc37406e3D500", tier: "WL", maxAlloc: 1 },
    { address: "0xc3dB6201B40e973D7A42D9CF5A2Ebed37Fe8bE05", tier: "WL", maxAlloc: 1 },
    { address: "0x4Fd38cc6d16B7124909F5f64DD389DC85bba1200", tier: "GTD", maxAlloc: 2 },
    { address: "0x348D130F280a2dA7E98f2e4aB724C2E53FF2CC8e", tier: "GTD", maxAlloc: 2 },
    { address: "0xC3De3889E88f195DF0630aaA73Ba1967cef6e463", tier: "GTD", maxAlloc: 2 },
    { address: "0x44451064815D1fD826233dcFb1BAB271bF3E6E75", tier: "GTD", maxAlloc: 2 },
];


async function main() {
    console.log(`Adding ${WALLETS.length} wallet(s)...\n`);

    for (const w of WALLETS) {
        const entry = await prisma.walletEntry.upsert({
            where: { address: w.address.toLowerCase() },
            update: { tier: w.tier, maxAlloc: w.maxAlloc, active: true, notes: w.notes },
            create: { address: w.address.toLowerCase(), tier: w.tier, maxAlloc: w.maxAlloc, notes: w.notes },
        });
        console.log(`✓ ${entry.address}  tier=${entry.tier}  maxAlloc=${entry.maxAlloc}`);
    }

    console.log("\nDone.");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
