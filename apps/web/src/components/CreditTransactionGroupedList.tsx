"use client";

import { useMemo, useState } from "react";
import { Amount } from "@/components/Amount";
import { SkeletonList } from "@/components/Skeleton";
import { ZeroState } from "@/components/ZeroState";
import { getCategoryFullName } from "@/lib/categories";
import type { TransactionRow } from "@/components/TransactionList";
import { trpc } from "@/lib/trpc";
import { niceConfirm } from "@/lib/confirm";
import { CategoryOptions } from "@/components/CategoryOptions";
import { CategoryPickerModal } from "@/components/CategoryPickerModal";

interface CategoryLike {
  id: string;
  name: string;
  kind?: string;
  parentId?: string | null;
}

interface CreditTransactionGroupedListProps {
  data: TransactionRow[] | undefined;
  loading: boolean;
  categories?: CategoryLike[];
  onManualAdd?: () => void;
  onImportCsv?: () => void;
}

interface DayGroup {
  dateKey: string;
  dayNumber: number;
  items: TransactionRow[];
  totalMinor: bigint;
  currency: string;
}

interface PeriodGroup {
  id: string;
  sortKey: string;
  title: string;
  subTitle: string;
  isInstallment?: boolean;
  badgeBg: string;
  badgeBorder: string;
  badgeColor: string;
  accentColor: string;
  icon: string;
  dayGroups: DayGroup[];
  totalMinor: bigint;
  currency: string;
  itemCount: number;
  _dayMap?: Map<string, DayGroup>;
}

function getLocalDateKey(dateInput: Date | string): string {
  const dt = new Date(dateInput);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayHeader(dateKey: string): { title: string; weekday: string } {
  const parts = dateKey.split("-").map(Number);
  const dt = new Date(parts[0] || 2026, (parts[1] || 1) - 1, parts[2] || 1);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  const y = dt.getFullYear();
  const weekday = `星期${weekdays[dt.getDay()]}`;
  return {
    title: `${y}/${m}/${day}`,
    weekday,
  };
}

function isInstallmentTx(t: TransactionRow): boolean {
  if (t.source === "installment") return true;
  if (!t.note) return false;
  // Matches:
  // 1. Keyword "分期", "期數"
  // 2. Bank patterns: "單筆０４－０６", "分期06-06", "單筆 04/06" (full-width or half-width numbers)
  // 3. Parentheses notation: "(04/06)", "(分期 04/06)"
  const pattern =
    /(?:(?:單筆|分期)\s*[\d０-９]{1,2}\s*[－\-\/]\s*[\d０-９]{1,2}|\(\s*(?:分期\s*)?[\d０-９]{1,2}\s*[\/\-－]\s*[\d０-９]{1,2}\s*\)|分期|期數)/;
  return pattern.test(t.note);
}

export function CreditTransactionGroupedList({
  data,
  loading,
  categories = [],
  onManualAdd,
  onImportCsv,
}: CreditTransactionGroupedListProps) {
  const rows: TransactionRow[] = Array.isArray(data)
    ? data
    : ((data as unknown as { items?: TransactionRow[] })?.items || []);

  // Sort direction: "asc" (舊 -> 新，如 8/21~31 -> 9/1~10) or "desc" (新 -> 舊，如 9/1~10 -> 8/21~31)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  // Track custom expanded/collapsed overrides for period groups
  const [collapsedOverrides, setCollapsedOverrides] = useState<Record<string, boolean>>({});

  const utils = trpc.useUtils();
  const [pickerTarget, setPickerTarget] = useState<{
    id: string;
    categoryId: string | null;
    note: string;
    tx: TransactionRow;
  } | null>(null);

  const categoriesQuery = trpc.categories.list.useQuery(undefined, {
    enabled: !categories || categories.length === 0,
  });
  const allCategories = (categories && categories.length > 0) ? categories : (categoriesQuery.data ?? []);

  const updateMutation = trpc.transactions.update.useMutation({
    onSuccess: () => {
      utils.transactions.invalidate();
      utils.categories.invalidate();
    },
  });

  const handleUpdateCategory = async (t: TransactionRow, newCategoryId: string | null) => {
    if (t.categoryId === newCategoryId) return;
    try {
      await updateMutation.mutateAsync({
        id: t.id,
        categoryId: newCategoryId,
      });
    } catch (err) {
      alert((err as Error).message || "修改分類失敗");
    }
  };

  const deleteMutation = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      utils.transactions.invalidate();
      utils.accounts.invalidate();
      utils.categories.invalidate();
    },
  });

  const handleDelete = async (t: TransactionRow) => {
    const ok = await niceConfirm(
      "刪除交易",
      `確定要刪除「${t.note || t.accountName}」這筆交易嗎？\n金額：-$${(Number(t.amountMinor) / 100).toLocaleString()}`,
      "danger"
    );
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync({ id: t.id });
    } catch (err) {
      alert((err as Error).message || "刪除失敗");
    }
  };

  // Group transactions into:
  // 1. "分期" Group (always pinned to the top if present)
  // 2. Dynamic Decade Period Groups (e.g. 8/21~31, 9/1~10, only shown if there are transactions)
  const { periodGroups, hasInstallments } = useMemo(() => {
    if (!rows || rows.length === 0) return { periodGroups: [], hasInstallments: false };

    const baseCurrency = rows[0]?.currency || "TWD";
    const installmentRows: TransactionRow[] = [];
    const regularRows: TransactionRow[] = [];

    for (const t of rows) {
      if (isInstallmentTx(t)) {
        installmentRows.push(t);
      } else {
        regularRows.push(t);
      }
    }

    // 1. Build Installment Group (if any)
    let installmentGroup: PeriodGroup | null = null;
    if (installmentRows.length > 0) {
      const instDayMap = new Map<string, DayGroup>();
      let totalMinor = 0n;

      for (const t of installmentRows) {
        const key = getLocalDateKey(t.occurredAt);
        const dayNum = parseInt(key.slice(8), 10) || 1;
        if (!instDayMap.has(key)) {
          instDayMap.set(key, {
            dateKey: key,
            dayNumber: dayNum,
            items: [],
            totalMinor: 0n,
            currency: t.currency || "TWD",
          });
        }
        const dg = instDayMap.get(key)!;
        dg.items.push(t);
        if (t.type === "expense") {
          dg.totalMinor += BigInt(t.amountMinor);
          totalMinor += BigInt(t.amountMinor);
        }
      }

      const sortedInstDayGroups = Array.from(instDayMap.values()).sort((a, b) =>
        sortDirection === "desc"
          ? b.dateKey.localeCompare(a.dateKey)
          : a.dateKey.localeCompare(b.dateKey)
      );

      installmentGroup = {
        id: "installment",
        sortKey: "0000-00-0",
        title: "分期",
        subTitle: "分期付款排程",
        isInstallment: true,
        badgeBg: "rgba(168, 85, 247, 0.14)",
        badgeBorder: "rgba(168, 85, 247, 0.4)",
        badgeColor: "#c084fc",
        accentColor: "#a855f7",
        icon: "💳",
        dayGroups: sortedInstDayGroups,
        totalMinor,
        currency: baseCurrency,
        itemCount: installmentRows.length,
      };
    }

    // 2. Build Regular Dynamic Decade Groups (e.g. 8/21~31, 9/1~10, only if they have transactions)
    const periodMap = new Map<string, PeriodGroup>();

    for (const t of regularRows) {
      const dt = new Date(t.occurredAt);
      const y = dt.getFullYear();
      const m = dt.getMonth() + 1;
      const d = dt.getDate();

      let decade = 1;
      let title = `${m}/1 ~ 10`;
      let subTitle = `${m}月上旬`;
      let icon = "🌱";
      let badgeBg = "rgba(99, 102, 241, 0.12)";
      let badgeBorder = "rgba(99, 102, 241, 0.35)";
      let badgeColor = "#818cf8";
      let accentColor = "#6366f1";

      if (d <= 10) {
        decade = 1;
        title = `${m}/1 ~ 10`;
        subTitle = `${m}月上旬`;
        icon = "🌱";
        badgeBg = "rgba(99, 102, 241, 0.12)";
        badgeBorder = "rgba(99, 102, 241, 0.35)";
        badgeColor = "#818cf8";
        accentColor = "#6366f1";
      } else if (d <= 20) {
        decade = 2;
        title = `${m}/11 ~ 20`;
        subTitle = `${m}月中旬`;
        icon = "☀️";
        badgeBg = "rgba(56, 189, 248, 0.12)";
        badgeBorder = "rgba(56, 189, 248, 0.35)";
        badgeColor = "#38bdf8";
        accentColor = "#0284c7";
      } else {
        decade = 3;
        const lastDay = new Date(y, m, 0).getDate();
        title = `${m}/21 ~ ${lastDay}`;
        subTitle = `${m}月下旬`;
        icon = "🌙";
        badgeBg = "rgba(244, 114, 182, 0.12)";
        badgeBorder = "rgba(244, 114, 182, 0.35)";
        badgeColor = "#f472b6";
        accentColor = "#db2777";
      }

      const periodKey = `${y}-${String(m).padStart(2, "0")}-${decade}`;

      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, {
          id: periodKey,
          sortKey: periodKey,
          title,
          subTitle,
          icon,
          badgeBg,
          badgeBorder,
          badgeColor,
          accentColor,
          dayGroups: [],
          totalMinor: 0n,
          currency: baseCurrency,
          itemCount: 0,
          _dayMap: new Map<string, DayGroup>(),
        });
      }

      const period = periodMap.get(periodKey)!;
      period.itemCount += 1;
      if (t.type === "expense") {
        period.totalMinor += BigInt(t.amountMinor);
      }

      // Add directly to day group in O(1)
      const dateKey = getLocalDateKey(t.occurredAt);
      if (period._dayMap) {
        if (!period._dayMap.has(dateKey)) {
          period._dayMap.set(dateKey, {
            dateKey,
            dayNumber: d,
            items: [],
            totalMinor: 0n,
            currency: t.currency || "TWD",
          });
        }
        const dg = period._dayMap.get(dateKey)!;
        dg.items.push(t);
        if (t.type === "expense") {
          dg.totalMinor += BigInt(t.amountMinor);
        }
      }
    }

    // Sort day groups inside each period
    for (const period of periodMap.values()) {
      period.dayGroups = Array.from(period._dayMap?.values() ?? []).sort((a, b) =>
        sortDirection === "desc"
          ? b.dateKey.localeCompare(a.dateKey)
          : a.dateKey.localeCompare(b.dateKey)
      );
    }

    // Sort regular dynamic period groups by chronological key (e.g. 2026-08-3 < 2026-09-1)
    const sortedRegularPeriods = Array.from(periodMap.values()).sort((a, b) =>
      sortDirection === "desc"
        ? b.sortKey.localeCompare(a.sortKey)
        : a.sortKey.localeCompare(b.sortKey)
    );

    // Installment is always placed at the very top (per user request)
    const finalGroups = installmentGroup
      ? [installmentGroup, ...sortedRegularPeriods]
      : sortedRegularPeriods;

    return {
      periodGroups: finalGroups,
      hasInstallments: Boolean(installmentGroup),
    };
  }, [rows, sortDirection]);

  if (loading) return <SkeletonList rows={6} />;

  if (!rows || rows.length === 0) {
    return (
      <ZeroState
        icon="💳"
        title="尚無信用卡交易紀錄"
        description="您可以手動記錄單筆刷卡或分期，也可以匯入中信或各家信用卡對帳單 CSV。"
        actionText="➕ 手動新增交易"
        onActionClick={onManualAdd}
        secondaryActionText="📥 匯入 CSV"
        onSecondaryActionClick={onImportCsv}
        secondaryActionHref={!onImportCsv ? "/transactions" : undefined}
      />
    );
  }

  const togglePeriod = (id: string, defaultOpen: boolean) => {
    setCollapsedOverrides((prev) => {
      const current = prev[id] !== undefined ? prev[id] : !defaultOpen;
      return { ...prev, [id]: !current };
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Group View Sub-Header / Sort Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "4px 6px",
          fontSize: 12,
          color: "var(--muted)",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>🗓️ 區間分群檢視：</span>
          {hasInstallments && (
            <>
              <span style={{ color: "#c084fc", fontWeight: 600 }}>💳 分期</span>
              <span style={{ opacity: 0.4 }}>•</span>
            </>
          )}
          <span style={{ color: "#818cf8", fontWeight: 600 }}>上旬 (1~10)</span>
          <span style={{ opacity: 0.4 }}>•</span>
          <span style={{ color: "#38bdf8", fontWeight: 600 }}>中旬 (11~20)</span>
          <span style={{ opacity: 0.4 }}>•</span>
          <span style={{ color: "#f472b6", fontWeight: 600 }}>下旬 (21~底)</span>
        </div>

        <button
          type="button"
          onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 5,
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "var(--fg)",
            cursor: "pointer",
            fontSize: 11.5,
          }}
          title="切換群組排序方向"
        >
          <span>順序:</span>
          <span style={{ fontWeight: 700, color: "#fbbf24" }}>
            {sortDirection === "asc" ? "舊 ➔ 新 (時間正序)" : "新 ➔ 舊 (時間倒序)"}
          </span>
          <span style={{ fontSize: 10 }}>⇅</span>
        </button>
      </div>

      {/* Render Period Groups (分期 group at top, then decade groups like 8/21~31, 9/1~10) */}
      {periodGroups.map((period) => {
        const hasItems = period.itemCount > 0;
        // Default: expand if has transactions, collapse if empty
        const isExpanded =
          collapsedOverrides[period.id] !== undefined
            ? !collapsedOverrides[period.id]
            : hasItems;

        return (
          <div
            key={period.id}
            style={{
              background: "rgba(255, 255, 255, 0.015)",
              border: `1px solid ${hasItems ? period.badgeBorder : "rgba(255, 255, 255, 0.07)"}`,
              borderRadius: 10,
              overflow: "hidden",
              transition: "border 0.15s ease",
            }}
          >
            {/* Level 1: Period Group Header */}
            <div
              onClick={() => togglePeriod(period.id, hasItems)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "9px 16px",
                background: hasItems
                  ? `linear-gradient(90deg, ${period.badgeBg} 0%, rgba(255, 255, 255, 0.02) 100%)`
                  : "rgba(255, 255, 255, 0.02)",
                cursor: "pointer",
                userSelect: "none",
                borderBottom: isExpanded ? `1px solid ${period.badgeBorder}` : "none",
              }}
              title="點擊可展開或收合此區間"
            >
              {/* Left: Icon, Badge, Title, Item Count */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: period.badgeColor,
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.15s ease",
                    display: "inline-block",
                  }}
                >
                  ▶
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{period.icon}</span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13.5,
                      color: hasItems ? period.badgeColor : "var(--muted)",
                      letterSpacing: "0.3px",
                    }}
                  >
                    {period.title}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: hasItems ? "var(--fg)" : "var(--muted)",
                      fontWeight: 600,
                      opacity: 0.9,
                    }}
                  >
                    ({period.subTitle})
                  </span>
                </div>

                <span
                  style={{
                    fontSize: 11,
                    padding: "1px 7px",
                    borderRadius: 10,
                    background: hasItems ? period.badgeBg : "rgba(255, 255, 255, 0.05)",
                    color: hasItems ? period.badgeColor : "var(--muted)",
                    fontWeight: 600,
                    border: `1px solid ${hasItems ? period.badgeBorder : "rgba(255, 255, 255, 0.08)"}`,
                  }}
                >
                  {period.itemCount} 筆
                </span>
              </div>

              {/* Right: Period Subtotal */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
                  {period.isInstallment ? "分期合計:" : "區間合計:"}
                </span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    fontSize: 13.5,
                    color: hasItems ? "var(--expense)" : "var(--muted)",
                  }}
                >
                  {hasItems ? (
                    <Amount
                      value={period.totalMinor}
                      currency={period.currency}
                      kind="expense"
                      signed={true}
                    />
                  ) : (
                    "$0"
                  )}
                </span>
              </div>
            </div>

            {/* Period Content: Contains Daily Groups */}
            {isExpanded && (
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                {period.dayGroups.map((group) => {
                  const { title, weekday } = formatDayHeader(group.dateKey);

                  return (
                    <div
                      key={group.dateKey}
                      style={{
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        overflow: "hidden",
                      }}
                    >
                      {/* Level 2: Single-Day Group Header */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "7px 14px",
                          background: "rgba(255, 255, 255, 0.05)",
                          borderBottom: "1px solid var(--border)",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                          <span style={{ color: period.badgeColor }}>📅</span>
                          <span style={{ color: "var(--fg)", letterSpacing: "0.3px" }}>{title}</span>
                          <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 11 }}>
                            ({weekday})
                          </span>
                          <span
                            style={{
                              background: "rgba(255, 255, 255, 0.08)",
                              padding: "1px 6px",
                              borderRadius: 10,
                              fontSize: 11,
                              color: "var(--muted)",
                              fontWeight: 400,
                            }}
                          >
                            {group.items.length} 筆
                          </span>
                        </div>

                        {/* Day Subtotal */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          <span style={{ color: "var(--muted)" }}>當日合計:</span>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 700,
                              color: "var(--expense)",
                            }}
                          >
                            <Amount
                              value={group.totalMinor}
                              currency={group.currency}
                              kind="expense"
                              signed={true}
                            />
                          </span>
                        </div>
                      </div>

                      {/* Level 3: All Items for this Single Day */}
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {group.items.map((t, index) => {
                          const categoryLabel =
                            getCategoryFullName(t.categoryId, categories) !== "未分類"
                              ? getCategoryFullName(t.categoryId, categories)
                              : t.categoryName ?? "信用卡支出";
                          const isInst = isInstallmentTx(t);

                          return (
                            <div
                              key={t.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "9px 14px",
                                borderBottom:
                                  index < group.items.length - 1
                                    ? "1px solid rgba(255, 255, 255, 0.04)"
                                    : "none",
                                transition: "background 0.15s ease",
                              }}
                              className="hover-row"
                            >
                              {/* Left: Merchant / Note + Category & Card Info */}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  flex: 1,
                                  minWidth: 0,
                                  marginRight: 12,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 3,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: "var(--fg)",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                    title={t.note || t.accountName}
                                  >
                                    {t.note || t.accountName}
                                  </div>

                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {/* Installment Badge */}
                                    {isInst && (
                                      <span
                                        style={{
                                          fontSize: 10.5,
                                          padding: "1px 6px",
                                          borderRadius: 4,
                                          background: "rgba(168, 85, 247, 0.15)",
                                          color: "#c084fc",
                                          border: "1px solid rgba(168, 85, 247, 0.35)",
                                          fontWeight: 600,
                                        }}
                                      >
                                        🔄 分期付款
                                      </span>
                                    )}

                                    {/* Category pill with cascading modal picker */}
                                    {(() => {
                                      const isUncat = !t.categoryId || categoryLabel === "未分類" || categoryLabel === "信用卡支出";
                                      return (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPickerTarget({
                                              id: t.id,
                                              categoryId: t.categoryId,
                                              note: t.note || t.accountName,
                                              tx: t,
                                            });
                                          }}
                                          style={{
                                            fontSize: 10.5,
                                            padding: "2px 8px",
                                            borderRadius: 5,
                                            background: isUncat ? "rgba(239, 68, 68, 0.16)" : "rgba(99, 102, 241, 0.12)",
                                            color: isUncat ? "#fca5a5" : "#a5b4fc",
                                            border: isUncat ? "1.5px solid #ef4444" : "1px solid rgba(99, 102, 241, 0.25)",
                                            boxShadow: isUncat ? "0 0 8px rgba(239, 68, 68, 0.28)" : "none",
                                            fontWeight: isUncat ? 700 : 500,
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                            transition: "all 0.15s ease",
                                          }}
                                          onMouseEnter={(e) => {
                                            if (isUncat) {
                                              e.currentTarget.style.background = "rgba(239, 68, 68, 0.28)";
                                              e.currentTarget.style.borderColor = "#f87171";
                                            } else {
                                              e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)";
                                              e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.5)";
                                              e.currentTarget.style.color = "#fff";
                                            }
                                          }}
                                          onMouseLeave={(e) => {
                                            if (isUncat) {
                                              e.currentTarget.style.background = "rgba(239, 68, 68, 0.16)";
                                              e.currentTarget.style.borderColor = "#ef4444";
                                            } else {
                                              e.currentTarget.style.background = "rgba(99, 102, 241, 0.12)";
                                              e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.25)";
                                              e.currentTarget.style.color = "#a5b4fc";
                                            }
                                          }}
                                          title="點擊修改此筆消費分類"
                                        >
                                          <span>🏷️ {categoryLabel}</span>
                                          <span style={{ fontSize: 9, opacity: isUncat ? 0.9 : 0.6 }}>✏️</span>
                                        </button>
                                      );
                                    })()}

                                    {/* Card Name */}
                                    <span
                                      style={{
                                        fontSize: 10.5,
                                        padding: "1px 6px",
                                        borderRadius: 4,
                                        background: "rgba(255, 255, 255, 0.06)",
                                        color: "var(--muted)",
                                      }}
                                    >
                                      💳 {t.accountName}
                                    </span>

                                    {/* Statement month tag if differs from swipe */}
                                    {t.statementMonth && (
                                      <span
                                        style={{
                                          fontSize: 10.5,
                                          padding: "1px 5px",
                                          borderRadius: 4,
                                          background: "rgba(234, 179, 8, 0.12)",
                                          color: "#facc15",
                                          border: "1px solid rgba(234, 179, 8, 0.3)",
                                        }}
                                        title={`計入 ${t.statementMonth} 月帳單`}
                                      >
                                        🗓️ {t.statementMonth.slice(5)}月帳單
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right: Amount & Actions */}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <div
                                  style={{
                                    fontFamily: "monospace",
                                    fontSize: 14,
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                    textAlign: "right",
                                  }}
                                >
                                  <Amount
                                    value={t.amountMinor}
                                    currency={t.currency}
                                    kind={
                                      t.type === "expense"
                                        ? "expense"
                                        : t.type === "income"
                                        ? "income"
                                        : "neutral"
                                    }
                                    signed={t.type !== "transfer"}
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(t);
                                  }}
                                  style={{
                                    background: "rgba(255, 255, 255, 0.04)",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    cursor: "pointer",
                                    padding: "3px 6px",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    color: "var(--muted)",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#ef4444";
                                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
                                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "var(--muted)";
                                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                                  }}
                                  title="刪除此筆交易"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Cascading Two-Column Category Picker Modal */}
      <CategoryPickerModal
        isOpen={!!pickerTarget}
        onClose={() => setPickerTarget(null)}
        categories={allCategories}
        currentCategoryId={pickerTarget?.categoryId}
        transactionNote={pickerTarget?.note}
        kind="expense"
        onSelect={async (newCatId) => {
          if (pickerTarget && newCatId !== pickerTarget.categoryId) {
            await handleUpdateCategory(pickerTarget.tx, newCatId || null);
          }
        }}
      />
    </div>
  );
}
