import { ethers } from "ethers";
import { Phase } from "./signerService.js";

const MINTER_ABI = [
    "function phases(uint8 phase) view returns (uint256 startTime, uint256 endTime, uint256 price, uint256 walletCap, bool active)",
    "function mintedPerPhase(uint8 phase, address wallet) view returns (uint256)",
    "function currentPhase() view returns (uint8)",
];

function getProvider(): ethers.JsonRpcProvider {
    const chainId = process.env.CHAIN_ID ?? "11155111";
    const network = chainId === "1" ? "homestead" : "sepolia";
    return new ethers.JsonRpcProvider(
        `https://eth-${network}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    );
}

function getMinterContract(): ethers.Contract {
    const address = process.env.MINTER_CONTRACT_ADDRESS;
    if (!address) throw new Error("MINTER_CONTRACT_ADDRESS not configured");
    return new ethers.Contract(address, MINTER_ABI, getProvider());
}

export interface PhaseInfo {
    phase: Phase;
    phaseName: string;
    startTime: number;
    endTime: number;
    price: bigint;
    walletCap: number;
    active: boolean;
}

/**
 * Returns the currently active phase from the contract.
 */
export async function getCurrentPhase(): Promise<Phase> {
    const contract = getMinterContract();
    const phaseNum = await contract.currentPhase() as bigint;
    return Number(phaseNum) as Phase;
}

/**
 * Returns full config for a given phase.
 */
export async function getPhaseInfo(phase: Phase): Promise<PhaseInfo> {
    const contract = getMinterContract();
    const cfg = await contract.phases(phase) as {
        startTime: bigint;
        endTime: bigint;
        price: bigint;
        walletCap: bigint;
        active: boolean;
    };

    return {
        phase,
        phaseName: Phase[phase] ?? "UNKNOWN",
        startTime: Number(cfg.startTime),
        endTime: Number(cfg.endTime),
        price: cfg.price,
        walletCap: Number(cfg.walletCap),
        active: cfg.active,
    };
}

/**
 * Returns how many tokens hotWallet has minted in a given phase on-chain.
 * NOTE: contract tracks by msg.sender (hot wallet), not vault.
 */
export async function getMintedCount(phase: Phase, hotWallet: string): Promise<number> {
    const contract = getMinterContract();
    const count = await contract.mintedPerPhase(phase, hotWallet) as bigint;
    return Number(count);
}
