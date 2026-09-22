"use client";

import React from "react";
import { fmt } from "@/lib/format";

export interface CreditCardItem {
  id?: string | null;
  name: string;
  currency: string;
  accountNumber?: string | null;
  cardNumber?: string | null;
  cardBrand?: string | null;
  bankCode?: string | null;
}

interface CreditCardSelectorProps {
  cards: CreditCardItem[];
  selectedCardId: string;
  onSelectCard: (id: string) => void;
  actualExpenseMinor: bigint;
  upcomingExpenseMinor: bigint;
  totalExposureMinor: bigint;
  currency: string;
  cardTotalsMap?: Record<string, bigint>;
}

export function getCurrencyFlag(currency?: string): string {
  switch (currency?.toUpperCase()) {
    case "TWD":
      return "🇹🇼";
    case "USD":
      return "🇺🇸";
    case "JPY":
      return "🇯🇵";
    case "EUR":
      return "🇪🇺";
    case "GBP":
      return "🇬🇧";
    case "HKD":
      return "🇭🇰";
    case "CNY":
      return "🇨🇳";
    case "KRW":
      return "🇰🇷";
    case "SGD":
      return "🇸🇬";
    case "AUD":
      return "🇦🇺";
    case "CAD":
      return "🇨🇦";
    case "CHF":
      return "🇨🇭";
    default:
      return "🌐";
  }
}

function getCardTheme(name: string, index: number): { bg: string; accent: string } {
  if (name.includes("中信") || name.includes("中國信託")) {
    return {
      bg: "linear-gradient(135deg, #064e3b 0%, #065f46 60%, #022c22 100%)",
      accent: "#34d399",
    };
  }
  if (name.includes("富邦")) {
    return {
      bg: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 60%, #172554 100%)",
      accent: "#60a5fa",
    };
  }
  if (name.includes("台新")) {
    return {
      bg: "linear-gradient(135deg, #881337 0%, #9f1239 60%, #4c0519 100%)",
      accent: "#fb7185",
    };
  }
  if (name.includes("國泰") || name.includes("世華")) {
    return {
      bg: "linear-gradient(135deg, #14532d 0%, #15803d 60%, #052e16 100%)",
      accent: "#4ade80",
    };
  }
  if (name.includes("玉山")) {
    return {
      bg: "linear-gradient(135deg, #047857 0%, #0f766e 60%, #134e4a 100%)",
      accent: "#2dd4bf",
    };
  }

  const palettes = [
    { bg: "linear-gradient(135deg, #334155 0%, #1e293b 60%, #0f172a 100%)", accent: "#94a3b8" },
    { bg: "linear-gradient(135deg, #4c1d95 0%, #3730a3 60%, #1e1b4b 100%)", accent: "#a5b4fc" },
    { bg: "linear-gradient(135deg, #701a75 0%, #86198f 60%, #4a044e 100%)", accent: "#f472b6" },
  ];
  return palettes[index % palettes.length] ?? palettes[0]!;
}

export function CreditCardSelector({
  cards,
  selectedCardId,
  onSelectCard,
  actualExpenseMinor,
  upcomingExpenseMinor,
  totalExposureMinor,
  currency,
  cardTotalsMap,
}: CreditCardSelectorProps) {
  const currentCard = cards.find((c) => (c.id || "") === selectedCardId);

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 1. Realistic Credit Card Selector Buttons */}
      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 14,
          scrollbarWidth: "thin",
        }}
      >
        {/* Individual Credit Cards Only */}
        {cards.map((card, idx) => {
          const cardId = card.id || "";
          const isSelected = selectedCardId === cardId;
          const theme = getCardTheme(card.name, idx);
          const flag = getCurrencyFlag(card.currency);
          const rawNum = card.cardNumber || card.accountNumber || "";
          const last4 = rawNum ? rawNum.slice(-4) : "";
          const cardTotal = cardTotalsMap ? cardTotalsMap[cardId] : undefined;

          return (
            <button
              key={cardId || idx}
              type="button"
              onClick={() => onSelectCard(cardId)}
              style={{
                flex: "0 0 168px",
                height: 102,
                borderRadius: 12,
                padding: "10px 12px",
                textAlign: "left",
                cursor: "pointer",
                background: theme.bg,
                border: isSelected ? `2px solid ${theme.accent}` : "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: isSelected
                  ? `0 0 0 1px ${theme.accent}, 0 8px 18px -4px rgba(0, 0, 0, 0.5)`
                  : "0 2px 8px rgba(0, 0, 0, 0.3)",
                opacity: isSelected ? 1 : 0.65,
                transform: isSelected ? "translateY(-2px)" : "none",
                transition: "all 0.18s ease-in-out",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                color: "#ffffff",
              }}
              title={`切換至 ${card.name}`}
            >
              {/* Card Top: Bank Name + Currency Flag */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 110,
                  }}
                >
                  {card.name}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600 }}>
                  <span style={{ fontSize: 13 }}>{flag}</span>
                  <span style={{ opacity: 0.85, fontSize: 10 }}>{card.currency || "TWD"}</span>
                </div>
              </div>

              {/* Card Middle: EMV Chip + Contactless Wave */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <EmvChip />
                <ContactlessWave />
              </div>

              {/* Card Bottom: Card number last4 & Total / Active badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.2,
                      color: "rgba(255, 255, 255, 0.9)",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {last4 ? `•••• ${last4}` : "•••• ••••"}
                  </div>
                  {cardTotal !== undefined && (
                    <div style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.75)", marginTop: 1 }}>
                      {fmt(-cardTotal, card.currency || "TWD")}
                    </div>
                  )}
                </div>

                {isSelected && (
                  <span
                    style={{
                      fontSize: 10,
                      background: "rgba(255, 255, 255, 0.22)",
                      color: "#fff",
                      padding: "1px 6px",
                      borderRadius: 10,
                      fontWeight: 600,
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    ✓ 使用中
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. 當前總開銷 (包含排程) Summary Line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderRadius: 8,
          background: "linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%)",
          border: "1px solid rgba(239, 68, 68, 0.22)",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            💳
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--fg)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{currentCard ? `${currentCard.name} 當前開銷` : "當前總開銷"}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "rgba(239, 68, 68, 0.18)",
                  color: "#f87171",
                }}
              >
                包含排程
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              已請款 {fmt(-actualExpenseMinor, currency)} + 排程待繳 {fmt(-upcomingExpenseMinor, currency)}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: totalExposureMinor > 0n ? "#ef4444" : "var(--fg)",
              fontFamily: "var(--font-mono, monospace)",
              letterSpacing: "-0.5px",
            }}
          >
            {fmt(-totalExposureMinor, currency)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** EMV Gold Microchip graphic */
function EmvChip() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none" style={{ borderRadius: 3, flexShrink: 0 }}>
      <rect width="22" height="16" rx="3" fill="url(#chip-grad)" />
      <rect x="0.5" y="0.5" width="21" height="15" rx="2.5" stroke="#ca8a04" strokeOpacity="0.4" />
      <line x1="7" y1="0" x2="7" y2="16" stroke="#854d0e" strokeWidth="0.8" strokeOpacity="0.4" />
      <line x1="15" y1="0" x2="15" y2="16" stroke="#854d0e" strokeWidth="0.8" strokeOpacity="0.4" />
      <line x1="0" y1="8" x2="22" y2="8" stroke="#854d0e" strokeWidth="0.8" strokeOpacity="0.4" />
      <rect x="7" y="4" width="8" height="8" rx="1.5" fill="#fef08a" fillOpacity="0.7" stroke="#854d0e" strokeWidth="0.8" />
      <defs>
        <linearGradient id="chip-grad" x1="0" y1="0" x2="22" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#eab308" />
          <stop offset="1" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Contactless Wireless Wave Icon */
function ContactlessWave() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255, 255, 255, 0.7)"
      strokeWidth="2"
      strokeLinecap="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M8.5 16.5a5 5 0 0 1 0-9" />
      <path d="M12 19a9 9 0 0 0 0-14" />
      <path d="M15.5 21.5a13 13 0 0 0 0-19" />
    </svg>
  );
}
