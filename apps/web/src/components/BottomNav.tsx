"use client";

import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode };

function Icon({ path }: { path: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const ITEMS: Item[] = [
  { href: "/", label: "首頁", icon: <Icon path="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" /> },
  { href: "/schedule", label: "排程", icon: <Icon path="M3 8h18M7 3v4m10-4v4M4 8v12a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" /> },
  { href: "/accounts", label: "帳戶", icon: <Icon path="M3 6h18v12H3zM3 10h18M7 15h4" /> },
  { href: "/net-worth", label: "淨值", icon: <Icon path="M4 19V5m0 14h16M8 15l3-4 3 3 4-6" /> },
];

export function BottomNav() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session?.user || pathname === "/login") return null;

  return (
    <nav className="bottom-nav" aria-label="主導覽">
      {ITEMS.slice(0, 2).map((it) => (
        <Link key={it.href} href={it.href} className={`bn-item${pathname === it.href ? " active" : ""}`}>
          {it.icon}
          <span>{it.label}</span>
        </Link>
      ))}

      <Link href="/entry" className="bn-fab" aria-label="記錄">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>

      {ITEMS.slice(2).map((it) => (
        <Link key={it.href} href={it.href} className={`bn-item${pathname === it.href ? " active" : ""}`}>
          {it.icon}
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
