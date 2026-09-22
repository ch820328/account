"use client";

import { TopBar } from "@/components/TopBar";
import { Skeleton, SkeletonList } from "@/components/Skeleton";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { niceConfirm } from "@/lib/confirm";

import { FIXED_EXPENSE_PILLARS, isFixedPillar, getPillarSortIndex } from "@/lib/categories";

export default function CategoriesPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const categories = trpc.categories.list.useQuery(undefined, { enabled: !!session?.user });
  const [modalOpen, setModalOpen] = useState(false);

  const seedDefaults = trpc.categories.seedDefaults.useMutation({
    onSuccess: () => utils.categories.list.invalidate(),
  });

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container">
          <Skeleton width={120} height={28} style={{ marginBottom: 20 }} />
          <div className="grid cols-2">
            <SkeletonList rows={3} />
            <SkeletonList rows={3} />
          </div>
        </div>
      </>
    );
  }

  const income = (categories.data ?? []).filter((c) => c.kind === "income");
  const expense = (categories.data ?? []).filter((c) => c.kind === "expense");

  return (
    <>
      <TopBar />
      <div className="container">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0 }}>分類管理</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              支出以核心大類為根架構（含食衣住行育樂與其他），支援兩層子分類（如：其他 ➔ 所得稅，或 住 ➔ 家庭開銷 ➔ 管理費）。
            </p>
          </div>
          <div className="row-inline" style={{ gap: 10 }}>
            <button
              type="button"
              className="btn"
              style={{ background: "#2563eb", color: "#fff", padding: "10px 18px", fontWeight: "bold", fontSize: 14 }}
              onClick={() => setModalOpen(true)}
            >
              ✏️ 編輯與管理分類 (開啟對話框)
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => seedDefaults.mutate()}
              disabled={seedDefaults.isPending}
            >
              {seedDefaults.isPending ? "補上中…" : "補齊預設分類"}
            </button>
          </div>
        </div>

        <div className="grid cols-2" style={{ marginTop: 16 }}>
          <div className="ff3-card">
            <div className="section-title" style={{ marginTop: 0, marginBottom: 14, fontSize: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              💸 支出分類 (Expense) · 核心大類架構
            </div>
            <CategoryList items={expense} isExpense />
          </div>
          <div className="ff3-card">
            <div className="section-title" style={{ marginTop: 0, marginBottom: 14, fontSize: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              💰 收入分類 (Income)
            </div>
            <CategoryList items={income} />
          </div>
        </div>

        {/* Multi-Level Tree Popup Modal */}
        {modalOpen && (
          <CategoryTreeModal
            categories={categories.data ?? []}
            onClose={() => setModalOpen(false)}
            onSaveSuccess={() => utils.categories.list.invalidate()}
          />
        )}
      </div>
    </>
  );
}

function CategoryList({
  items,
  isExpense = false,
}: {
  items: { id: string; name: string; kind?: string; parentId: string | null; sortOrder: number }[];
  isExpense?: boolean;
}) {
  if (items.length === 0) return <div className="muted" style={{ padding: "12px 0" }}>尚無分類</div>;

  const parents = items
    .filter((c) => !c.parentId)
    .sort((a, b) => {
      if (isExpense) {
        return (getPillarSortIndex(a.name) - getPillarSortIndex(b.name)) || (a.sortOrder - b.sortOrder);
      }
      return a.sortOrder - b.sortOrder;
    });
  const children = items.filter((c) => c.parentId);

  // Group children by parentId
  const byParent = new Map<string, typeof items>();
  for (const c of children) {
    if (!c.parentId) continue;
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }

  // Find any orphan items that are not attached to a known parent
  const allKnownParentIds = new Set(items.map((i) => i.id));
  const orphans = children.filter((c) => c.parentId && !allKnownParentIds.has(c.parentId));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {parents.map((p) => {
        const l1 = byParent.get(p.id) ?? [];
        const isFixed = isExpense && isFixedPillar(p);

        return (
          <div
            key={p.id}
            style={{
              padding: "12px 16px",
              background: "rgba(255, 255, 255, 0.02)",
              borderRadius: 8,
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: 14, color: "var(--fg)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>📂 {p.name}</span>
                {isFixed && (
                  <span style={{ fontSize: 11, padding: "1px 6px", background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", borderRadius: 4, fontWeight: "normal" }}>
                    🔒 核心大類
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: "normal" }}>
                {l1.length} 個子項目
              </span>
            </div>

            {l1.length > 0 && (
              <div style={{ paddingLeft: 18, marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {l1.map((item1) => {
                  const l2 = byParent.get(item1.id) ?? [];
                  const isSubGroup = l2.length > 0;

                  return (
                    <div key={item1.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: isSubGroup ? "var(--fg)" : "var(--muted)",
                          fontWeight: isSubGroup ? 600 : "normal",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ color: isSubGroup ? "#38bdf8" : "var(--muted-fg)" }}>
                          {isSubGroup ? "📁" : "↳"}
                        </span>
                        <span>{item1.name}</span>
                        {isSubGroup && (
                          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: "normal" }}>
                            ({l2.length} 項次級分類)
                          </span>
                        )}
                      </div>

                      {/* Level 2 Sub-items */}
                      {isSubGroup && (
                        <div
                          style={{
                            paddingLeft: 22,
                            marginTop: 2,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            borderLeft: "1px dashed rgba(255, 255, 255, 0.1)",
                            marginLeft: 4,
                          }}
                        >
                          {l2.map((item2) => (
                            <div
                              key={item2.id}
                              style={{
                                fontSize: 12,
                                color: "var(--muted)",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span style={{ color: "var(--muted-fg)" }}>↳</span>
                              <span>{item2.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {orphans.length > 0 && (
        <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.05)", borderRadius: 8, border: "1px dashed rgba(239, 68, 68, 0.3)" }}>
          <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6 }}>未歸屬孤兒分類：</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {orphans.map((c) => (
              <span key={c.id} style={{ fontSize: 12, padding: "2px 8px", background: "rgba(255, 255, 255, 0.05)", borderRadius: 4 }}>
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryTreeModal({
  categories,
  onClose,
  onSaveSuccess,
}: {
  categories: { id: string; name: string; kind: string; parentId: string | null; sortOrder: number }[];
  onClose: () => void;
  onSaveSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [draftList, setDraftList] = useState<typeof categories>(() => JSON.parse(JSON.stringify(categories)));
  const [saving, setSaving] = useState(false);

  // New category creation state
  const [newCatName, setNewCatName] = useState("");
  const [newCatParentId, setNewCatParentId] = useState("");

  const activeItems = draftList.filter((c) => c.kind === kind);
  const parents = activeItems
    .filter((c) => !c.parentId)
    .sort((a, b) => {
      if (kind === "expense") {
        return (getPillarSortIndex(a.name) - getPillarSortIndex(b.name)) || (a.sortOrder - b.sortOrder);
      }
      return a.sortOrder - b.sortOrder;
    });

  // Ensure default parentId is selected for expense (must attach to one of the 6 pillars)
  useEffect(() => {
    if (kind === "expense") {
      if (!newCatParentId || !parents.some((p) => p.id === newCatParentId || activeItems.some((c) => c.id === newCatParentId && c.parentId))) {
        const firstPillar = parents[0];
        if (firstPillar) setNewCatParentId(firstPillar.id);
      }
    } else {
      if (!newCatParentId) setNewCatParentId("");
    }
  }, [kind, parents]);

  const createCat = trpc.categories.create.useMutation({
    onSuccess: async (created) => {
      await utils.categories.list.invalidate();
      onSaveSuccess();
      setNewCatName("");
      if (created) {
        setDraftList((prev) => [...prev, created]);
      }
    },
    onError: (err) => alert(`新增失敗: ${err.message}`),
  });

  const removeCat = trpc.categories.delete.useMutation({
    onSuccess: async () => {
      await utils.categories.list.invalidate();
      onSaveSuccess();
    },
  });

  const batchSave = trpc.categories.batchSaveTree.useMutation({
    onSuccess: async () => {
      await onSaveSuccess();
      setSaving(false);
      onClose();
    },
    onError: (err) => {
      alert(`儲存失敗: ${err.message}`);
      setSaving(false);
    },
  });

  const handleCreate = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (kind === "expense" && !newCatParentId) {
      alert("支出分類必須選擇隸屬於核心大類或其子群組！");
      return;
    }
    createCat.mutate({
      name: trimmed,
      kind,
      parentId: newCatParentId || undefined,
    });
  };

  const handleSave = () => {
    setSaving(true);
    const payload = draftList.map((c, index) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      sortOrder: index,
    }));
    batchSave.mutate(payload);
  };

  const updateCategoryName = (id: string, name: string) => {
    setDraftList((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleDelete = async (c: { id: string; name: string; parentId: string | null }) => {
    // Check if item has subchildren
    const subChildren = activeItems.filter((sub) => sub.parentId === c.id);
    if (subChildren.length > 0) {
      const parentOfC = parents.find((p) => p.id === c.parentId);
      const targetParentId = parentOfC ? parentOfC.id : null;
      const ok = await niceConfirm(
        "刪除分類",
        `分類「${c.name}」底下包含 ${subChildren.length} 個子項目（${subChildren.map((s) => s.name).join("、")}）。刪除後這些子項目將直接提升為「${parentOfC?.name ?? "上一層"}」的直屬分類，確定要刪除嗎？`,
        "danger"
      );
      if (!ok) return;

      // Reparent children to c's parent
      setDraftList((prev) =>
        prev
          .map((item) => (item.parentId === c.id ? { ...item, parentId: targetParentId } : item))
          .filter((item) => item.id !== c.id)
      );
      removeCat.mutate({ id: c.id });
      return;
    }

    const ok = await niceConfirm("刪除分類", `確定要刪除「${c.name}」嗎？`, "danger");
    if (!ok) return;

    setDraftList((prev) => prev.filter((item) => item.id !== c.id));
    removeCat.mutate({ id: c.id });
  };

  const handleMoveCategory = (itemId: string, newParentId: string | null) => {
    setDraftList((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, parentId: newParentId } : item))
    );
  };

  const promoteToLevel1 = (subId: string, pillarId: string) => {
    setDraftList((prev) =>
      prev.map((item) => (item.id === subId ? { ...item, parentId: pillarId } : item))
    );
  };

  // Build parent options for dropdown:
  // For expense: Level 0 (Pillars) and Level 1 (Sub-groups)
  // Level 2 items cannot be parents (depth capped at 2 under pillar)
  const selectableParents = parents.map((p) => {
    const l1 = activeItems.filter((c) => c.parentId === p.id);
    return {
      pillar: p,
      subGroups: l1,
    };
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        className="ff3-card"
        style={{
          width: "clamp(680px, 55vw, 1100px)",
          maxWidth: "95vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "var(--surface)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: "bold" }}>🗂️ 分類結構管理中心 (Popup Modal)</h3>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              核心大類為系統根架構，支援新增兩層子分類（例如：其他 ➔ 所得稅，或 住 ➔ 家庭開銷 ➔ 管理費）。
            </div>
          </div>
          <button type="button" className="btn ghost icon-only" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Top Control Bar: Segments & Quick Add */}
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12, borderBottom: "1px solid var(--border)", background: "rgba(0, 0, 0, 0.15)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div className="seg" style={{ width: 230 }}>
              <button type="button" className={kind === "expense" ? "active" : ""} onClick={() => setKind("expense")}>
                💸 支出分類 (核心大類)
              </button>
              <button type="button" className={kind === "income" ? "active" : ""} onClick={() => setKind("income")}>
                💰 收入分類
              </button>
            </div>

            {/* Quick Add Form */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 320, justifyContent: "flex-end" }}>
              <input
                ref={nameInputRef}
                placeholder="輸入新分類名稱…"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                style={{
                  width: 160,
                  padding: "6px 10px",
                  fontSize: 13,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--fg)",
                }}
              />
              <select
                value={newCatParentId}
                onChange={(e) => setNewCatParentId(e.target.value)}
                style={{
                  maxWidth: 220,
                  padding: "6px 8px",
                  fontSize: 12,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--fg)",
                }}
              >
                {kind === "income" && <option value="">(獨立大類)</option>}
                {selectableParents.map((grp) => (
                  <optgroup key={grp.pillar.id} label={`📂 ${grp.pillar.name}`}>
                    <option value={grp.pillar.id}>
                      ↳ 直接隸屬「{grp.pillar.name}」(第一層)
                    </option>
                    {grp.subGroups.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        &nbsp;&nbsp;&nbsp;&nbsp;↳ 隸屬「{sub.name}」(第二層)
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12, padding: "6px 14px", background: "#2563eb", color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}
                disabled={createCat.isPending}
                onClick={handleCreate}
              >
                ＋ 新增
              </button>
            </div>
          </div>
        </div>

        {/* Tree Content Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {parents.map((p) => {
            const isFixed = kind === "expense" && isFixedPillar(p);
            const l1 = activeItems.filter((c) => c.parentId === p.id);

            return (
              <div
                key={p.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  background: "rgba(0, 0, 0, 0.2)",
                }}
              >
                {/* Level 0: Root Pillar Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    background: "rgba(255, 255, 255, 0.04)",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    <strong style={{ fontSize: 15, color: "var(--fg)" }}>📂 {p.name}</strong>
                    {isFixed ? (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          background: "rgba(59, 130, 246, 0.15)",
                          color: "#60a5fa",
                          borderRadius: 12,
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                        }}
                      >
                        🔒 系統核心大類 (不可改名／不可刪除)
                      </span>
                    ) : (
                      <input
                        value={p.name}
                        onChange={(e) => updateCategoryName(p.id, e.target.value)}
                        style={{
                          padding: "4px 8px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          color: "var(--fg)",
                          fontWeight: "bold",
                          fontSize: 13,
                        }}
                      />
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ fontSize: 11, padding: "3px 8px", color: "#38bdf8", border: "1px dashed rgba(56, 189, 248, 0.35)" }}
                      onClick={() => {
                        setNewCatParentId(p.id);
                        nameInputRef.current?.focus();
                      }}
                    >
                      ＋ 新增第一層子分類
                    </button>
                    {!isFixed && (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ fontSize: 11, padding: "3px 8px", color: "var(--expense)" }}
                        onClick={() => handleDelete(p)}
                      >
                        🗑️ 刪除
                      </button>
                    )}
                  </div>
                </div>

                {/* Level 1 & Level 2 Items */}
                <div style={{ paddingLeft: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {l1.length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 8px" }}>
                      尚無子分類，點擊右上角「＋ 新增第一層子分類」即可建立
                    </div>
                  )}

                  {l1.map((item1) => {
                    const l2 = activeItems.filter((sub) => sub.parentId === item1.id);
                    const isSubGroup = l2.length > 0;

                    return (
                      <div
                        key={item1.id}
                        style={{
                          border: isSubGroup ? "1px solid rgba(56, 189, 248, 0.2)" : "1px solid rgba(255, 255, 255, 0.05)",
                          borderRadius: 6,
                          background: isSubGroup ? "rgba(56, 189, 248, 0.03)" : "rgba(255, 255, 255, 0.02)",
                          padding: "6px 8px",
                        }}
                      >
                        {/* Level 1 Row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, color: isSubGroup ? "#38bdf8" : "var(--muted-fg)" }}>
                            {isSubGroup ? "📁" : "↳"}
                          </span>
                          <input
                            value={item1.name}
                            onChange={(e) => updateCategoryName(item1.id, e.target.value)}
                            style={{
                              flex: 1,
                              padding: "4px 8px",
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 4,
                              color: "var(--fg)",
                              fontSize: 13,
                              fontWeight: isSubGroup ? 600 : "normal",
                            }}
                          />
                          {/* Move to another category selector */}
                          <select
                            value={item1.parentId ?? ""}
                            onChange={(e) => handleMoveCategory(item1.id, e.target.value || null)}
                            style={{
                              fontSize: 11,
                              padding: "4px 8px",
                              background: "rgba(0, 0, 0, 0.4)",
                              border: "1px solid rgba(255, 255, 255, 0.12)",
                              borderRadius: 4,
                              color: "#a5b4fc",
                              maxWidth: 160,
                              cursor: "pointer",
                            }}
                            title="移動此分類歸屬於其他核心大類或群組"
                          >
                            {kind === "income" && <option value="">(獨立大類)</option>}
                            {selectableParents.map((grp) => (
                              <optgroup key={grp.pillar.id} label={`📂 ${grp.pillar.name}`}>
                                {grp.pillar.id !== item1.id && (
                                  <option value={grp.pillar.id}>
                                    ↳ 隸屬「{grp.pillar.name}」
                                  </option>
                                )}
                                {!isSubGroup &&
                                  grp.subGroups
                                    .filter((sub) => sub.id !== item1.id)
                                    .map((sub) => (
                                      <option key={sub.id} value={sub.id}>
                                        &nbsp;&nbsp;↳ 隸屬「{sub.name}」
                                      </option>
                                    ))}
                              </optgroup>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ fontSize: 11, padding: "3px 7px", color: "#38bdf8" }}
                            title="在此項目下新增第二層子分類"
                            onClick={() => {
                              setNewCatParentId(item1.id);
                              nameInputRef.current?.focus();
                            }}
                          >
                            ＋ 第二層子項
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ fontSize: 11, padding: "3px 6px", color: "var(--expense)" }}
                            onClick={() => handleDelete(item1)}
                          >
                            🗑️
                          </button>
                        </div>

                        {/* Level 2 Subchildren */}
                        {isSubGroup && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginTop: 6,
                              paddingLeft: 10,
                              borderLeft: "2px dashed rgba(56, 189, 248, 0.35)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 5,
                            }}
                          >
                            {l2.map((item2) => (
                              <div
                                key={item2.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  background: "rgba(0, 0, 0, 0.25)",
                                  padding: "4px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                <span style={{ fontSize: 12, color: "#94a3b8" }}>↳↳</span>
                                <input
                                  value={item2.name}
                                  onChange={(e) => updateCategoryName(item2.id, e.target.value)}
                                  style={{
                                    flex: 1,
                                    padding: "3px 6px",
                                    background: "var(--bg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 4,
                                    color: "var(--fg)",
                                    fontSize: 12,
                                  }}
                                />
                                {/* Move dropdown for Level 2 */}
                                <select
                                  value={item2.parentId ?? ""}
                                  onChange={(e) => handleMoveCategory(item2.id, e.target.value || null)}
                                  style={{
                                    fontSize: 10.5,
                                    padding: "2px 6px",
                                    background: "rgba(0, 0, 0, 0.4)",
                                    border: "1px solid rgba(255, 255, 255, 0.12)",
                                    borderRadius: 4,
                                    color: "#93c5fd",
                                    maxWidth: 150,
                                    cursor: "pointer",
                                  }}
                                  title="移動此次級分類歸屬"
                                >
                                  {kind === "income" && <option value="">(獨立大類)</option>}
                                  {selectableParents.map((grp) => (
                                    <optgroup key={grp.pillar.id} label={`📂 ${grp.pillar.name}`}>
                                      <option value={grp.pillar.id}>
                                        ↳ 升至「{grp.pillar.name}」
                                      </option>
                                      {grp.subGroups
                                        .filter((sub) => sub.id !== item2.id)
                                        .map((sub) => (
                                          <option key={sub.id} value={sub.id}>
                                            &nbsp;&nbsp;↳ 轉入「{sub.name}」
                                          </option>
                                        ))}
                                    </optgroup>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="btn ghost"
                                  style={{ fontSize: 10, padding: "2px 5px", color: "var(--expense)" }}
                                  onClick={() => handleDelete(item2)}
                                >
                                  🗑️
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(0, 0, 0, 0.25)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            💡 提示：每一項分類皆有下拉選單，可隨時「移動」歸屬至任一大類或子群組；修改後請點擊右下角「💾 儲存變更」。
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
              取消 (Cancel)
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "var(--income)", color: "#fff", fontWeight: "bold", padding: "8px 18px" }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "儲存中…" : "💾 儲存變更 (Save Changes)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
