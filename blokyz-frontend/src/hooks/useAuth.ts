"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import { getNonce, verifySignature, getMe, logout as apiLogout } from "@/lib/api";
import { CHAIN } from "@/lib/contracts";

export interface AuthState {
    authenticated: boolean;
    wallet: string | null;
    loading: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
    const { address } = useAccount();
    const { signMessageAsync } = useSignMessage();

    const [authenticated, setAuthenticated] = useState(false);
    const [wallet, setWallet] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Prevents two concurrent signIn() calls from racing and producing a nonce mismatch.
    // Without this, auto-sign-in and a manual trigger can each fetch a different nonce,
    // the session stores only the latest, and the SIWE verify fails.
    const signingIn = useRef(false);

    // Check session on mount
    useEffect(() => {
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
    }, []);

    const signIn = useCallback(async () => {
        if (!address) throw new Error("No wallet connected");
        if (signingIn.current) return; // already in progress — drop duplicate call
        signingIn.current = true;
        setLoading(true);
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
            setAuthenticated(result.ok);
            setWallet(result.wallet);
        } finally {
            setLoading(false);
            signingIn.current = false;
        }
    }, [address, signMessageAsync]);

    // Auto sign-in when wallet connects or once the session check resolves.
    // Must depend on `loading` too: if wagmi auto-reconnects (address already set
    // on mount), the address dep fires while loading=true and is skipped; we need
    // to re-run once loading flips to false.
    useEffect(() => {
        if (!address || loading || authenticated) return;
        signIn().catch(() => { }); // silently ignore wallet rejection
    }, [address, loading]); // eslint-disable-line react-hooks/exhaustive-deps

    const signOut = useCallback(async () => {
        await apiLogout();
        setAuthenticated(false);
        setWallet(null);
    }, []);

    return { authenticated, wallet, loading, signIn, signOut };
}
