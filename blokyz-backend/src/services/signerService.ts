import { ethers } from "ethers";
import { randomUUID } from "crypto";

// Phase enum matching the contract exactly
export enum Phase {
    NONE = 0,
    GTD_FREE = 1,
    GTD_MINT = 2,
    WL_FCFS = 3,
    PUBLIC = 4,
}

const EXPIRY_SECONDS = 600; // 10 minutes

/**
 * Generates an ECDSA signature for a mint request.
 * Must match the contract's _validateSignature logic exactly:
 *   keccak256(abi.encodePacked(wallet, phase, maxAlloc, expiry, nonce))
 *   then wrapped with Ethereum signed message prefix
 */
export async function generateMintSignature(
    hotWallet: string,
    phase: Phase,
    maxAlloc: number
): Promise<{
    signature: string;
    nonce: string;
    expiry: number;
    maxAlloc: number;
    phase: Phase;
}> {
    const privateKey = process.env.SIGNER_PRIVATE_KEY;
    if (!privateKey) throw new Error("SIGNER_PRIVATE_KEY not configured");

    const signer = new ethers.Wallet(privateKey);

    const nonce = randomUUID();
    const expiry = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;

    // Match contract: keccak256(abi.encodePacked(wallet, phase, maxAlloc, expiry, nonce))
    const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "uint256", "string"],
        [hotWallet, BigInt(phase), BigInt(maxAlloc), BigInt(expiry), nonce]
    );

    // Wrap with Ethereum signed message prefix (toEthSignedMessageHash)
    const signature = await signer.signMessage(ethers.getBytes(messageHash));

    console.log(`[signer] Signed mint for ${hotWallet} phase=${Phase[phase]} maxAlloc=${maxAlloc} expiry=${expiry}`);

    return { signature, nonce, expiry, maxAlloc, phase };
}

/**
 * Returns the signer's public address — useful for verifying the
 * SIGNER_PRIVATE_KEY matches what's registered in the contract.
 */
export function getSignerAddress(): string {
    const privateKey = process.env.SIGNER_PRIVATE_KEY;
    if (!privateKey) throw new Error("SIGNER_PRIVATE_KEY not configured");
    return new ethers.Wallet(privateKey).address;
}
