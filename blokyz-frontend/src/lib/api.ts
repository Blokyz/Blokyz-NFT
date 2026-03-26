const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...init?.headers },
        ...init,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data as T;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export const getNonce = () => apiFetch<{ nonce: string }>("/auth/nonce");

export const verifySignature = (message: string, signature: string) =>
    apiFetch<{ ok: boolean; wallet: string }>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
    });

export const getMe = () =>
    apiFetch<{ authenticated: boolean; wallet?: string }>("/auth/me");

export const logout = () =>
    apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" });

// ── Eligibility ─────────────────────────────────────────────────────────────

export interface EligibilityResult {
    eligible: boolean;
    reason?: string;
    phase?: string;
    tier?: string;
    alreadyMinted?: number;
    remaining?: number;
    maxAlloc?: number;
    walletCap?: number;
    price?: string;
    resolvedWallet?: string;
}

export const getEligibility = () => apiFetch<EligibilityResult>("/eligibility");

// ── Mint ────────────────────────────────────────────────────────────────────

export interface MintSignatureResult {
    signature: string;
    nonce: string;
    expiry: number;
    maxAlloc: number;
    phase: number;
    price: string;       // always fresh from the contract at signature time
    alreadyMinted: number;
    remaining: number;
    resolvedWallet?: string;
}

export const getMintSignature = () =>
    apiFetch<MintSignatureResult>("/mint/signature", { method: "POST" });

export interface PhaseInfo {
    phase: string;
    startTime: number;
    endTime: number;
    price: string;
    walletCap: number;
    active: boolean;
}

export const getMintPhase = () => apiFetch<PhaseInfo>("/mint/phase");

