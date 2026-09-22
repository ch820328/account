import type { Metadata, Viewport } from "next";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Accounting - Firefly III Edition",
  description: "自託管個人財務與記帳：收支、房貸、外幣與持股預測",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;

  return (
    <html lang="zh-TW">
      <body>
        <Providers>
          <div className="app-layout">
            <Sidebar />
            <main className="app-content">
              {children}
            </main>
          </div>
          <BottomNav />
          {buildTime && (
            <div className="build-time">
              Build: {buildTime}
            </div>
          )}
        </Providers>
      </body>
    </html>
  );
}
