 "use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { usePublicClient } from "wagmi";
import { getPublishedTokens } from "@/lib/api";
import { NFT_ABI, NFT_ADDRESS } from "@/lib/contracts";
import styles from "./page.module.css";

const TOTAL_SUPPLY = 10_000;
const PER_PAGE     = 50;
const TOTAL_PAGES  = Math.ceil(TOTAL_SUPPLY / PER_PAGE); // 200
const NFT_IMAGE_URL = "https://ipfs.io/ipfs/bafkreicdbw4rdntfsvhhfde2dznwas7t4taxzutudejrarnyoweh6omzaa";
const NFT_IMAGE_FALLBACK_URL = "https://dweb.link/ipfs/bafkreicdbw4rdntfsvhhfde2dznwas7t4taxzutudejrarnyoweh6omzaa";

// How many page buttons to show around the current page
const SIBLINGS = 2;

function getPageRange(current: number, total: number): (number | "...")[] {
  const pages: (number | "...")[] = [];
  const left  = Math.max(2, current - SIBLINGS);
  const right = Math.min(total - 1, current + SIBLINGS);

  pages.push(1);
  if (left > 2) pages.push("...");
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push("...");
  if (total > 1) pages.push(total);

  return pages;
}

export default function CollectionPage() {
  const publicClient = usePublicClient();
  const [page, setPage] = useState(1);
  const [onchainRevealLive, setOnchainRevealLive] = useState(false);
  const [publishedSet, setPublishedSet] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (silent = false) => {
      if (!publicClient) return;
      if (!silent) setLoading(true);
      try {
        const [published, revealLive] = await Promise.all([
          getPublishedTokens(),
          publicClient.readContract({
            address: NFT_ADDRESS,
            abi: NFT_ABI,
            functionName: "revealed",
          }) as Promise<boolean>,
        ]);
        if (!mounted) return;
        setPublishedSet(new Set(published.tokenIds));
        setOnchainRevealLive(Boolean(revealLive));
      } catch {
        if (!mounted) return;
        setPublishedSet(new Set());
        setOnchainRevealLive(false);
      } finally {
        if (mounted && !silent) setLoading(false);
      }
    };
    load();
    const refresh = setInterval(() => {
      load(true);
    }, 15_000);
    return () => {
      mounted = false;
      clearInterval(refresh);
    };
  }, [publicClient]);

  const startId = (page - 1) * PER_PAGE + 1;
  const endId   = Math.min(page * PER_PAGE, TOTAL_SUPPLY);
  const ids     = useMemo(
    () => Array.from({ length: endId - startId + 1 }, (_, i) => startId + i),
    [startId, endId]
  );

  const goTo = useCallback((p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const pageRange = getPageRange(page, TOTAL_PAGES);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={`display ${styles.heading}`}>EXPLORE COLLECTION</h1>
        <p className="muted">10,000 Blokyz Phygital NFTs</p>
        {!onchainRevealLive && (
          <div className={styles.revealBanner}>
            <span>🔒</span>
            <span>Collection is unrevealed — stay tuned for the reveal!</span>
          </div>
        )}
        {onchainRevealLive && (
          <div className={styles.revealBanner}>
            <span>👤</span>
            <span>On-chain reveal is live. NFTs appear here after owners publish from Profile.</span>
          </div>
        )}
      </div>

      {/* Page info strip */}
      <div className={styles.pageInfo}>
        <span className="muted">
          Showing <strong style={{ color: "var(--accent)" }}>#{startId}–#{endId}</strong> of {TOTAL_SUPPLY.toLocaleString()}
        </span>
        <span className="muted">Page {page} / {TOTAL_PAGES}</span>
      </div>
      {loading && <p className="muted" style={{ marginBottom: 12 }}>Loading published NFTs...</p>}

      {/* Grid */}
      <div className={styles.grid}>
        {ids.map((id) => {
          const visible = onchainRevealLive && publishedSet.has(id);
          return (
            <div key={id} className={styles.nftCard}>
              <div className={styles.cardImage}>
                {visible ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={NFT_IMAGE_URL}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = NFT_IMAGE_FALLBACK_URL;
                    }}
                    alt={`Blokyz #${id}`}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.mystery}>
                    <span className={styles.mysteryIcon}>🧱</span>
                    <span className={`display ${styles.mysteryLabel}`}>?</span>
                  </div>
                )}
              </div>
              <div className={styles.cardInfo}>
                <span className={`display ${styles.cardName}`}>Blokyz #{id}</span>
                {!visible && <span className="muted" style={{ fontSize: "0.75rem" }}>Unrevealed</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <nav className={styles.pagination} aria-label="Collection pages">
        {/* Prev */}
        <button
          className={styles.pageBtn}
          onClick={() => goTo(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pageRange.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className={styles.ellipsis}>…</span>
          ) : (
            <button
              key={p}
              className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`}
              onClick={() => goTo(p as number)}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}

        {/* Next */}
        <button
          className={styles.pageBtn}
          onClick={() => goTo(page + 1)}
          disabled={page === TOTAL_PAGES}
          aria-label="Next page"
        >
          ›
        </button>
      </nav>
    </div>
  );
}
