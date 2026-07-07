import type { Metadata, Viewport } from "next";
import { BottomNav } from "@/components/BottomNav";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Home Accounting",
  description: "自託管的個人記帳：收支、定期扣款、外幣與持股",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <Providers>
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
