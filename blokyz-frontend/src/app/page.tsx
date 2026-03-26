"use client";

import styles from "./page.module.css";
import Link from "next/link";

const NAV_CARDS = [
  { href: "/mint",       label: "MINT",       sub: "Get your Blokyz",    emoji: "⚡" },
  { href: "/collection", label: "COLLECTION", sub: "View all 10K NFTs",  emoji: "🧱" },
  { href: "https://discord.gg/4jPfrfqE", label: "JOIN",  sub: "Join the community", emoji: "🎮", external: true },
  { href: "https://x.com/OriginalBlokyz", label: "FOLLOW", sub: "Follow on X", emoji: "𝕏", external: true },
];

export default function HomePage() {
  return (
    <div className={styles.container}>
      {/* Hero */}
      <div className={styles.hero}>
        <h1 className={`display ${styles.logo}`}>BLOKYZ</h1>
        <p className={styles.tagline}>10,000 Phygital Block Toys on Ethereum</p>
      </div>

      {/* Nav cards */}
      <div className={styles.cards}>
        {NAV_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            target={card.external ? "_blank" : undefined}
            rel={card.external ? "noopener noreferrer" : undefined}
            className={styles.card}
          >
            <span className={styles.cardEmoji}>{card.emoji}</span>
            <span className={`display ${styles.cardLabel}`}>{card.label}</span>
            <span className={`muted ${styles.cardSub}`}>{card.sub}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
