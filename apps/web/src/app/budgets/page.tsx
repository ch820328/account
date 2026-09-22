"use client";

import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { usePersistentTab } from "@/lib/use-persistent-tab";
import { trpc } from "@/lib/trpc";
import { Amount } from "@/components/Amount";
import { BudgetModal } from "@/components/forecast/BudgetModal";
import { MasterBudgetMatrix } from "@/components/forecast/MasterBudgetMatrix";
import { CategoryEnvelopes } from "@/components/forecast/CategoryEnvelopes";
import { BudgetsTab } from "@/components/forecast/BudgetsTab";
import type { BudgetItem, ForecastAccount } from "@/components/forecast/types";

const VALID_BUDGET_TABS = ["matrix", "envelopes", "settings"] as const;

export default function BudgetsPage() {
  const { ready } = useAuthGuard();
  const utils = trpc.useUtils();

  const [targetYear, setTargetYear] = useState<number>(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = usePersistentTab<"matrix" | "envelopes" | "settings">(
    "tab:budgets_view",
    VALID_BUDGET_TABS,
    "matrix"
  );

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);

  // Queries
  const budgetsQuery = trpc.annualBudgets.list.useQuery(
    { year: targetYear },
    { enabled: ready }
  );

  const accountsQuery = trpc.accounts.list.useQuery(undefined, { enabled: ready });
  const categoriesQuery = trpc.categories.list.useQuery(undefined, { enabled: ready });

  // Mutations
  const createMutation = trpc.annualBudgets.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.annualBudgets.list.invalidate(),
        utils.annualBudgets.cashflowProjection.invalidate(),
      ]);
      setModalOpen(false);
      setEditingItem(null);
    },
  });

  const updateMutation = trpc.annualBudgets.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.annualBudgets.list.invalidate(),
        utils.annualBudgets.cashflowProjection.invalidate(),
      ]);
      setModalOpen(false);
      setEditingItem(null);
    },
  });

  const deleteMutation = trpc.annualBudgets.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.annualBudgets.list.invalidate(),
        utils.annualBudgets.cashflowProjection.invalidate(),
      ]);
    },
  });

  if (!ready) {
    return (
      <>
        <TopBar />
        <div className="container muted" style={{ padding: 24 }}>載入中…</div>
      </>
    );
  }

  const budgetItems = (budgetsQuery.data?.items ?? []) as BudgetItem[];
  const currentMonthIdx = budgetsQuery.data?.currentMonthIdx ?? new Date().getMonth() + 1;
  const accounts = (accountsQuery.data ?? []) as ForecastAccount[];
  const categories = categoriesQuery.data ?? [];

  const safeToSpend = budgetsQuery.data?.safeToSpendSummary;
  const majorCategoryEnvelopes = budgetsQuery.data?.majorCategoryEnvelopes ?? [];

  const remainingMonths = safeToSpend?.remainingMonths ?? Math.max(1, 12 - currentMonthIdx + 1);

  function handleStartAdd() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function handleStartEdit(item: BudgetItem) {
    setEditingItem(item);
    setModalOpen(true);
  }

  async function handleSubmitBudget(data: {
    id?: string;
    year: number;
    name: string;
    icon: string;
    annualAmount: string;
    allocationType: "rolling" | "fixed_months";
    targetMonths?: string;
    accountId?: string | null;
    categoryId?: string | null;
    matchPattern?: string;
    note?: string;
  }) {
    if (data.id) {
      await updateMutation.mutateAsync({
        id: data.id,
        year: data.year,
        name: data.name,
        icon: data.icon,
        annualAmount: data.annualAmount,
        allocationType: data.allocationType,
        targetMonths: data.targetMonths,
        accountId: data.accountId,
        categoryId: data.categoryId,
        matchPattern: data.matchPattern,
        note: data.note,
      });
    } else {
      await createMutation.mutateAsync({
        year: data.year,
        name: data.name,
        icon: data.icon,
        annualAmount: data.annualAmount,
        allocationType: data.allocationType,
        targetMonths: data.targetMonths,
        accountId: data.accountId,
        categoryId: data.categoryId,
        matchPattern: data.matchPattern,
        note: data.note,
      });
    }
  }

  return (
    <>
      <TopBar />
      <div style={{ width: "100%", padding: "20px 4px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
                📋 年度預算與固定開銷管理
              </h1>
              <select
                value={targetYear}
                onChange={(e) => setTargetYear(Number(e.target.value))}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y} 年度
                  </option>
                ))}
              </select>
            </div>
            <p style={{ color: "var(--muted)", margin: "6px 0 0", fontSize: 13, maxWidth: 1080 }}>
              扣除已過月份實支與後續已排定之固定開銷，精準掌握<strong>「後續剩下可花」</strong>安全額度；並按<strong>食、衣、住、行、育、樂</strong>六大分類歸納管理 12 個月預算排程。
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={handleStartAdd}
              style={{ fontSize: 13, padding: "8px 18px", fontWeight: 700 }}
            >
              ＋ 設定固定開銷 / 預算
            </button>
          </div>
        </div>

        {/* Top KPI Safe-to-Spend Dashboard */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div
            className="ff3-card"
            style={{
              padding: "16px 18px",
              borderLeft: "4px solid #6366f1",
              background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(0,0,0,0.2) 100%)",
            }}
          >
            <div style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 600, marginBottom: 4 }}>
              💰 全年度總預算池
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: "var(--fg)" }}>
              <Amount value={BigInt(safeToSpend?.totalAnnualBudgetMinor || "0")} currency="TWD" />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              固定開銷與日常預算總規模
            </div>
          </div>

          <div
            className="ff3-card"
            style={{
              padding: "16px 18px",
              borderLeft: "4px solid #60a5fa",
              background: "linear-gradient(135deg, rgba(96,165,250,0.08) 0%, rgba(0,0,0,0.2) 100%)",
            }}
          >
            <div style={{ fontSize: 12, color: "#60a5fa", fontWeight: 600, marginBottom: 4 }}>
              📉 已過月份實支 (1~{Math.max(1, currentMonthIdx - 1)}月)
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: "#60a5fa" }}>
              <Amount value={BigInt(safeToSpend?.pastSpentMinor || "0")} currency="TWD" />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              過去月份已入帳之實際總花費
            </div>
          </div>

          <div
            className="ff3-card"
            style={{
              padding: "16px 18px",
              borderLeft: "4px solid #f59e0b",
              background: "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0.2) 100%)",
            }}
          >
            <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600, marginBottom: 4 }}>
              🔒 後續固定預期支出 ({currentMonthIdx}~12月)
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: "#fbbf24" }}>
              <Amount value={BigInt(safeToSpend?.futureFixedMinor || "0")} currency="TWD" />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              已排程管理費、保險、稅金 (先鎖定扣除)
            </div>
          </div>

          <div
            className="ff3-card"
            style={{
              padding: "16px 18px",
              borderLeft: "4px solid #10b981",
              background: "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(0,0,0,0.25) 100%)",
            }}
          >
            <div style={{ fontSize: 12, color: "#34d399", fontWeight: 700, marginBottom: 4 }}>
              🟢 後續剩下可花（自由支配額度）
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: "#10b981" }}>
              <Amount value={BigInt(safeToSpend?.safeToSpendMinor || "0")} currency="TWD" />
            </div>
            <div style={{ fontSize: 11, color: "#34d399", marginTop: 4 }}>
              扣除已過實支與未來固定開銷後
            </div>
          </div>

          <div
            className="ff3-card"
            style={{
              padding: "16px 18px",
              borderLeft: "4px solid #38bdf8",
              background: "linear-gradient(135deg, rgba(56,189,248,0.08) 0%, rgba(0,0,0,0.2) 100%)",
            }}
          >
            <div style={{ fontSize: 12, color: "#38bdf8", fontWeight: 600, marginBottom: 4 }}>
              📅 後續平均每月安全可花
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: "#38bdf8" }}>
              <Amount value={BigInt(safeToSpend?.monthlySafeToSpendMinor || "0")} currency="TWD" />
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}> /月</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              由後續剩餘 {remainingMonths} 個月平均分攤
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 18,
            borderBottom: "1px solid var(--border)",
            paddingBottom: 10,
            overflowX: "auto",
          }}
        >
          <button
            type="button"
            className={`chip${activeTab === "matrix" ? " chip-on" : ""}`}
            onClick={() => setActiveTab("matrix")}
            style={{ fontSize: 13, padding: "6px 18px", fontWeight: 600 }}
          >
            📅 一年 12 個月預算全景總表
          </button>
          <button
            type="button"
            className={`chip${activeTab === "envelopes" ? " chip-on" : ""}`}
            onClick={() => setActiveTab("envelopes")}
            style={{ fontSize: 13, padding: "6px 18px", fontWeight: 600 }}
          >
            🌳 六大項預算與後續剩餘可花 (食衣住行育樂)
          </button>
          <button
            type="button"
            className={`chip${activeTab === "settings" ? " chip-on" : ""}`}
            onClick={() => setActiveTab("settings")}
            style={{ fontSize: 13, padding: "6px 18px", fontWeight: 600 }}
          >
            ⚙️ 各項目詳細設定與執行進度 ({budgetItems.length})
          </button>
        </div>

        {/* Tab 1: Master 12-Month Matrix */}
        {activeTab === "matrix" && (
          <MasterBudgetMatrix
            targetYear={targetYear}
            currentMonthIdx={currentMonthIdx}
            budgetItems={budgetItems}
            onStartEdit={handleStartEdit}
            onStartAdd={handleStartAdd}
            onDelete={async (id) => {
              await deleteMutation.mutateAsync({ id });
            }}
            onSettled={() => {
              budgetsQuery.refetch();
            }}
          />
        )}

        {/* Tab 2: 6 Major Categories (食、衣、住、行、育、樂) Envelopes */}
        {activeTab === "envelopes" && (
          <CategoryEnvelopes
            envelopes={majorCategoryEnvelopes}
            budgetItems={budgetItems}
            currentMonthIdx={currentMonthIdx}
            remainingMonths={remainingMonths}
            onStartEdit={handleStartEdit}
            onStartAdd={handleStartAdd}
          />
        )}

        {/* Tab 3: Item Cards Settings & Execution Progress */}
        {activeTab === "settings" && (
          <BudgetsTab
            isLoading={budgetsQuery.isLoading}
            budgetItems={budgetItems}
            isDeleting={deleteMutation.isPending}
            onStartAdd={handleStartAdd}
            onStartEdit={handleStartEdit}
            onDelete={async (id) => {
              await deleteMutation.mutateAsync({ id });
            }}
          />
        )}
      </div>

      {/* Budget Modal Editor */}
      <BudgetModal
        isOpen={modalOpen}
        targetYear={targetYear}
        editingItem={editingItem}
        accounts={accounts}
        categories={categories}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmitBudget}
        onDelete={async (id) => {
          await deleteMutation.mutateAsync({ id });
        }}
      />
    </>
  );
}
