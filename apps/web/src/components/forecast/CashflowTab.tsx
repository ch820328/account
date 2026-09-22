"use client";

import { Amount } from "@/components/Amount";
import { SkeletonList } from "@/components/Skeleton";
import type { ForecastMonthRow, ForecastAccount } from "./types";

interface CashflowTabProps {
  isLoading: boolean;
  selectedAccountId: string;
  onSelectAccount: (accId: string) => void;
  accounts: ForecastAccount[];
  forecastMonths: ForecastMonthRow[];
}

export function CashflowTab({
  isLoading,
  selectedAccountId,
  onSelectAccount,
  accounts,
  forecastMonths,
}: CashflowTabProps) {
  return (
    <div>
      {/* Account Filter Pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>查看帳戶：</span>
        <button
          type="button"
          className={`chip${selectedAccountId === "" ? " chip-on" : ""}`}
          onClick={() => onSelectAccount("")}
          style={{ fontSize: 12 }}
        >
          全部現金與銀行 (綜合金流)
        </button>
        {accounts.map((acc) => (
          <button
            key={acc.id}
            type="button"
            className={`chip${selectedAccountId === acc.id ? " chip-on" : ""}`}
            onClick={() => onSelectAccount(acc.id)}
            style={{ fontSize: 12 }}
          >
            🏦 {acc.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : forecastMonths.length === 0 ? (
        <div className="ff3-card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
          尚無未來月份的預估資料
        </div>
      ) : (
        <div className="ff3-card" style={{ padding: "18px 20px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "10px 12px" }}>月份</th>
                <th style={{ padding: "10px 12px" }}>預期收入 (薪資/收入)</th>
                <th style={{ padding: "10px 12px" }}>固定流出 (排程/分期)</th>
                <th style={{ padding: "10px 12px" }}>年度預算支出 (動態均攤+固定月)</th>
                <th style={{ padding: "10px 12px" }}>預估當月淨金流</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>預估月底餘額</th>
              </tr>
            </thead>
            <tbody>
              {forecastMonths.map((row) => {
                const netPositive = row.netCashflowMinor >= 0n;
                const balanceSafe = row.projectedBalanceMinor > 0n;

                return (
                  <tr
                    key={row.monthKey}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      background: row.isCurrent ? "rgba(99, 102, 241, 0.06)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px", fontWeight: 600 }}>
                      {row.month} 月
                      {row.isCurrent && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            background: "rgba(99, 102, 241, 0.2)",
                            color: "#a5b4fc",
                            padding: "1px 6px",
                            borderRadius: 4,
                          }}
                        >
                          當前月份
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px", color: "var(--income)", fontFamily: "monospace" }}>
                      +<Amount value={row.inflowMinor} currency="TWD" />
                    </td>
                    <td style={{ padding: "12px", color: "var(--expense)", fontFamily: "monospace" }}>
                      -<Amount value={row.fixedOutflowMinor} currency="TWD" />
                    </td>
                    <td style={{ padding: "12px", color: "#facc15", fontFamily: "monospace" }}>
                      -<Amount value={row.budgetOutflowMinor} currency="TWD" />
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        fontWeight: 600,
                        fontFamily: "monospace",
                        color: netPositive ? "var(--income)" : "var(--expense)",
                      }}
                    >
                      {netPositive ? "+" : ""}
                      <Amount value={row.netCashflowMinor} currency="TWD" />
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", fontFamily: "monospace", fontSize: 14 }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 4,
                          fontWeight: 700,
                          background: balanceSafe
                            ? "rgba(53, 196, 141, 0.12)"
                            : "rgba(239, 68, 68, 0.15)",
                          color: balanceSafe ? "var(--income)" : "var(--expense)",
                        }}
                      >
                        <Amount value={row.projectedBalanceMinor} currency="TWD" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>💡 預估月底餘額 = 上月餘額 + 預期收入 - (固定支出 + 年度預算扣除)</span>
            <span>✅ 綠色：餘額健康充足</span>
            <span>📌 若含所得稅分期或房屋稅，會在 5、6、7 月或特定月份精確體現大筆支出。</span>
          </div>
        </div>
      )}
    </div>
  );
}
