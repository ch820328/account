"use client";

import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string };

const ITEMS: Item[] = [
  { href: "/", label: "儀表板", icon: "📊" },
  { href: "/transactions", label: "明細", icon: "💸" },
  { href: "/accounts", label: "帳戶", icon: "🏦" },
  { href: "/budgets", label: "預算", icon: "📅" },
  { href: "/reports", label: "報告", icon: "📋" },
];

export function BottomNav() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session?.user || pathname === "/login") return null;

  return (
    <nav className="bottom-nav" aria-label="行動端主導覽">
      {ITEMS.map((it) => {
        const isActive = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`bn-item ${isActive ? "active" : ""}`}
          >
            <span className="bn-icon">{it.icon}</span>
            <span className="bn-label">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
