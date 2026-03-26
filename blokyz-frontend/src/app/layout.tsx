import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Blokyz — Phygital NFT Collection",
  description: "Mint, collect, and claim your Blokyz phygital toy NFTs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <NavBar />
          <main className="page">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
