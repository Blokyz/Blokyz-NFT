import { sepolia, mainnet } from "wagmi/chains";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
export const CHAIN = CHAIN_ID === 1 ? mainnet : sepolia;

export const NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT as `0x${string}`;
export const MINTER_ADDRESS = process.env.NEXT_PUBLIC_MINTER_CONTRACT as `0x${string}`;
export const IS_REVEALED = process.env.NEXT_PUBLIC_REVEALED === "true";

// ── ABIs ────────────────────────────────────────────────────────────────────

export const MINTER_ABI = [
    {
        name: "mint",
        type: "function",
        stateMutability: "payable",
        inputs: [
            { name: "qty", type: "uint256" },
            { name: "phase", type: "uint8" },
            { name: "maxAlloc", type: "uint256" },
            { name: "expiry", type: "uint256" },
            { name: "nonce", type: "string" },
            { name: "signature", type: "bytes" },
        ],
        outputs: [],
    },
    {
        name: "publicMint",
        type: "function",
        stateMutability: "payable",
        inputs: [{ name: "qty", type: "uint256" }],
        outputs: [],
    },
    {
        name: "currentPhase",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint8" }],
    },
    {
        name: "phases",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "phase", type: "uint8" }],
        outputs: [
            { name: "startTime", type: "uint256" },
            { name: "endTime", type: "uint256" },
            { name: "price", type: "uint256" },
            { name: "walletCap", type: "uint256" },
            { name: "active", type: "bool" },
        ],
    },
    {
        name: "mintedPerPhase",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "phase", type: "uint8" },
            { name: "wallet", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
    },
] as const;

export const NFT_ABI = [
    {
        name: "totalSupply",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "revealed",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "bool" }],
    },
    {
        name: "tokenURI",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "string" }],
    },
    {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "tokenOfOwnerByIndex",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "owner", type: "address" },
            { name: "index", type: "uint256" },
        ],
        outputs: [{ name: "tokenId", type: "uint256" }],
    },
] as const;

export const PHASE_NAMES: Record<number, string> = {
    0: "Not Live",
    1: "Guaranteed Free",
    2: "Guaranteed Mint",
    3: "Whitelist",
    4: "Public",
};

// Maps backend enum string → friendly display name
export const PHASE_DISPLAY_NAMES: Record<string, string> = {
    GTD_FREE: "Guaranteed Free",
    GTD_MINT: "Guaranteed Mint",
    WL_FCFS:  "Whitelist",
    PUBLIC:   "Public",
};
