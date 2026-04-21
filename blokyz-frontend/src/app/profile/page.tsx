"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient } from "wagmi";
import { useAuth } from "@/hooks/useAuth";
import { getOwnedTokens, getPublishedTokens, publishToken } from "@/lib/api";
import { NFT_ABI, NFT_ADDRESS } from "@/lib/contracts";
import styles from "./page.module.css";

const NFT_IMAGE_URL = "https://ipfs.io/ipfs/bafkreicdbw4rdntfsvhhfde2dznwas7t4taxzutudejrarnyoweh6omzaa";

export default function ProfilePage() {
  const { isConnected, address } = useAccount();
  const { authenticated, loading: authLoading, error: authError, signIn } = useAuth();
  const publicClient = usePublicClient();

  const [ownedTokenIds, setOwnedTokenIds] = useState<number[]>([]);
  const [publishedSet, setPublishedSet] = useState<Set<number>>(new Set());
  const [collectionRevealLive, setCollectionRevealLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publishingTokenId, setPublishingTokenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfileData = useCallback(async (silent = false) => {
    if (!publicClient || !address) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [publishedResponse, ownedResponse, isRevealed] = await Promise.all([
        getPublishedTokens(),
        getOwnedTokens(),
        publicClient.readContract({
          address: NFT_ADDRESS,
          abi: NFT_ABI,
          functionName: "revealed",
        }) as Promise<boolean>,
      ]);

      setPublishedSet(new Set(publishedResponse.tokenIds));
      setCollectionRevealLive(Boolean(isRevealed));
      setOwnedTokenIds([...ownedResponse.tokenIds].sort((a, b) => a - b));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load profile NFTs";
      setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    if (!authenticated || !address) return;
    loadProfileData();
  }, [authenticated, address, loadProfileData]);

  useEffect(() => {
    if (!authenticated || !address) return;
    const refresh = setInterval(() => {
      loadProfileData(true);
    }, 20_000);
    return () => clearInterval(refresh);
  }, [authenticated, address, loadProfileData]);

  const handlePublish = useCallback(async (tokenId: number) => {
    setPublishingTokenId(tokenId);
    setError(null);
    try {
      await publishToken(tokenId);
      setPublishedSet((prev) => new Set(prev).add(tokenId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to publish NFT";
      setError(msg);
    } finally {
      setPublishingTokenId(null);
    }
  }, []);

  const publishedCount = useMemo(
    () => ownedTokenIds.filter((id) => publishedSet.has(id)).length,
    [ownedTokenIds, publishedSet]
  );

  if (!isConnected) {
    return (
      <div className={styles.center}>
        <h1 className={`display ${styles.heading}`}>PROFILE</h1>
        <p className="muted">Connect your wallet to view your NFTs.</p>
        <div style={{ marginTop: 24 }}>
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (!authenticated) {
    if (authError) {
      return (
        <div className={styles.center}>
          <p style={{ color: "#ef4444", marginBottom: 8 }}>Sign-in failed: {authError}</p>
          <button className="btn btn-primary" onClick={signIn}>Try Again</button>
        </div>
      );
    }

    return (
      <div className={styles.center}>
        <span className="spinner" style={{ width: 40, height: 40 }} />
        <p className="muted" style={{ marginTop: 16 }}>
          {authLoading ? "Signing in to Blokyz..." : "Preparing your profile..."}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={`display ${styles.heading}`}>MY PROFILE</h1>
        <p className="muted">Review your owned NFTs and publish them to Collection.</p>
        <button
          className="btn btn-outline"
          style={{ marginTop: 12, fontSize: "0.78rem" }}
          onClick={() => loadProfileData()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className={`card ${styles.statusCard}`}>
        <div>
          <p className={styles.metricLabel}>Owned</p>
          <p className={`display ${styles.metric}`}>{ownedTokenIds.length}</p>
        </div>
        <div>
          <p className={styles.metricLabel}>Published</p>
          <p className={`display ${styles.metric}`}>{publishedCount}</p>
        </div>
        <div>
          <p className={styles.metricLabel}>On-chain reveal</p>
          <p className={`display ${styles.metric}`}>{collectionRevealLive ? "LIVE" : "LOCKED"}</p>
        </div>
      </div>

      {error && (
        <div className={`card ${styles.errorCard}`}>
          <p>❌ {error}</p>
        </div>
      )}

      {loading ? (
        <div className={styles.center}>
          <span className="spinner" style={{ width: 36, height: 36 }} />
          <p className="muted">Loading your NFTs...</p>
        </div>
      ) : ownedTokenIds.length === 0 ? (
        <div className={`card ${styles.emptyCard}`}>
          <p className="display" style={{ fontSize: "1.4rem" }}>No NFTs found</p>
          <p className="muted">Mint from the Mint page to see NFTs here.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {ownedTokenIds.map((tokenId) => {
            const isPublished = publishedSet.has(tokenId);
            const canPublish = collectionRevealLive && !isPublished;
            const busy = publishingTokenId === tokenId;

            return (
              <div key={tokenId} className={styles.nftCard}>
                <div className={styles.cardImage}>
                  {isPublished ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={NFT_IMAGE_URL}
                      alt={`Blokyz #${tokenId}`}
                    />
                  ) : (
                    <div className={styles.mystery}>
                      <span className={styles.mysteryIcon}>🧱</span>
                      <span className={`display ${styles.mysteryLabel}`}>?</span>
                    </div>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <p className={`display ${styles.cardTitle}`}>Blokyz #{tokenId}</p>
                  <p className="muted" style={{ fontSize: "0.8rem" }}>
                    {isPublished ? "Visible in Collection" : "Hidden in Collection"}
                  </p>
                  <button
                    className="btn btn-primary"
                    disabled={!canPublish || busy}
                    onClick={() => handlePublish(tokenId)}
                    style={{ width: "100%", marginTop: 12 }}
                  >
                    {busy ? "Publishing..." : isPublished ? "Published" : "Reveal and Publish"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
