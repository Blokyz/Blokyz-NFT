"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/hooks/useAuth";
import styles from "./NavBar.module.css";


export function NavBar() {
  const pathname = usePathname();
  const { authenticated, signIn: _signIn, signOut } = useAuth();


  const links = [
    { href: "/", label: "HOME" },
    { href: "/mint", label: "MINT" },
    { href: "/collection", label: "COLLECTION" },
  ];

  return (
    <nav className="nav">
      <Link href="/" className="nav-logo">BLOKYZ</Link>

      <ul className="nav-links">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className={pathname === href ? "active" : ""}>
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.navRight}>
        {authenticated && (
          <button className="btn btn-outline" style={{ fontSize: "0.75rem", padding: "8px 16px" }} onClick={signOut}>
            SIGN OUT
          </button>
        )}
        <ConnectButton
          showBalance={false}
          chainStatus="icon"
          accountStatus="avatar"
        />
      </div>
    </nav>
  );
}
