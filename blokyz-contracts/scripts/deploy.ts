import hre from "hardhat";

async function main() {
    const connection = await hre.network.connect();
    const ethers = connection.ethers;
    const networkName = connection.networkName;

    const [deployer] = await ethers.getSigners();

    console.log("═══════════════════════════════════════════════════");
    console.log("  Blokyz Deployment Script");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Deployer:  ${deployer.address}`);
    console.log(`  Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`  Network:   ${networkName}`);
    console.log("═══════════════════════════════════════════════════\n");

    // ── Config ─────────────────────────────────────────────────────────────
    // Fill these in before deploying
    const config = {
        placeholderURI: "ipfs://bafkreih6eab4b5ocdqcjmpr3munlutlzz52eearguqr627x5estjoepwoq", // replace before deploy
        royaltyRecipient: "0xD73D05EAb6Bb02FC2Bb921E482ebF5E7d6358351",
        royaltyBps: 500,                                // 5%
        signerAddress: "0xD73D05EAb6Bb02FC2Bb921E482ebF5E7d6358351",   // same as deployer for Sepolia testing
    };

    // ── Step 1: Deploy BlokyzNFT ───────────────────────────────────────────
    console.log("Step 1: Deploying BlokyzNFT...");
    const NFTFactory = await ethers.getContractFactory("BlokyzNFT");
    const blokyzNFT = await NFTFactory.deploy(
        config.placeholderURI,
        config.royaltyRecipient,
        config.royaltyBps
    );
    await blokyzNFT.waitForDeployment();
    const nftAddress = await blokyzNFT.getAddress();
    console.log(`  ✔ BlokyzNFT deployed at: ${nftAddress}\n`);

    // ── Step 2: Deploy BlokyzMinter ────────────────────────────────────────
    console.log("Step 2: Deploying BlokyzMinter...");
    const MinterFactory = await ethers.getContractFactory("BlokyzMinter");
    const blokyzMinter = await MinterFactory.deploy(
        nftAddress,
        config.signerAddress
    );
    await blokyzMinter.waitForDeployment();
    const minterAddress = await blokyzMinter.getAddress();
    console.log(`  ✔ BlokyzMinter deployed at: ${minterAddress}\n`);

    // ── Step 3: Register minter in NFT contract ────────────────────────────
    console.log("Step 3: Registering minter in NFT contract...");
    const tx1 = await blokyzNFT.setMinterAddresses([minterAddress], [true]);
    await tx1.wait();
    console.log(`  ✔ Minter registered. TX: ${tx1.hash}\n`);

    // ── Step 4: Phases ────────────────────────────────────────────────────
    // Phases are NOT configured here intentionally.
    // Launch date is not confirmed yet.
    // When the date is locked in, run the separate configure-phases.ts script.
    console.log("Step 4: Phases skipped — run configure-phases.ts when launch date is confirmed.\n");

    // ── Step 5: Verify config on-chain ─────────────────────────────────────
    console.log("Step 5: Verifying on-chain config...");
    const registeredMinter = await blokyzNFT.minterAddresses(minterAddress);
    console.log(`  Minter registered in NFT contract: ${registeredMinter}`);

    // ── Summary ────────────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════");
    console.log("  Deployment Complete");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  BlokyzNFT:     ${nftAddress}`);
    console.log(`  BlokyzMinter:  ${minterAddress}`);
    console.log(`  Network:       ${networkName}`);
    console.log(`  Deployer:      ${deployer.address}`);
    console.log("═══════════════════════════════════════════════════");
    console.log("\n  NEXT STEPS:");
    console.log("  1. Verify BlokyzNFT on Etherscan");
    console.log("  2. Verify BlokyzMinter on Etherscan");
    console.log("  3. Save both contract addresses");
    console.log("  4. When launch date confirmed — run configure-phases.ts");
    console.log("═══════════════════════════════════════════════════\n");

    await connection.close();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});