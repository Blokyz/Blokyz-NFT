"use client";

import { useState, useCallback } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { parseEther } from "viem";
import { getMintSignature, getEligibility, EligibilityResult } from "@/lib/api";
import { MINTER_ADDRESS, MINTER_ABI } from "@/lib/contracts";

export type MintStatus = "idle" | "checking" | "signing" | "pending" | "success" | "error";

export function useMint() {
    const { writeContractAsync } = useWriteContract();
    const publicClient = usePublicClient();

    const [status, setStatus] = useState<MintStatus>("idle");
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);

    const checkEligibility = useCallback(async () => {
        setStatus("checking");
        setError(null);
        try {
            const result = await getEligibility();
            setEligibility(result);
            setStatus("idle");
            return result;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to check eligibility";
            setError(msg);
            setStatus("error");
            return null;
        }
    }, []);

    const mint = useCallback(async (qty: number) => {
        setStatus("signing");
        setError(null);
        setTxHash(null);

        try {
            // Guard: ensure contract addresses are configured
            if (!MINTER_ADDRESS || !MINTER_ADDRESS.startsWith("0x")) {
                throw new Error("Minter contract address not configured — contact support");
            }

            // 1. Get signature from backend
            const sig = await getMintSignature();

            // 2. Calculate ETH value from the signature response price (always fresh from contract)
            const priceWei = sig.price ? BigInt(sig.price) * BigInt(qty) : 0n;

            // 3. Call contract
            setStatus("pending");

            let hash: `0x${string}`;

            if (sig.phase === 4) {
                // PUBLIC — no signature needed
                hash = await writeContractAsync({
                    address: MINTER_ADDRESS,
                    abi: MINTER_ABI,
                    functionName: "publicMint",
                    args: [BigInt(qty)],
                    value: priceWei,
                    gas: 500_000n,
                });
            } else {
                hash = await writeContractAsync({
                    address: MINTER_ADDRESS,
                    abi: MINTER_ABI,
                    functionName: "mint",
                    args: [
                        BigInt(qty),
                        sig.phase,
                        BigInt(sig.maxAlloc),
                        BigInt(sig.expiry),
                        sig.nonce,
                        sig.signature as `0x${string}`,
                    ],
                    value: priceWei,
                    gas: 500_000n,
                });
            }

            setTxHash(hash);

            // 4. Wait for confirmation and verify it didn't revert
            const receipt = await publicClient?.waitForTransactionReceipt({ hash });
            if (receipt?.status === "reverted") {
                throw new Error("Transaction reverted on-chain — check phase timing or eligibility");
            }
            setStatus("success");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Transaction failed";
            setError(msg);
            setStatus("error");
        }
    }, [writeContractAsync, publicClient, eligibility]);

    const reset = () => {
        setStatus("idle");
        setError(null);
        setTxHash(null);
    };

    return { status, txHash, error, eligibility, checkEligibility, mint, reset };
}
