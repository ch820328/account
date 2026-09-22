"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load persistence from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar:collapsed");
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    } catch {
      // ignore SSR or localStorage access issues
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar:collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const navItems = [
    { label: "儀表板", href: "/", icon: "📊" },
    { label: "交易紀錄", href: "/transactions", icon: "💸" },
    { label: "預算管理", href: "/budgets", icon: "📅" },
    { label: "排程中心", href: "/schedule", icon: "⏱️" },
    { label: "帳戶管理", href: "/accounts", icon: "🏦" },
    { label: "借貸管理", href: "/lending", icon: "🤝" },
    { label: "年度報告", href: "/reports", icon: "📊" },
    { label: "分類設定", href: "/categories", icon: "🏷️" },
    { label: "系統設定", href: "/settings", icon: "⚙️" },
  ];

  return (
    <aside className={`sidebar-nav ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        {!isCollapsed && (
          <div className="sidebar-brand-content">
            <div className="brand-logo">🔥</div>
            <div>
              <div className="brand-title">Accounting</div>
              <div className="brand-subtitle">Firefly III Edition</div>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="brand-logo" style={{ margin: "0 auto" }}>
            🔥
          </div>
        )}

        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={toggleCollapse}
          title={isCollapsed ? "展開側邊欄" : "縮小側邊欄"}
          style={isCollapsed ? { position: "absolute", bottom: -12, right: -4, zIndex: 10 } : undefined}
        >
          {isCollapsed ? "▶" : "◀"}
        </button>
      </div>

      <nav className="sidebar-menu">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? "active" : ""}`}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {!isCollapsed && <span className="sidebar-label">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="security-badge" title="自託管高隱私模式">
          <span>{isCollapsed ? "🔒" : "🔒 自託管高隱私模式"}</span>
        </div>
      </div>
    </aside>
  );
}
