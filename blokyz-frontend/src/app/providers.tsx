"use client";

import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rainbowWallet,
  trustWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CHAIN } from "@/lib/contracts";

import "@rainbow-me/rainbowkit/styles.css";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

if (!projectId && typeof window !== "undefined") {
  console.warn(
    "[Blokyz] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. " +
    "Get a free one at https://cloud.walletconnect.com"
  );
}

const config = getDefaultConfig({
  appName: "Blokyz",
  projectId: projectId || "00000000000000000000000000000000",
  chains: [CHAIN],
  ssr: true,
  wallets: [
    {
      groupName: "Popular",
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        rainbowWallet,
        trustWallet,
        walletConnectWallet,
      ],
    },
  ],
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#f5c518",
            accentColorForeground: "#000000",
            borderRadius: "medium",
            fontStack: "system",
          })}
          coolMode
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

