const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";
const TOKEN_KEY = "blokyz_auth_token";

// In-memory cache — survives re-renders, populated from localStorage on first read
let _memToken: string | null = null;

export const tokenStore = {
    get: (): string | null => {
        if (_memToken) return _memToken;
        if (typeof window !== "undefined") {
            _memToken = localStorage.getItem(TOKEN_KEY);
        }
        return _memToken;
    },
    set: (token: string) => {
        _memToken = token;
        if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
    },
    clear: () => {
        _memToken = null;
        if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
    },
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = tokenStore.get();
    const res = await fetch(`${BASE}${path}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init?.headers,
        },
        ...init,
    });
    const raw = await res.text();
    let data: unknown = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        data = null;
    }
    if (!res.ok) {
        const errorMessage =
            (data && typeof data === "object" && "error" in data && typeof data.error === "string")
                ? data.error
                : `Request failed (${res.status})`;
        throw new Error(errorMessage);
    }
    return data as T;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export const getNonce = () => apiFetch<{ nonce: string }>("/auth/nonce");

export const verifySignature = (message: string, signature: string) =>
    apiFetch<{ ok: boolean; wallet: string; token: string }>("/auth/verify", {
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

// ── Profile / Publish ───────────────────────────────────────────────────────

export interface PublishedTokensResult {
    tokenIds: number[];
}

export interface PublishTokenResult {
    ok: boolean;
    tokenId: number;
    publisher: string;
    alreadyPublished: boolean;
}

export const getPublishedTokens = () =>
    apiFetch<PublishedTokensResult>("/profile/published");

export interface OwnedTokensResult {
    tokenIds: number[];
}

export const getOwnedTokens = () =>
    apiFetch<OwnedTokensResult>("/profile/owned");

export const publishToken = (tokenId: number) =>
    apiFetch<PublishTokenResult>("/profile/publish", {
        method: "POST",
        body: JSON.stringify({ tokenId }),
    });

