"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AccountOptions } from "@/components/AccountOptions";
import { CategoryOptions } from "@/components/CategoryOptions";
import { AmountInput } from "@/components/AmountInput";
import { niceConfirm } from "@/lib/confirm";

const COMMON_ICONS = ["⚡", "🔥", "💧", "📱", "🌐", "🏠", "🛡️", "🚗", "💳", "📺", "☕", "🛒"];

export function QuickButtonsModal({
  isOpen,
  onClose,
  onUpdated,
}: {
  isOpen: boolean;
  isOpenState?: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const utils = trpc.useUtils();
  const listQuery = trpc.quickButtons.list.useQuery();
  const accountsQuery = trpc.accounts.list.useQuery();
  const categoriesQuery = trpc.categories.list.useQuery();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("⚡");
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [defaultAmount, setDefaultAmount] = useState("");
  const [matchPattern, setMatchPattern] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.quickButtons.create.useMutation({
    onSuccess: async () => {
      await utils.quickButtons.list.invalidate();
      setIsAdding(false);
      resetForm();
      onUpdated?.();
    },
    onError: (e) => setError(e.message),
  });

  const updateMutation = trpc.quickButtons.update.useMutation({
    onSuccess: async () => {
      await utils.quickButtons.list.invalidate();
      setEditingId(null);
      resetForm();
      onUpdated?.();
    },
    onError: (e) => setError(e.message),
  });

  const deleteMutation = trpc.quickButtons.delete.useMutation({
    onSuccess: async () => {
      await utils.quickButtons.list.invalidate();
      onUpdated?.();
    },
    onError: (e) => setError(e.message),
  });

  function resetForm() {
    setName("");
    setIcon("⚡");
    setType("expense");
    setCategoryId("");
    setAccountId("");
    setDefaultAmount("");
    setMatchPattern("");
    setError(null);
  }

  function startEdit(btn: any) {
    setEditingId(btn.id);
    setIsAdding(false);
    setName(btn.name);
    setIcon(btn.icon || "⚡");
    setType(btn.type);
    setCategoryId(btn.categoryId || "");
    setAccountId(btn.accountId || "");
    setDefaultAmount(btn.defaultAmountMinor ? String(Number(btn.defaultAmountMinor) / 100) : "");
    setMatchPattern(btn.matchPattern || "");
    setError(null);
  }

  function startAdd() {
    setEditingId(null);
    setIsAdding(true);
    resetForm();
  }

  if (!isOpen) return null;

  const buttons = listQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="ff3-card"
        style={{
          width: "clamp(580px, 50vw, 1050px)",
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--bg)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>⚙️ 管理水電瓦斯 / 快捷按鈕</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
              設定常用的日常定期繳費按鈕，點擊立即帶入記帳，當月記帳後自動轉為灰色完成狀態。
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} style={{ fontSize: 18, padding: "4px 8px" }}>
            ✕
          </button>
        </div>

        {/* Add / Edit Form */}
        {(isAdding || editingId) && (
          <div
            style={{
              padding: 16,
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#a5b4fc" }}>
              {isAdding ? "➕ 新增快捷按鈕" : "✏️ 編輯快捷按鈕"}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                if (isAdding) {
                  createMutation.mutate({
                    name,
                    icon,
                    type,
                    categoryId: categoryId || null,
                    accountId: accountId || null,
                    defaultAmount: defaultAmount || undefined,
                    matchPattern: matchPattern || undefined,
                  });
                } else if (editingId) {
                  updateMutation.mutate({
                    id: editingId,
                    name,
                    icon,
                    type,
                    categoryId: categoryId || null,
                    accountId: accountId || null,
                    defaultAmount: defaultAmount || null,
                    matchPattern: matchPattern || null,
                  });
                }
              }}
            >
              {/* Icon Selector */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                  圖示 (Emoji)
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {COMMON_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      style={{
                        padding: "4px 8px",
                        fontSize: 16,
                        background: icon === ic ? "rgba(99, 102, 241, 0.3)" : "rgba(0,0,0,0.2)",
                        border: icon === ic ? "1px solid #6366f1" : "1px solid var(--border)",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="自訂"
                    style={{ width: 60, textAlign: "center", padding: "4px 6px", fontSize: 14 }}
                  />
                </div>
              </div>

              <div className="grid cols-2" style={{ gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    按鈕名稱 *
                  </label>
                  <input
                    required
                    placeholder="例如：欣泰瓦斯費、台電電費"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!matchPattern) setMatchPattern(e.target.value);
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    收支種類
                  </label>
                  <select value={type} onChange={(e) => setType(e.target.value as any)}>
                    <option value="expense">支出</option>
                    <option value="income">收入</option>
                    <option value="transfer">轉帳</option>
                  </select>
                </div>
              </div>

              <div className="grid cols-2" style={{ gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    預設分類
                  </label>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">(未指定分類)</option>
                    <CategoryOptions categories={categories} kind={type} />
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    預設扣款帳戶 (選填)
                  </label>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">(未指定帳戶)</option>
                    <AccountOptions accounts={accounts} />
                  </select>
                </div>
              </div>

              <div className="grid cols-2" style={{ gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    預設金額 (選填，可每次手動輸入)
                  </label>
                  <AmountInput value={defaultAmount} onChange={setDefaultAmount} placeholder="每次金額浮動可留空" />
                </div>

                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    當月比對關鍵字 (判斷當月是否已記)
                  </label>
                  <input
                    placeholder="例如：瓦斯、電費（比對交易備註）"
                    value={matchPattern}
                    onChange={(e) => setMatchPattern(e.target.value)}
                  />
                </div>
              </div>

              {error && <div style={{ color: "var(--expense)", fontSize: 12, marginBottom: 10 }}>⚠️ {error}</div>}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingId(null);
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? "儲存中…" : "儲存設定"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Buttons List */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
              現有快捷按鈕清單 ({buttons.length})
            </span>
            {!isAdding && !editingId && (
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12, padding: "4px 12px" }}
                onClick={startAdd}
              >
                ＋ 新增按鈕
              </button>
            )}
          </div>

          {buttons.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--muted)",
                background: "rgba(0,0,0,0.2)",
                borderRadius: 8,
              }}
            >
              尚無快捷按鈕，點擊上方「新增按鈕」開始建立！
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {buttons.map((btn) => (
                <div
                  key={btn.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{btn.icon || "⚡"}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{btn.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span>種類: {btn.type === "expense" ? "支出" : btn.type === "income" ? "收入" : "轉帳"}</span>
                        {btn.categoryName && <span>• 分類: {btn.categoryName}</span>}
                        {btn.accountName && <span>• 帳戶: {btn.accountName}</span>}
                        {btn.defaultAmountMinor && (
                          <span>• 預設: NT$ {Number(btn.defaultAmountMinor) / 100}</span>
                        )}
                        {btn.matchPattern && <span>• 比對詞: 「{btn.matchPattern}」</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ fontSize: 12, padding: "4px 8px" }}
                      onClick={() => startEdit(btn)}
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ fontSize: 12, padding: "4px 8px", color: "var(--expense)" }}
                      disabled={deleteMutation.isPending}
                      onClick={async () => {
                        const ok = await niceConfirm("刪除按鈕", `確定要刪除快捷按鈕「${btn.name}」嗎？`, "danger");
                        if (ok) {
                          await deleteMutation.mutateAsync({ id: btn.id });
                        }
                      }}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
