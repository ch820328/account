"use client";

import { TRPCProvider } from "@/lib/trpc";

export function Providers({ children }: { children: React.ReactNode }) {
  return <TRPCProvider>{children}</TRPCProvider>;
}
