import hre from "hardhat";

const MINTER_ADDRESS = "0x004563dc4D5f90263192861330ab653FBE632Ff9";
const WALLET         = "0x348D130F280a2dA7E98f2e4aB724C2E53FF2CC8e";

const MINTER_ABI = [
    "function currentPhase() view returns (uint8)",
    "function phases(uint8 phase) view returns (uint256 startTime, uint256 endTime, uint256 price, uint256 walletCap, bool active)",
    "function mintedPerPhase(uint8 phase, address wallet) view returns (uint256)",
    "function signerAddress() view returns (address)",
    "function paused() view returns (bool)",
    "function mint(uint256 qty, uint8 phase, uint256 maxAlloc, uint256 expiry, string nonce, bytes signature) payable",
];

const PHASE_NAMES: Record<number, string> = {
    0: "NONE", 1: "GTD_FREE", 2: "GTD_MINT", 3: "WL_FCFS", 4: "PUBLIC",
};

async function main() {
    const connection = await hre.network.connect();
    const ethers     = connection.ethers;
    const minter     = new ethers.Contract(MINTER_ADDRESS, MINTER_ABI, ethers.provider);
    const now        = Math.floor(Date.now() / 1000);

    console.log("\n══════════════════════════════════════════");
    console.log("  Mint Debug — reading on-chain state");
    console.log("══════════════════════════════════════════\n");

    // ── Current phase ─────────────────────────────────────────────────────
    const currentPhaseNum = Number(await minter.currentPhase());
    console.log(`  currentPhase()  : ${currentPhaseNum} (${PHASE_NAMES[currentPhaseNum]})`);
    console.log(`  paused          : ${await minter.paused()}`);
    console.log(`  signerAddress   : ${await minter.signerAddress()}`);

    // ── GTD_FREE phase config ─────────────────────────────────────────────
    const cfg = await minter.phases(1) as {
        startTime: bigint; endTime: bigint; price: bigint; walletCap: bigint; active: boolean;
    };
    console.log("\n  GTD_FREE config:");
    console.log(`    active    : ${cfg.active}`);
    console.log(`    price     : ${ethers.formatEther(cfg.price)} ETH (${cfg.price} wei)`);
    console.log(`    walletCap : ${cfg.walletCap}`);
    console.log(`    startTime : ${new Date(Number(cfg.startTime) * 1000).toUTCString()}`);
    console.log(`    endTime   : ${new Date(Number(cfg.endTime) * 1000).toUTCString()}`);
    console.log(`    now (UTC) : ${new Date(now * 1000).toUTCString()}`);

    const phaseActive   = cfg.active && now >= Number(cfg.startTime) && now <= Number(cfg.endTime);
    const secsRemaining = Number(cfg.endTime) - now;
    console.log(`    in window : ${phaseActive} ${phaseActive ? `(${secsRemaining}s remaining)` : "(EXPIRED)"}`);

    // ── Wallet minted count ───────────────────────────────────────────────
    const alreadyMinted = Number(await minter.mintedPerPhase(1, WALLET));
    console.log(`\n  mintedPerPhase[GTD_FREE][${WALLET}] = ${alreadyMinted}`);
    console.log(`  walletCap = ${cfg.walletCap}  →  remaining = ${Number(cfg.walletCap) - alreadyMinted}`);

    // ── Diagnose likely revert ────────────────────────────────────────────
    console.log("\n  DIAGNOSIS:");
    if (!cfg.active)                              console.log("  ❌ PhaseNotActive — phase.active is false");
    else if (now < Number(cfg.startTime))         console.log("  ❌ PhaseNotActive — phase hasn't started yet");
    else if (now > Number(cfg.endTime))           console.log("  ❌ PhaseNotActive — phase window EXPIRED");
    else if (alreadyMinted >= Number(cfg.walletCap)) console.log("  ❌ WalletCapExceeded — already minted max allocation");
    else                                          console.log("  ✅ Phase is active, allocation available. Check payment amount.");

    console.log("\n══════════════════════════════════════════\n");

    await connection.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
