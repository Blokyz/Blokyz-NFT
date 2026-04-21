/**
 * Add wallets to the whitelist directly via Prisma.
 * Usage: npx tsx scripts/addWallets.ts
 *
 * Edit the WALLETS array below, then run the script.
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";


// Tier access:
//   GTD_FREE  → GTD_FREE phase, GTD_MINT phase, WL phase, PUBLIC
//   GTD_MINT  → GTD_MINT phase, WL phase, PUBLIC  (NOT GTD_FREE phase)
//   WL        → WL phase, PUBLIC only
const WALLETS: { address: string; tier: "GTD_FREE" | "GTD_MINT" | "WL"; maxAlloc: number; notes?: string }[] = [
    { address: "0xFA3be61d7A66D9A2AB0Aa6E0aedab9504e544Fe1", tier: "WL",       maxAlloc: 1 },
    { address: "0x6Bd6e1C17547f88E432880Da700dc37406e3D500", tier: "WL",       maxAlloc: 1 },
    { address: "0xc3dB6201B40e973D7A42D9CF5A2Ebed37Fe8bE05", tier: "WL",       maxAlloc: 1 },
    { address: "0x164576f87a090Da0c96306a633E202042Df45Eb9", tier: "GTD_FREE", maxAlloc: 2 },
    { address: "0x4Fd38cc6d16B7124909F5f64DD389DC85bba1200", tier: "GTD_FREE", maxAlloc: 2 },
    { address: "0x348D130F280a2dA7E98f2e4aB724C2E53FF2CC8e", tier: "GTD_FREE", maxAlloc: 2 },
    { address: "0xC3De3889E88f195DF0630aaA73Ba1967cef6e463", tier: "GTD_FREE", maxAlloc: 2 },
    { address: "0x44451064815D1fD826233dcFb1BAB271bF3E6E75", tier: "GTD_MINT", maxAlloc: 2 },
    { address: "0x118F91c393cefE88e08754Cd61bA51a750098eDA", tier: "GTD_MINT", maxAlloc: 2 },
    { address: "0xcfe6959F676C71764b3a6a5b7E6281508Ee052E8", tier: "GTD_MINT", maxAlloc: 2 },
    { address: "0xd3820b8Bc31b112b51FA2a217306A02796A98332", tier: "GTD_FREE", maxAlloc: 2 },
    {address: "0x3A38c1C916aC3F5FAd3150DdfD65c0174d2f800F", tier: "WL", maxAlloc: 1 },
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
