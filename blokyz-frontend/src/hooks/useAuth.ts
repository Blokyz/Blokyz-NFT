"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import { getNonce, verifySignature, getMe, logout as apiLogout, tokenStore } from "@/lib/api";
import { CHAIN } from "@/lib/contracts";

export interface AuthState {
    authenticated: boolean;
    wallet: string | null;
    loading: boolean;
    error: string | null;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
    const { address } = useAccount();
    const { signMessageAsync } = useSignMessage();

    const [authenticated, setAuthenticated] = useState(false);
    const [wallet, setWallet] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const signingIn = useRef(false);
    // Tracks which address we've already attempted auto sign-in for
    const attemptedForAddress = useRef<string | null>(null);
    // Tracks previous address to detect wallet switches vs initial connect
    const prevAddress = useRef<string | undefined>(undefined);

    // ── On mount: validate existing JWT / session ────────────────────────────
    useEffect(() => {
        getMe()
            .then((me) => {
                if (me.authenticated) {
                    setAuthenticated(true);
                    setWallet(me.wallet ?? null);
                } else {
                    tokenStore.clear();
                }
            })
            .catch(() => tokenStore.clear())
            .finally(() => setLoading(false));
    }, []);

    // ── signIn ───────────────────────────────────────────────────────────────
    const signIn = useCallback(async () => {
        if (!address) return;
        if (signingIn.current) return;
        signingIn.current = true;
        setLoading(true);
        setError(null);
        try {
            const { nonce } = await getNonce();
            const message = new SiweMessage({
                domain: window.location.host,
                address,
                statement: "Sign in to Blokyz",
                uri: window.location.origin,
                version: "1",
                chainId: CHAIN.id,
                nonce,
            });
            const signature = await signMessageAsync({ message: message.prepareMessage() });
            const result = await verifySignature(message.prepareMessage(), signature);
            if (result.token) tokenStore.set(result.token);
            setAuthenticated(result.ok);
            setWallet(result.wallet);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Sign-in failed";
            // Swallow intentional wallet rejections — user dismissed the prompt
            if (!msg.toLowerCase().includes("rejected") && !msg.toLowerCase().includes("denied")) {
                setError(msg);
            }
        } finally {
            setLoading(false);
            signingIn.current = false;
        }
    }, [address, signMessageAsync]);

    // ── Auto sign-in: fires once per address after session check resolves ────
    useEffect(() => {
        // Wait for the session check to finish
        if (loading) return;
        // Already authenticated — nothing to do
        if (authenticated) return;
        // No wallet connected
        if (!address) return;
        // Already tried for this address — don't retry (user must click Try Again)
        if (attemptedForAddress.current === address) return;

        attemptedForAddress.current = address;
        signIn();
    }, [address, loading, authenticated, signIn]);

    // ── Handle wallet switch (address changes to a different value) ──────────
    useEffect(() => {
        const prev = prevAddress.current;
        prevAddress.current = address;

        // Only reset when switching from one address to another — not on initial connect
        if (prev !== undefined && prev !== address) {
            setAuthenticated(false);
            setWallet(null);
            setError(null);
            tokenStore.clear();
            attemptedForAddress.current = null;
        }
    }, [address]);

    // ── Sign out ─────────────────────────────────────────────────────────────
    const signOut = useCallback(async () => {
        tokenStore.clear();
        attemptedForAddress.current = null;
        await apiLogout().catch(() => { });
        setAuthenticated(false);
        setWallet(null);
    }, []);

    return { authenticated, wallet, loading, error, signIn, signOut };
}
