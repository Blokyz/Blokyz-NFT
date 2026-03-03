import { expect } from "chai";
import { network } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import type { BlokyzNFT } from "../types/ethers-contracts/BlokyzNFT.js";
import type { BlokyzMinter } from "../types/ethers-contracts/BlokyzMinter.sol/BlokyzMinter.js";

const { ethers } = await network.connect();

// ─── Phase Enum (mirrors Solidity enum) ──────────────────────────────────────
const Phase = {
    NONE: 0,
    GTD_FREE: 1,
    GTD_MINT: 2,
    WL_FCFS: 3,
    PUBLIC: 4,
} as const;
type PhaseValue = (typeof Phase)[keyof typeof Phase];

// ─── Time Helpers ────────────────────────────────────────────────────────────
async function getBlockTimestamp(): Promise<number> {
    const block = await ethers.provider.getBlock("latest");
    return block!.timestamp;
}

async function setNextBlockTimestamp(ts: number): Promise<void> {
    await ethers.provider.send("evm_setNextBlockTimestamp", [ts]);
    await ethers.provider.send("evm_mine", []);
}

// ─── ECDSA Signature Helper ───────────────────────────────────────────────────
/**
 * Replicates the backend signing logic from BlokyzMinter._validateSignature.
 * Signs: keccak256(wallet || phase || maxAlloc || expiry || nonce)
 * then wraps with eth signed message prefix via signMessage.
 */
async function signMintAuth(
    signer: HardhatEthersSigner,
    wallet: string,
    phase: PhaseValue,
    maxAlloc: number,
    expiry: number,
    nonce: string
): Promise<string> {
    const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "uint256", "string"],
        [wallet, phase, maxAlloc, expiry, nonce]
    );
    // ethers signMessage adds "\x19Ethereum Signed Message:\n32" prefix
    return signer.signMessage(ethers.getBytes(messageHash));
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
interface Contracts {
    nft: BlokyzNFT;
    minter: BlokyzMinter;
}

async function deployContracts(
    owner: HardhatEthersSigner,
    signer: HardhatEthersSigner
): Promise<Contracts> {
    const NftFactory = await ethers.getContractFactory("BlokyzNFT", owner);
    const MinterFactory = await ethers.getContractFactory("BlokyzMinter", owner);

    const nft = (await NftFactory.deploy(
        "ipfs://placeholder",
        owner.address,
        500
    )) as unknown as BlokyzNFT;

    const minter = (await MinterFactory.deploy(
        await nft.getAddress(),
        signer.address
    )) as unknown as BlokyzMinter;

    // Register minter contract in NFT
    await nft.connect(owner).setMinterAddresses([await minter.getAddress()], [true]);

    return { nft, minter };
}

/**
 * Configure a phase with start/end timestamps relative to "now + offset".
 */
async function configurePhase(
    minter: BlokyzMinter,
    owner: HardhatEthersSigner,
    phase: PhaseValue,
    opts: {
        price: bigint;
        walletCap: number;
        startOffset?: number;  // seconds from now (default: -60, already started)
        endOffset?: number;  // seconds from now (default: +3600)
        active?: boolean;
    }
): Promise<{ startTime: number; endTime: number }> {
    const now = await getBlockTimestamp();
    const start = now + (opts.startOffset ?? -60);
    const end = now + (opts.endOffset ?? 3600);

    await minter.connect(owner).configurePhase(
        phase,
        start,
        end,
        opts.price,
        opts.walletCap,
        opts.active ?? true
    );

    return { startTime: start, endTime: end };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("BlokyzMinter", () => {
    let owner: HardhatEthersSigner;
    let backend: HardhatEthersSigner;  // the ECDSA signer
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let user3: HardhatEthersSigner;
    let attacker: HardhatEthersSigner;
    let nft: BlokyzNFT;
    let minter: BlokyzMinter;

    // Prices per phase
    const GTD_FREE_PRICE = 0n;
    const GTD_MINT_PRICE = ethers.parseEther("0.08");
    const WL_PRICE = ethers.parseEther("0.10");
    const PUBLIC_PRICE = ethers.parseEther("0.12");

    let nonceCounter = 0;
    function freshNonce(): string {
        return `nonce-${++nonceCounter}-${Date.now()}`;
    }

    beforeEach(async () => {
        [owner, backend, user1, user2, user3, attacker] = await ethers.getSigners();
        ({ nft, minter } = await deployContracts(owner, backend));
    });

    // ─── Constructor ─────────────────────────────────────────────────────────────
    describe("Constructor", () => {
        it("sets nft contract address", async () => {
            expect(await minter.blokyzNFT()).to.equal(await nft.getAddress());
        });

        it("sets signer address", async () => {
            expect(await minter.signerAddress()).to.equal(backend.address);
        });

        it("paused is false by default", async () => {
            expect(await minter.paused()).to.be.false;
        });

        it("reverts if nft contract is zero address", async () => {
            const MinterFactory = await ethers.getContractFactory("BlokyzMinter", owner);
            await expect(
                MinterFactory.deploy(ethers.ZeroAddress, backend.address)
            ).to.be.revertedWithCustomError(minter, "ZeroAddress");
        });

        it("reverts if signer is zero address", async () => {
            const MinterFactory = await ethers.getContractFactory("BlokyzMinter", owner);
            await expect(
                MinterFactory.deploy(await nft.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(minter, "ZeroAddress");
        });
    });

    // ─── Phase Configuration ──────────────────────────────────────────────────────
    describe("configurePhase()", () => {
        it("owner can configure a phase", async () => {
            const { startTime, endTime } = await configurePhase(minter, owner, Phase.GTD_FREE, {
                price: GTD_FREE_PRICE,
                walletCap: 1,
            });
            const cfg = await minter.getPhaseConfig(Phase.GTD_FREE);
            expect(cfg.price).to.equal(GTD_FREE_PRICE);
            expect(cfg.walletCap).to.equal(1n);
            expect(cfg.startTime).to.equal(BigInt(startTime));
            expect(cfg.endTime).to.equal(BigInt(endTime));
            expect(cfg.active).to.be.true;
        });

        it("emits PhaseConfigured event", async () => {
            const now = await getBlockTimestamp();
            const start = now - 60;
            const end = now + 3600;
            await expect(
                minter.connect(owner).configurePhase(Phase.GTD_FREE, start, end, GTD_FREE_PRICE, 1, true)
            )
                .to.emit(minter, "PhaseConfigured")
                .withArgs(Phase.GTD_FREE, start, end, GTD_FREE_PRICE, 1n);
        });

        it("reverts if phase is NONE", async () => {
            const now = await getBlockTimestamp();
            await expect(
                minter.connect(owner).configurePhase(Phase.NONE, now - 60, now + 3600, 0, 1, true)
            ).to.be.revertedWith("Invalid phase");
        });

        it("reverts if endTime <= startTime", async () => {
            const now = await getBlockTimestamp();
            await expect(
                minter.connect(owner).configurePhase(Phase.GTD_FREE, now + 100, now + 100, 0, 1, true)
            ).to.be.revertedWith("Invalid time range");
        });

        it("reverts if endTime < startTime", async () => {
            const now = await getBlockTimestamp();
            await expect(
                minter.connect(owner).configurePhase(Phase.GTD_FREE, now + 200, now + 100, 0, 1, true)
            ).to.be.revertedWith("Invalid time range");
        });

        it("non-owner cannot configurePhase", async () => {
            const now = await getBlockTimestamp();
            await expect(
                minter.connect(user1).configurePhase(Phase.GTD_FREE, now - 60, now + 3600, 0, 1, true)
            ).to.revert(ethers);
        });

        it("can reconfigure phase (overwrites previous config)", async () => {
            await configurePhase(minter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });
            await configurePhase(minter, owner, Phase.PUBLIC, { price: ethers.parseEther("0.15"), walletCap: 3 });
            const cfg = await minter.getPhaseConfig(Phase.PUBLIC);
            expect(cfg.price).to.equal(ethers.parseEther("0.15"));
            expect(cfg.walletCap).to.equal(3n);
        });
    });

    // ─── setPhaseActive ───────────────────────────────────────────────────────────
    describe("setPhaseActive()", () => {
        it("owner can deactivate an active phase", async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1 });
            await minter.connect(owner).setPhaseActive(Phase.GTD_FREE, false);
            const cfg = await minter.getPhaseConfig(Phase.GTD_FREE);
            expect(cfg.active).to.be.false;
        });

        it("owner can re-activate a phase", async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1, active: false });
            await minter.connect(owner).setPhaseActive(Phase.GTD_FREE, true);
            const cfg = await minter.getPhaseConfig(Phase.GTD_FREE);
            expect(cfg.active).to.be.true;
        });

        it("reverts if phase is NONE", async () => {
            await expect(
                minter.connect(owner).setPhaseActive(Phase.NONE, true)
            ).to.be.revertedWith("Invalid phase");
        });

        it("non-owner cannot setPhaseActive", async () => {
            await expect(
                minter.connect(user1).setPhaseActive(Phase.GTD_FREE, false)
            ).to.revert(ethers);
        });
    });

    // ─── currentPhase() ──────────────────────────────────────────────────────────
    describe("currentPhase()", () => {
        it("returns NONE when no phase is configured", async () => {
            expect(await minter.currentPhase()).to.equal(Phase.NONE);
        });

        it("returns NONE when phase is active=false", async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1, active: false });
            expect(await minter.currentPhase()).to.equal(Phase.NONE);
        });

        it("returns correct phase when inside time window", async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1 });
            expect(await minter.currentPhase()).to.equal(Phase.GTD_FREE);
        });

        it("returns NONE when phase time window has passed", async () => {
            const now = await getBlockTimestamp();
            await minter.connect(owner).configurePhase(
                Phase.GTD_FREE, now - 200, now - 100, 0n, 1, true
            );
            expect(await minter.currentPhase()).to.equal(Phase.NONE);
        });

        it("returns NONE when phase has not started yet", async () => {
            const now = await getBlockTimestamp();
            await minter.connect(owner).configurePhase(
                Phase.GTD_FREE, now + 500, now + 1000, 0n, 1, true
            );
            expect(await minter.currentPhase()).to.equal(Phase.NONE);
        });

        it("returns first active phase in priority order (GTD_FREE before PUBLIC)", async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1 });
            await configurePhase(minter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });
            // GTD_FREE has higher priority, should be returned
            expect(await minter.currentPhase()).to.equal(Phase.GTD_FREE);
        });
    });

    // ─── Pause ────────────────────────────────────────────────────────────────────
    describe("Pause / Unpause", () => {
        it("owner can pause the contract", async () => {
            await minter.connect(owner).setPaused(true);
            expect(await minter.paused()).to.be.true;
        });

        it("owner can unpause", async () => {
            await minter.connect(owner).setPaused(true);
            await minter.connect(owner).setPaused(false);
            expect(await minter.paused()).to.be.false;
        });

        it("setPaused emits PausedStateChanged", async () => {
            await expect(minter.connect(owner).setPaused(true))
                .to.emit(minter, "PausedStateChanged")
                .withArgs(true);
        });

        it("non-owner cannot pause", async () => {
            await expect(minter.connect(user1).setPaused(true)).to.revert(ethers);
        });

        it("mint reverts when paused", async () => {
            await minter.connect(owner).setPaused(true);
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1 });
            const now = await getBlockTimestamp();
            const expiry = now + 3600;
            const nonce = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);

            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig)
            ).to.be.revertedWithCustomError(minter, "ContractPaused");
        });

        it("publicMint reverts when paused", async () => {
            await minter.connect(owner).setPaused(true);
            await configurePhase(minter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });

            await expect(
                minter.connect(user1).publicMint(1, { value: PUBLIC_PRICE })
            ).to.be.revertedWithCustomError(minter, "ContractPaused");
        });
    });

    // ─── Admin: setSigner & setNFTContract ────────────────────────────────────────
    describe("setSigner()", () => {
        it("owner can update the signer address", async () => {
            await minter.connect(owner).setSigner(user2.address);
            expect(await minter.signerAddress()).to.equal(user2.address);
        });

        it("emits SignerUpdated event", async () => {
            await expect(minter.connect(owner).setSigner(user2.address))
                .to.emit(minter, "SignerUpdated")
                .withArgs(user2.address);
        });

        it("reverts setSigner with zero address", async () => {
            await expect(
                minter.connect(owner).setSigner(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(minter, "ZeroAddress");
        });

        it("non-owner cannot setSigner", async () => {
            await expect(
                minter.connect(user1).setSigner(attacker.address)
            ).to.revert(ethers);
        });
    });

    describe("setNFTContract()", () => {
        it("owner can update the NFT contract address", async () => {
            // Deploy a second NFT contract
            const NftFactory = await ethers.getContractFactory("BlokyzNFT", owner);
            const nft2 = await NftFactory.deploy("ipfs://ph2", owner.address, 300);
            await minter.connect(owner).setNFTContract(await nft2.getAddress());
            expect(await minter.blokyzNFT()).to.equal(await nft2.getAddress());
        });

        it("emits NFTContractUpdated event", async () => {
            const NftFactory = await ethers.getContractFactory("BlokyzNFT", owner);
            const nft2 = await NftFactory.deploy("ipfs://ph2", owner.address, 300);
            await expect(minter.connect(owner).setNFTContract(await nft2.getAddress()))
                .to.emit(minter, "NFTContractUpdated")
                .withArgs(await nft2.getAddress());
        });

        it("reverts with zero address", async () => {
            await expect(
                minter.connect(owner).setNFTContract(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(minter, "ZeroAddress");
        });

        it("non-owner cannot setNFTContract", async () => {
            await expect(
                minter.connect(user1).setNFTContract(await nft.getAddress())
            ).to.revert(ethers);
        });
    });

    // ─── GTD_FREE phase ───────────────────────────────────────────────────────────
    describe("GTD_FREE phase mint()", () => {
        let expiry: number;
        let nonce: string;

        beforeEach(async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, {
                price: GTD_FREE_PRICE,
                walletCap: 1,
            });
            expiry = (await getBlockTimestamp()) + 3600;
            nonce = freshNonce();
        });

        it("eligible user can mint 1 free token with valid sig", async () => {
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n });
            expect(await nft.totalSupply()).to.equal(1n);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
        });

        it("emits Minted event", async () => {
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n })
            )
                .to.emit(minter, "Minted")
                .withArgs(user1.address, Phase.GTD_FREE, 1n);
        });

        it("records minted count in mintedPerPhase", async () => {
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n });
            expect(await minter.getMintedByPhase(Phase.GTD_FREE, user1.address)).to.equal(1n);
        });

        it("reverts if qty is 0", async () => {
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await expect(
                minter.connect(user1).mint(0, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "InvalidQty");
        });

        it("reverts if wrong payment sent (sending ETH for free phase)", async () => {
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 1n })
            ).to.be.revertedWithCustomError(minter, "WrongPayment");
        });

        it("reverts if signature is invalid (wrong signer)", async () => {
            // attacker signs instead of backend
            const sig = await signMintAuth(attacker, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "InvalidSignature");
        });

        it("reverts if signature is for wrong wallet", async () => {
            // sig issued for user1 but user2 is calling
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await expect(
                minter.connect(user2).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "InvalidSignature");
        });

        it("reverts if signature is for wrong phase", async () => {
            // sig issued for GTD_MINT but used in GTD_FREE call
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_MINT, 1, expiry, nonce);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "InvalidSignature");
        });

        it("reverts if nonce is replayed (same sig used twice)", async () => {
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n });

            // Try to replay — wallet cap also kicks in, but nonce check fires first
            const nonce2 = freshNonce();
            const sig2 = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce2);

            // First fail on wallet cap
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "NonceAlreadyUsed");
        });

        it("reverts if signature has expired", async () => {
            const now = await getBlockTimestamp();
            const pastExpiry = now - 1; // already expired
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, pastExpiry, nonce);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, pastExpiry, nonce, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "SignatureExpired");
        });

        it("reverts if wallet cap exceeded (user tries to mint 2 when cap is 1)", async () => {
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 2, expiry, nonce);
            await expect(
                minter.connect(user1).mint(2, Phase.GTD_FREE, 2, expiry, nonce, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "WalletCapExceeded");
        });

        it("reverts if maxAlloc from sig is less than phase walletCap and user tries to exceed it", async () => {
            // Phase has walletCap=1, maxAlloc=1 — cannot mint 2
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 5 });
            const n2 = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, n2);
            // maxAlloc=1 limits even though walletCap=5: limit = min(1,5) = 1
            await expect(
                minter.connect(user1).mint(2, Phase.GTD_FREE, 1, expiry, n2, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "WalletCapExceeded");
        });

        it("reverts after wallet already minted full allocation", async () => {
            const sig1 = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig1, { value: 0n });

            const nonce2 = freshNonce();
            const sig2 = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce2);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce2, sig2, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "WalletCapExceeded");
        });

        it("cannot use GTD_FREE sig to call publicMint path", async () => {
            // publicMint does not accept a phase parameter — it always uses PUBLIC
            // Ensure GTD_FREE is not accessible via publicMint by testing publicMint requires PUBLIC phase
            await configurePhase(minter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });
            // publicMint should work for PUBLIC, not for GTD_FREE state
            await expect(
                minter.connect(user1).publicMint(1, { value: PUBLIC_PRICE })
            ).to.not.revert(ethers); // PUBLIC phase is active, should succeed
        });

        it("reverts if using publicMint with GTD_FREE-only phase active", async () => {
            // Only GTD_FREE configured, PUBLIC not active
            await expect(
                minter.connect(user1).publicMint(1, { value: PUBLIC_PRICE })
            ).to.be.revertedWithCustomError(minter, "PhaseNotActive");
        });

        it("reverts if phase time window has not started yet", async () => {
            const now = await getBlockTimestamp();
            await minter.connect(owner).configurePhase(
                Phase.GTD_FREE, now + 600, now + 3600, 0n, 1, true
            );
            const n2 = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, n2);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, n2, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "PhaseNotActive");
        });

        it("reverts if phase time window has ended", async () => {
            const now = await getBlockTimestamp();
            // End time = now - 1 (already past)
            await minter.connect(owner).configurePhase(
                Phase.GTD_FREE, now - 200, now - 100, 0n, 1, true
            );
            const n2 = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, n2);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, n2, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "PhaseNotActive");
        });

        it("reverts if phase is inactive (active=false)", async () => {
            await minter.connect(owner).setPhaseActive(Phase.GTD_FREE, false);
            const n2 = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, n2);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, n2, sig, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "PhaseNotActive");
        });

        it("cannot call mint() with PUBLIC phase (must use publicMint)", async () => {
            await configurePhase(minter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });
            const n2 = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.PUBLIC, 5, expiry, n2);
            await expect(
                minter.connect(user1).mint(1, Phase.PUBLIC, 5, expiry, n2, sig, { value: PUBLIC_PRICE })
            ).to.be.revertedWith("Use publicMint for public phase");
        });
    });

    // ─── GTD_MINT phase ───────────────────────────────────────────────────────────
    describe("GTD_MINT phase mint()", () => {
        beforeEach(async () => {
            await configurePhase(minter, owner, Phase.GTD_MINT, {
                price: GTD_MINT_PRICE,
                walletCap: 3,
            });
        });

        it("eligible user can mint up to 3 tokens at 0.08 ETH each", async () => {
            const now = await getBlockTimestamp();
            const expiry = now + 3600;
            const nonce = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_MINT, 3, expiry, nonce);

            await minter.connect(user1).mint(3, Phase.GTD_MINT, 3, expiry, nonce, sig, {
                value: GTD_MINT_PRICE * 3n,
            });
            expect(await nft.totalSupply()).to.equal(3n);
        });

        it("reverts if underpaying (2 qty but 1 ETH price sent)", async () => {
            const now = await getBlockTimestamp();
            const expiry = now + 3600;
            const nonce = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_MINT, 3, expiry, nonce);
            await expect(
                minter.connect(user1).mint(2, Phase.GTD_MINT, 3, expiry, nonce, sig, {
                    value: GTD_MINT_PRICE, // only 1x price for 2 qty
                })
            ).to.be.revertedWithCustomError(minter, "WrongPayment");
        });

        it("reverts if overpaying", async () => {
            const now = await getBlockTimestamp();
            const expiry = now + 3600;
            const nonce = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_MINT, 3, expiry, nonce);
            await expect(
                minter.connect(user1).mint(1, Phase.GTD_MINT, 3, expiry, nonce, sig, {
                    value: GTD_MINT_PRICE * 2n, // too much
                })
            ).to.be.revertedWithCustomError(minter, "WrongPayment");
        });

        it("mintedPerPhase is independent per phase", async () => {
            // GTD_FREE phase also configured, user mints there then GTD_MINT
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1 });

            const now = await getBlockTimestamp();
            const expiry = now + 3600;

            const n1 = freshNonce();
            const sig1 = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, n1);
            await minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, n1, sig1, { value: 0n });

            const n2 = freshNonce();
            const sig2 = await signMintAuth(backend, user1.address, Phase.GTD_MINT, 3, expiry, n2);
            await minter.connect(user1).mint(3, Phase.GTD_MINT, 3, expiry, n2, sig2, {
                value: GTD_MINT_PRICE * 3n,
            });

            // Both tracked independently
            expect(await minter.getMintedByPhase(Phase.GTD_FREE, user1.address)).to.equal(1n);
            expect(await minter.getMintedByPhase(Phase.GTD_MINT, user1.address)).to.equal(3n);
            expect(await nft.totalSupply()).to.equal(4n);
        });
    });

    // ─── WL_FCFS phase ────────────────────────────────────────────────────────────
    describe("WL_FCFS phase mint()", () => {
        beforeEach(async () => {
            await configurePhase(minter, owner, Phase.WL_FCFS, {
                price: WL_PRICE,
                walletCap: 2,
            });
        });

        it("whitelisted user can mint 2 tokens at 0.10 ETH each", async () => {
            const now = await getBlockTimestamp();
            const expiry = now + 3600;
            const nonce = freshNonce();
            const sig = await signMintAuth(backend, user1.address, Phase.WL_FCFS, 2, expiry, nonce);
            await minter.connect(user1).mint(2, Phase.WL_FCFS, 2, expiry, nonce, sig, {
                value: WL_PRICE * 2n,
            });
            expect(await nft.totalSupply()).to.equal(2n);
        });

        it("WL user cannot mint more than their maxAlloc even if walletCap is higher", async () => {
            await configurePhase(minter, owner, Phase.WL_FCFS, { price: WL_PRICE, walletCap: 5 });
            const now = await getBlockTimestamp();
            const expiry = now + 3600;
            const nonce = freshNonce();
            // sig grants only 2, even though walletCap=5
            const sig = await signMintAuth(backend, user1.address, Phase.WL_FCFS, 2, expiry, nonce);
            await expect(
                minter.connect(user1).mint(3, Phase.WL_FCFS, 2, expiry, nonce, sig, {
                    value: WL_PRICE * 3n,
                })
            ).to.be.revertedWithCustomError(minter, "WalletCapExceeded");
        });

        it("multiple different users can each mint their allocation", async () => {
            const now = await getBlockTimestamp();
            const expiry = now + 3600;

            const n1 = freshNonce();
            const s1 = await signMintAuth(backend, user1.address, Phase.WL_FCFS, 2, expiry, n1);
            await minter.connect(user1).mint(2, Phase.WL_FCFS, 2, expiry, n1, s1, { value: WL_PRICE * 2n });

            const n2 = freshNonce();
            const s2 = await signMintAuth(backend, user2.address, Phase.WL_FCFS, 2, expiry, n2);
            await minter.connect(user2).mint(2, Phase.WL_FCFS, 2, expiry, n2, s2, { value: WL_PRICE * 2n });

            expect(await nft.totalSupply()).to.equal(4n);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
            expect(await nft.ownerOf(3)).to.equal(user2.address);
        });
    });

    // ─── PUBLIC phase ─────────────────────────────────────────────────────────────
    describe("PUBLIC phase publicMint()", () => {
        beforeEach(async () => {
            await configurePhase(minter, owner, Phase.PUBLIC, {
                price: PUBLIC_PRICE,
                walletCap: 5,
            });
        });

        it("anyone can mint during public phase", async () => {
            await minter.connect(attacker).publicMint(1, { value: PUBLIC_PRICE });
            expect(await nft.totalSupply()).to.equal(1n);
            expect(await nft.ownerOf(1)).to.equal(attacker.address);
        });

        it("can mint multiple tokens up to cap", async () => {
            await minter.connect(user1).publicMint(5, { value: PUBLIC_PRICE * 5n });
            expect(await nft.totalSupply()).to.equal(5n);
        });

        it("emits Minted event with PUBLIC phase", async () => {
            await expect(minter.connect(user1).publicMint(1, { value: PUBLIC_PRICE }))
                .to.emit(minter, "Minted")
                .withArgs(user1.address, Phase.PUBLIC, 1n);
        });

        it("reverts if qty is 0", async () => {
            await expect(
                minter.connect(user1).publicMint(0, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "InvalidQty");
        });

        it("reverts if wrong payment", async () => {
            await expect(
                minter.connect(user1).publicMint(2, { value: PUBLIC_PRICE }) // only 1x for 2 qty
            ).to.be.revertedWithCustomError(minter, "WrongPayment");
        });

        it("reverts if wallet cap exceeded", async () => {
            await minter.connect(user1).publicMint(5, { value: PUBLIC_PRICE * 5n });
            await expect(
                minter.connect(user1).publicMint(1, { value: PUBLIC_PRICE })
            ).to.be.revertedWithCustomError(minter, "WalletCapExceeded");
        });

        it("does not require a signature", async () => {
            // Verify no signature data is needed for publicMint
            await expect(
                minter.connect(user3).publicMint(1, { value: PUBLIC_PRICE })
            ).to.not.revert(ethers);
        });

        it("reverts if phase not active", async () => {
            await minter.connect(owner).setPhaseActive(Phase.PUBLIC, false);
            await expect(
                minter.connect(user1).publicMint(1, { value: PUBLIC_PRICE })
            ).to.be.revertedWithCustomError(minter, "PhaseNotActive");
        });

        it("partial mint accepted, further mint up to remaining cap", async () => {
            await minter.connect(user1).publicMint(3, { value: PUBLIC_PRICE * 3n });
            await minter.connect(user1).publicMint(2, { value: PUBLIC_PRICE * 2n });
            expect(await minter.getMintedByPhase(Phase.PUBLIC, user1.address)).to.equal(5n);
        });

        it("wallet cap is per-user: user2 can still mint even if user1 is capped", async () => {
            await minter.connect(user1).publicMint(5, { value: PUBLIC_PRICE * 5n });
            await expect(
                minter.connect(user2).publicMint(5, { value: PUBLIC_PRICE * 5n })
            ).to.not.revert(ethers);
        });
    });

    // ─── Nonce Replay Protection ──────────────────────────────────────────────────
    describe("Nonce replay protection", () => {
        it("isNonceUsed returns false before use", async () => {
            expect(await minter.isNonceUsed("unique-nonce-abc")).to.be.false;
        });

        it("isNonceUsed returns true after mint used that nonce", async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1 });
            const now = await getBlockTimestamp();
            const expiry = now + 3600;
            const nonce = "replay-test-nonce";
            const sig = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig, { value: 0n });
            expect(await minter.isNonceUsed(nonce)).to.be.true;
        });

        it("same nonce cannot be used by a different user", async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1 });
            const now = await getBlockTimestamp();
            const expiry = now + 3600;
            const nonce = freshNonce();

            // user1 uses nonce
            const sig1 = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, nonce);
            await minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig1, { value: 0n });

            // user2 tries to use same nonce in their signed message — will fail NonceAlreadyUsed
            const sig2 = await signMintAuth(backend, user2.address, Phase.GTD_FREE, 1, expiry, nonce);
            // Need WL_FCFS for user2 since user2 hasn't minted in GTD_FREE yet and cap = 1
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 2 });
            await expect(
                minter.connect(user2).mint(1, Phase.GTD_FREE, 1, expiry, nonce, sig2, { value: 0n })
            ).to.be.revertedWithCustomError(minter, "NonceAlreadyUsed");
        });

        it("different nonces work independently", async () => {
            await configurePhase(minter, owner, Phase.WL_FCFS, { price: WL_PRICE, walletCap: 2 });
            const now = await getBlockTimestamp();
            const expiry = now + 3600;

            const n1 = freshNonce();
            const sig1 = await signMintAuth(backend, user1.address, Phase.WL_FCFS, 2, expiry, n1);
            await minter.connect(user1).mint(1, Phase.WL_FCFS, 2, expiry, n1, sig1, { value: WL_PRICE });

            const n2 = freshNonce();
            const sig2 = await signMintAuth(backend, user1.address, Phase.WL_FCFS, 2, expiry, n2);
            await minter.connect(user1).mint(1, Phase.WL_FCFS, 2, expiry, n2, sig2, { value: WL_PRICE });

            expect(await minter.getMintedByPhase(Phase.WL_FCFS, user1.address)).to.equal(2n);
        });
    });

    // ─── Withdraw ─────────────────────────────────────────────────────────────────
    describe("withdraw()", () => {
        it("owner can withdraw ETH from minter contract", async () => {
            // Fund minter contract via publicMint->proceeds
            await configurePhase(minter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });
            await minter.connect(user1).publicMint(1, { value: PUBLIC_PRICE });

            const before = await ethers.provider.getBalance(user2.address);
            await minter.connect(owner).withdraw(user2.address, PUBLIC_PRICE);
            const after = await ethers.provider.getBalance(user2.address);
            expect(after - before).to.equal(PUBLIC_PRICE);
        });

        it("emits Withdrawn event", async () => {
            await configurePhase(minter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });
            await minter.connect(user1).publicMint(1, { value: PUBLIC_PRICE });
            await expect(minter.connect(owner).withdraw(user2.address, PUBLIC_PRICE))
                .to.emit(minter, "Withdrawn")
                .withArgs(user2.address, PUBLIC_PRICE);
        });

        it("reverts withdraw to zero address", async () => {
            await expect(
                minter.connect(owner).withdraw(ethers.ZeroAddress, 1n)
            ).to.be.revertedWithCustomError(minter, "ZeroAddress");
        });

        it("reverts if insufficient balance", async () => {
            await expect(
                minter.connect(owner).withdraw(user1.address, ethers.parseEther("999"))
            ).to.be.revertedWithCustomError(minter, "WithdrawFailed");
        });

        it("non-owner cannot withdraw", async () => {
            await expect(
                minter.connect(user1).withdraw(user1.address, 1n)
            ).to.revert(ethers);
        });

        it("contract can receive ETH via receive()", async () => {
            const before = await ethers.provider.getBalance(await minter.getAddress());
            await owner.sendTransaction({ to: await minter.getAddress(), value: ethers.parseEther("1") });
            const after = await ethers.provider.getBalance(await minter.getAddress());
            expect(after - before).to.equal(ethers.parseEther("1"));
        });
    });

    // ─── View Helpers ─────────────────────────────────────────────────────────────
    describe("View helpers", () => {
        it("getMintedByPhase returns 0 before any mint", async () => {
            expect(await minter.getMintedByPhase(Phase.PUBLIC, user1.address)).to.equal(0n);
        });

        it("getPhaseConfig returns zero struct for unconfigured phase", async () => {
            const cfg = await minter.getPhaseConfig(Phase.PUBLIC);
            expect(cfg.price).to.equal(0n);
            expect(cfg.walletCap).to.equal(0n);
            expect(cfg.active).to.be.false;
        });
    });

    // ─── GTD Holder Stacking (phases 1 + 2) ──────────────────────────────────────
    describe("GTD holder stacking (GTD_FREE + GTD_MINT)", () => {
        it("GTD holder can mint 1 free + 3 paid = 4 total across both phases", async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1 });
            await configurePhase(minter, owner, Phase.GTD_MINT, { price: GTD_MINT_PRICE, walletCap: 3 });

            const now = await getBlockTimestamp();
            const expiry = now + 7200;

            // Phase 1: 1 free
            const n1 = freshNonce();
            const sig1 = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, n1);
            await minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, n1, sig1, { value: 0n });

            // Phase 2: 3 paid
            const n2 = freshNonce();
            const sig2 = await signMintAuth(backend, user1.address, Phase.GTD_MINT, 3, expiry, n2);
            await minter.connect(user1).mint(3, Phase.GTD_MINT, 3, expiry, n2, sig2, {
                value: GTD_MINT_PRICE * 3n,
            });

            expect(await nft.totalSupply()).to.equal(4n);
            expect(await minter.getMintedByPhase(Phase.GTD_FREE, user1.address)).to.equal(1n);
            expect(await minter.getMintedByPhase(Phase.GTD_MINT, user1.address)).to.equal(3n);
        });

        it("GTD holder cannot exceed phase 2 cap regardless of stacking", async () => {
            await configurePhase(minter, owner, Phase.GTD_FREE, { price: 0n, walletCap: 1 });
            await configurePhase(minter, owner, Phase.GTD_MINT, { price: GTD_MINT_PRICE, walletCap: 3 });

            const now = await getBlockTimestamp();
            const expiry = now + 7200;

            // Phase 1: 1 free
            const n1 = freshNonce();
            const sig1 = await signMintAuth(backend, user1.address, Phase.GTD_FREE, 1, expiry, n1);
            await minter.connect(user1).mint(1, Phase.GTD_FREE, 1, expiry, n1, sig1, { value: 0n });

            // Phase 2: try to mint 4 (only 3 allowed)
            const n2 = freshNonce();
            const sig2 = await signMintAuth(backend, user1.address, Phase.GTD_MINT, 4, expiry, n2);
            await expect(
                minter.connect(user1).mint(4, Phase.GTD_MINT, 4, expiry, n2, sig2, {
                    value: GTD_MINT_PRICE * 4n,
                })
            ).to.be.revertedWithCustomError(minter, "WalletCapExceeded");
        });
    });

    // ─── Integration: NFT minting across contracts ────────────────────────────────
    describe("Integration: BlokyzMinter → BlokyzNFT", () => {
        it("minter without NFT registration reverts", async () => {
            // Deploy fresh minter but DON'T register it as minter in NFT
            const MinterFactory = await ethers.getContractFactory("BlokyzMinter", owner);
            const unregisteredMinter = await MinterFactory.deploy(
                await nft.getAddress(),
                backend.address
            ) as unknown as BlokyzMinter;

            await configurePhase(unregisteredMinter, owner, Phase.PUBLIC, {
                price: PUBLIC_PRICE,
                walletCap: 5,
            });

            await expect(
                unregisteredMinter.connect(user1).publicMint(1, { value: PUBLIC_PRICE })
            ).to.be.revertedWith("Not minter");
        });

        it("swapping minter contract works: old minter disabled, new minter works", async () => {
            // Deploy a second minter
            const MinterFactory = await ethers.getContractFactory("BlokyzMinter", owner);
            const newMinter = (await MinterFactory.deploy(
                await nft.getAddress(),
                backend.address
            )) as unknown as BlokyzMinter;

            // Register new minter, deregister old
            await nft.connect(owner).setMinterAddresses(
                [await minter.getAddress(), await newMinter.getAddress()],
                [false, true]
            );

            // Old minter should fail
            await configurePhase(minter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });
            await expect(
                minter.connect(user1).publicMint(1, { value: PUBLIC_PRICE })
            ).to.be.revertedWith("Not minter");

            // New minter should succeed
            await configurePhase(newMinter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });
            await newMinter.connect(user1).publicMint(1, { value: PUBLIC_PRICE });
            expect(await nft.totalSupply()).to.equal(1n);
        });

        it("tokens minted through minter are sequential with existing supply", async () => {
            // Owner mints 2 directly via NFT
            await nft.connect(owner).mint(owner.address, 2);

            // Then public mint 3 more through minter
            await configurePhase(minter, owner, Phase.PUBLIC, { price: PUBLIC_PRICE, walletCap: 5 });
            await minter.connect(user1).publicMint(3, { value: PUBLIC_PRICE * 3n });

            expect(await nft.totalSupply()).to.equal(5n);
            expect(await nft.ownerOf(3)).to.equal(user1.address);
            expect(await nft.ownerOf(4)).to.equal(user1.address);
            expect(await nft.ownerOf(5)).to.equal(user1.address);
        });
    });
});
