 "use client";

import { useState, useMemo, useCallback } from "react";
import { IS_REVEALED } from "@/lib/contracts";
import styles from "./page.module.css";

const TOTAL_SUPPLY = 10_000;
const PER_PAGE     = 50;
const TOTAL_PAGES  = Math.ceil(TOTAL_SUPPLY / PER_PAGE); // 200

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
  const revealed = IS_REVEALED;
  const [page, setPage] = useState(1);

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
        {!revealed && (
          <div className={styles.revealBanner}>
            <span>🔒</span>
            <span>Collection is unrevealed — stay tuned for the reveal!</span>
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

      {/* Grid */}
      <div className={styles.grid}>
        {ids.map((id) => (
          <div key={id} className={styles.nftCard}>
            <div className={styles.cardImage}>
              {revealed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://ipfs.io/ipfs/YOUR_CID/${id}.png`}
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
              {!revealed && <span className="muted" style={{ fontSize: "0.75rem" }}>Unrevealed</span>}
            </div>
          </div>
        ))}
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
