import { ethers } from "ethers";

const DELEGATE_V1_ADDRESS = "0x00000000000076A84feF008CDAbe6409d2FE638B";
const DELEGATE_V2_ADDRESS = "0x00000000000000447e69651d841bD8D104Bed493";

// Minimal ABIs for the registry calls we need
const V1_ABI = [
    "function getDelegationsByDelegate(address delegate) view returns (tuple(uint8 type_, address vault, address delegate, address contract_, uint256 tokenId)[])",
];

const V2_ABI = [
    "function getIncomingDelegations(address to) view returns (tuple(uint8 type_, address to, address from, bytes32 rights, address contract_, uint256 tokenId, uint256 amount)[])",
];

function getProvider(): ethers.JsonRpcProvider {
    const apiKey = process.env.ALCHEMY_API_KEY;
    const chainId = process.env.CHAIN_ID ?? "11155111";
    const network = chainId === "1" ? "homestead" : "sepolia";
    return new ethers.JsonRpcProvider(
        `https://eth-${network}.g.alchemy.com/v2/${apiKey}`
    );
}

/**
 * Given a hot wallet address, check delegate.xyz V2 then V1.
 * Returns the vault address if delegation found, or the hot wallet itself.
 */
export async function resolveWallet(hotWallet: string): Promise<string> {
    const provider = getProvider();
    const normalized = hotWallet.toLowerCase();

    try {
        // Check V2 first (newer, more granular)
        const v2 = new ethers.Contract(DELEGATE_V2_ADDRESS, V2_ABI, provider);
        const v2Delegations = await v2.getIncomingDelegations(hotWallet) as Array<{ type_: number; from: string }>;

        // type_ === 1 means ALL delegation (full wallet delegation)
        const v2All = v2Delegations.find((d) => d.type_ === 1);
        if (v2All) {
            console.log(`[delegate] V2 delegation found: ${v2All.from} → ${normalized}`);
            return v2All.from.toLowerCase();
        }

        // Fall back to V1
        const v1 = new ethers.Contract(DELEGATE_V1_ADDRESS, V1_ABI, provider);
        const v1Delegations = await v1.getDelegationsByDelegate(hotWallet) as Array<{ type_: number; vault: string }>;

        // type_ 1 = ALL delegation in V1
        const v1All = v1Delegations.find((d) => d.type_ === 1);
        if (v1All) {
            console.log(`[delegate] V1 delegation found: ${v1All.vault} → ${normalized}`);
            return v1All.vault.toLowerCase();
        }
    } catch (err) {
        console.error("[delegate] Error querying delegate.xyz:", err);
        // On error, fall through and just use the hot wallet
    }

    // No delegation found — use hot wallet directly
    return normalized;
}
