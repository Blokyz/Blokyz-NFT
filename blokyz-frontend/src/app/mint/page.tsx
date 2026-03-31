"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/hooks/useAuth";
import { useMint } from "@/hooks/useMint";
import { useCountdown } from "@/hooks/useCountdown";
import { PHASE_DISPLAY_NAMES } from "@/lib/contracts";
import styles from "./page.module.css";

// ── Countdown Bar component ──────────────────────────────────────────────────
function CountdownBar({ upcoming = false }: { upcoming?: boolean }) {
  const { progress, timeLeft, timeElapsed, mode, secondsLeft } = useCountdown();
  if (mode === "none" && !upcoming) return null;
  if (mode === "none" && upcoming) return (
    <p className="muted" style={{ fontSize: "0.85rem", textAlign: "center" }}>
      Mint hasn't started yet. Follow us for updates.
    </p>
  );

  const pct = Math.round(progress * 100);
  const isUrgent = !upcoming && secondsLeft < 300; // last 5 mins
  const fillClass = upcoming
    ? `${styles.countdownFill} ${styles.countdownFillUpcoming}`
    : isUrgent
      ? styles.countdownFillUrgent
      : styles.countdownFill;

  return (
    <div className={styles.countdownWrap}>
      <div className={styles.countdownMeta}>
        <span className={styles.countdownMetaLabel}>
          {upcoming ? "Next phase" : "Phase"}&nbsp;
          <span style={{ color: upcoming ? "var(--muted)" : isUrgent ? "#ef4444" : "inherit" }}>
            {upcoming ? "starts in" : "ends in"}
          </span>
        </span>
        <span className={styles.countdownTime}>{timeLeft}</span>
      </div>

      <div className={styles.countdownTrack}>
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>

      <div className={styles.countdownMeta} style={{ marginTop: -4 }}>
        <span className={styles.countdownMetaLabel}>elapsed: {timeElapsed}</span>
        <span className={styles.countdownMetaLabel}>{pct}% done</span>
      </div>
    </div>
  );
}

export default function MintPage() {
  const { isConnected } = useAccount();
  const { authenticated, loading: authLoading, error: authError, signIn } = useAuth();
  const { status, txHash, error: mintError, eligibility, checkEligibility, mint, reset } = useMint();
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!authenticated) return;
    // Retry up to 3 times with backoff to handle transient RPC/backend errors
    let attempts = 0;
    const run = async () => {
      const result = await checkEligibility();
      if (!result && attempts < 2) {
        attempts++;
        setTimeout(run, 1500 * attempts);
      }
    };
    run();
  }, [authenticated, checkEligibility]);

  const handleMint = useCallback(async () => {
    reset();
    await mint(qty);
  }, [mint, qty, reset]);

  // ── Not connected
  if (!isConnected) return (
    <div className={styles.center}>
      <h1 className={`display ${styles.heading}`}>Mint Blokyz</h1>
      <p className="muted">Connect your wallet to get started</p>
      <div style={{ marginTop: 24 }}>
        <ConnectButton />
      </div>
    </div>
  );

  // ── Connected but not signed in
  if (!authenticated) {
    if (authError) return (
      <div className={styles.center}>
        <p style={{ color: "#ef4444", marginBottom: 8 }}>Sign-in failed: {authError}</p>
        <button className="btn btn-primary" onClick={signIn}>Try Again</button>
      </div>
    );
    return (
      <div className={styles.center}>
        <span className="spinner" style={{ width: 40, height: 40 }} />
        <p className="muted" style={{ marginTop: 16 }}>Signing in to Blokyz...</p>
      </div>
    );
  }


  // ── Success
  if (status === "success") return (
    <div className={styles.center}>
      <div className={styles.successIcon}>🎉</div>
      <h1 className={`display ${styles.heading}`}>You're a Blokyz Holder!</h1>
      <p className="muted">Transaction confirmed</p>
      {txHash && (
        <a
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
          target="_blank" rel="noopener noreferrer"
          className={styles.txLink}
        >
          View on Etherscan ↗
        </a>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button className="btn btn-outline" onClick={() => { reset(); checkEligibility(); }}>Mint More</button>
        <a href="/collection" className="btn btn-primary">View Collection</a>
      </div>
    </div>
  );

  // ── Checking / loading
  if (status === "checking" || authLoading) return (
    <div className={styles.center}>
      <span className="spinner" style={{ width: 40, height: 40 }} />
      <p className="muted" style={{ marginTop: 16 }}>Checking eligibility...</p>
    </div>
  );

  const phaseName = eligibility?.phase ? (PHASE_DISPLAY_NAMES[eligibility.phase] ?? eligibility.phase) : null;
  const noPhase = !eligibility || (eligibility.reason === "No active mint phase");

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <h1 className={`display ${styles.heading}`}>Mint Blokyz</h1>

        {/* Phase info */}
        <div className={`card ${styles.phaseCard}`}>
          {noPhase ? (
            <div className={styles.phaseEmpty}>
              <p className="display" style={{ fontSize: "1.5rem", color: "var(--muted)" }}>No Active Phase</p>
              <CountdownBar upcoming />
            </div>
          ) : (
            <>
              <div className={styles.phaseHeader}>
                <span className={`badge badge-live display`}>
                  {phaseName ?? "ACTIVE"}
                </span>
                <span className="muted" style={{ fontSize: "0.875rem" }}>
                  {eligibility?.price === "0" ? "FREE" : eligibility?.price ? `${Number(BigInt(eligibility.price)) / 1e18} ETH` : "—"} per token
                </span>
              </div>

              <div className={styles.allocRow}>
                <div className={styles.allocStat}>
                  <span className="muted">Minted</span>
                  <span className={`display ${styles.statNum}`}>{eligibility?.alreadyMinted ?? 0}</span>
                </div>
                <div className={styles.allocStat}>
                  <span className="muted">Remaining</span>
                  <span className={`display ${styles.statNum}`} style={{ color: "var(--accent)" }}>
                    {eligibility?.remaining ?? 0}
                  </span>
                </div>
                <div className={styles.allocStat}>
                  <span className="muted">Allocation</span>
                  <span className={`display ${styles.statNum}`}>{eligibility?.maxAlloc ?? eligibility?.walletCap ?? "—"}</span>
                </div>
              </div>

              {eligibility?.resolvedWallet && (
                <p className="muted" style={{ fontSize: "0.75rem", marginTop: 8 }}>
                  🔗 Delegated from {eligibility.resolvedWallet.slice(0, 6)}...{eligibility.resolvedWallet.slice(-4)}
                </p>
              )}

              <CountdownBar />
            </>
          )}
        </div>

        {/* Eligibility message */}
        {eligibility && !eligibility.eligible && eligibility.reason && (
          <div className={`card ${styles.warningCard}`}>
            <p>⚠️ {eligibility.reason}</p>
            {eligibility.tier === "WL" && eligibility.phase && (eligibility.phase === "GTD_FREE" || eligibility.phase === "GTD_MINT") && (
              <p className="muted" style={{ marginTop: 8, fontSize: "0.8rem" }}>
                Your Whitelist phase starts after the Guaranteed Mint window ends.
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {mintError && (
          <div className={`card ${styles.errorCard}`}>
            <p>❌ {mintError}</p>
            <button className="btn btn-outline" style={{ marginTop: 12, fontSize: "0.8rem" }} onClick={() => { reset(); checkEligibility(); }}>
              Try Again
            </button>
          </div>
        )}

        {/* Mint controls */}
        {eligibility?.eligible && (
          <div className={`card ${styles.mintCard}`}>
            <label className="form-label">Quantity</label>
            <div className={styles.qtyRow}>
              <button className="btn btn-outline" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <span className={`display ${styles.qty}`}>{qty}</span>
              <button className="btn btn-outline" onClick={() => setQty(q => Math.min(eligibility.remaining ?? 1, q + 1))}>+</button>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 20, fontSize: "1.1rem", padding: "16px" }}
              onClick={handleMint}
              disabled={status === "pending" || status === "signing"}
            >
              {status === "signing" ? <><span className="spinner" /> Getting Signature...</> :
               status === "pending" ? <><span className="spinner" /> Confirming...</> :
               `MINT ${qty} BLOKYZ`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
