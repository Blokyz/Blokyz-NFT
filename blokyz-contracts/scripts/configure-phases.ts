import hre from "hardhat";

// Deployed BlokyzMinter on Sepolia
const MINTER_ADDRESS = "0x004563dc4D5f90263192861330ab653FBE632Ff9";

const MINTER_ABI = [
    "function configurePhase(uint8 phase, uint256 startTime, uint256 endTime, uint256 price, uint256 walletCap, bool active) external",
    "function phases(uint8 phase) view returns (uint256 startTime, uint256 endTime, uint256 price, uint256 walletCap, bool active)",
    "function currentPhase() view returns (uint8)",
    "function signerAddress() view returns (address)",
];

const PHASE_NAMES: Record<number, string> = {
    1: "GTD_FREE",
    2: "GTD_MINT",
    3: "WL_FCFS",
    4: "PUBLIC",
};

async function main() {
    const connection = await hre.network.connect();
    const ethers = connection.ethers;
    const networkName = connection.networkName;

    const [deployer] = await ethers.getSigners();

    console.log("═══════════════════════════════════════════════════");
    console.log("  Blokyz Phase Configuration");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Deployer: ${deployer.address}`);
    console.log(`  Network:  ${networkName}`);
    console.log(`  Minter:   ${MINTER_ADDRESS}`);
    console.log("═══════════════════════════════════════════════════\n");

    const minter = new ethers.Contract(MINTER_ADDRESS, MINTER_ABI, deployer);

    // Verify the signer address is configured
    const signerAddr = await minter.signerAddress();
    console.log(`  Signer on contract: ${signerAddr}\n`);

    // ── Phase timing ────────────────────────────────────────────────────────
    // Each phase is 5 minutes, consecutive, starting from now.
    // GTD_FREE → GTD_MINT → WL_FCFS → PUBLIC
    const now      = Math.floor(Date.now() / 1000);
    const TEN_MIN  = 10 * 60; // 600 seconds
    const price    = ethers.parseEther("0.01");

    const phases = [
        { id: 1, start: now,               end: now + TEN_MIN,     price: 0n,    walletCap: 2 }, // GTD_FREE — free mint
        { id: 2, start: now + TEN_MIN,     end: now + TEN_MIN * 2, price,        walletCap: 2 }, // GTD_MINT — 0.01 ETH
        { id: 3, start: now + TEN_MIN * 2, end: now + TEN_MIN * 3, price,        walletCap: 1 }, // WL_FCFS  — 0.01 ETH
        { id: 4, start: now + TEN_MIN * 3, end: now + TEN_MIN * 4, price,        walletCap: 5 }, // PUBLIC   — 0.01 ETH
    ];

    console.log("  Phase Schedule (UTC):");
    for (const p of phases) {
        const startStr = new Date(p.start * 1000).toUTCString();
        const endStr   = new Date(p.end   * 1000).toUTCString();
        console.log(`  [${PHASE_NAMES[p.id]}] ${startStr} → ${endStr}`);
        console.log(`         price=${ethers.formatEther(p.price)} ETH  walletCap=${p.walletCap}`);
    }
    console.log();

    // ── Configure each phase ────────────────────────────────────────────────
    for (const p of phases) {
        process.stdout.write(`  Configuring ${PHASE_NAMES[p.id]}... `);
        const tx = await minter.configurePhase(
            p.id,
            p.start,
            p.end,
            p.price,
            p.walletCap,
            true // active = true
        );
        await tx.wait();
        console.log(`✔  TX: ${tx.hash}`);
    }

    // ── Verify on-chain ─────────────────────────────────────────────────────
    console.log("\n  Verifying on-chain...");
    for (const p of phases) {
        const cfg = await minter.phases(p.id) as {
            startTime: bigint;
            endTime: bigint;
            price: bigint;
            walletCap: bigint;
            active: boolean;
        };
        const startStr = new Date(Number(cfg.startTime) * 1000).toUTCString();
        const endStr   = new Date(Number(cfg.endTime)   * 1000).toUTCString();
        console.log(`  [${PHASE_NAMES[p.id]}] active=${cfg.active}  price=${ethers.formatEther(cfg.price)} ETH  walletCap=${cfg.walletCap}`);
        console.log(`         ${startStr} → ${endStr}`);
    }

    const currentPhase = await minter.currentPhase();
    console.log(`\n  currentPhase() = ${currentPhase} (${PHASE_NAMES[Number(currentPhase)] ?? "NONE"})\n`);

    console.log("═══════════════════════════════════════════════════");
    console.log("  Done. GTD_FREE is live now — start testing!");
    console.log("═══════════════════════════════════════════════════\n");

    await connection.close();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
