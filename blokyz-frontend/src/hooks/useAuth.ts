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

    // Tracks which address has already had a sign-in attempted so the auto-effect
    // never retries automatically — the user must click "Try Again" manually.
    const attemptedAddress = useRef<string | null>(null);
    const signingIn = useRef(false);

    // Check session on mount — JWT in localStorage takes priority over cookie session
    useEffect(() => {
        const token = tokenStore.get();
        if (token) {
            // Validate token with server (also works as a keepalive check)
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
        } else {
            // No token — check cookie session as fallback
            getMe()
                .then((me) => {
                    setAuthenticated(me.authenticated);
                    setWallet(me.wallet ?? null);
                })
                .catch(() => {
                    setAuthenticated(false);
                    setWallet(null);
                })
                .finally(() => setLoading(false));
        }
    }, []);

    const signIn = useCallback(async () => {
        if (!address) throw new Error("No wallet connected");
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

            const signature = await signMessageAsync({
                message: message.prepareMessage(),
            });

            const result = await verifySignature(message.prepareMessage(), signature);
            if (result.token) tokenStore.set(result.token);
            setAuthenticated(result.ok);
            setWallet(result.wallet);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Sign-in failed";
            // Ignore wallet rejections — user cancelled intentionally
            if (!msg.toLowerCase().includes("rejected") && !msg.toLowerCase().includes("denied")) {
                setError(msg);
            }
        } finally {
            setLoading(false);
            signingIn.current = false;
        }
    }, [address, signMessageAsync]);

    // Auto sign-in once per address after the session check resolves.
    // Uses attemptedAddress ref to avoid retrying on every render — if it fails
    // the user must click "Try Again" manually.
    useEffect(() => {
        if (!address || loading || authenticated) return;
        if (attemptedAddress.current === address) return;
        attemptedAddress.current = address;
        signIn();
    }, [address, loading, signIn]);

    // Reset attempted flag when address changes (wallet switch)
    useEffect(() => {
        attemptedAddress.current = null;
        setError(null);
        setAuthenticated(false);
        setWallet(null);
    }, [address]);

    const signOut = useCallback(async () => {
        tokenStore.clear();
        await apiLogout();
        setAuthenticated(false);
        setWallet(null);
    }, []);

    return { authenticated, wallet, loading, error, signIn, signOut };
}
