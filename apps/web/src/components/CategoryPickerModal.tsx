"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CategoryItem,
  getCategoryFullName,
  getRecentCategoryIds,
  recordRecentCategoryId,
} from "@/lib/categories";

export type CategoryPickerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryItem[];
  currentCategoryId?: string | null;
  onSelect: (categoryId: string | null) => void;
  title?: string;
  transactionNote?: string;
  kind?: "expense" | "income";
};

export function CategoryPickerModal({
  isOpen,
  onClose,
  categories,
  currentCategoryId,
  onSelect,
  title = "選擇分類",
  transactionNote,
  kind = "expense",
}: CategoryPickerModalProps) {
  const [search, setSearch] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Filter categories by kind
  const activeCategories = useMemo(() => {
    const list = categories ?? [];
    return kind ? list.filter((c) => !c.kind || c.kind === kind) : list;
  }, [categories, kind]);

  // Map category by ID for fast lookup
  const catMap = useMemo(() => {
    return new Map<string, CategoryItem>(categories.map((c) => [c.id, c]));
  }, [categories]);

  // Group subcategories by parentId
  const { parentCategories, subCategoriesByParent } = useMemo(() => {
    const parents: CategoryItem[] = [];
    const subs = new Map<string, CategoryItem[]>();

    for (const c of activeCategories) {
      if (!c.parentId) {
        parents.push(c);
      } else {
        const list = subs.get(c.parentId) ?? [];
        list.push(c);
        subs.set(c.parentId, list);
      }
    }

    return { parentCategories: parents, subCategoriesByParent: subs };
  }, [activeCategories]);

  // Track open state transitions to only initialize when modal opens
  const wasOpenRef = useRef(false);

  // Initialize state once when modal opens
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setSearch("");
      const rec = getRecentCategoryIds();
      setRecentIds(rec);

      // Determine initial parent category
      let initialParent: string | null = null;
      if (currentCategoryId) {
        const current = catMap.get(currentCategoryId);
        if (current) {
          initialParent = current.parentId || current.id;
        }
      }
      if (!initialParent && parentCategories.length > 0 && parentCategories[0]) {
        initialParent = parentCategories[0].id;
      }
      setSelectedParentId(initialParent);
    } else if (!isOpen && wasOpenRef.current) {
      setSelectedParentId(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, currentCategoryId, catMap, parentCategories]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Fallback: If modal is open and parentCategories just became available, initialize once
  useEffect(() => {
    if (isOpen && !selectedParentId && parentCategories.length > 0 && parentCategories[0]) {
      let initialParent: string | null = null;
      if (currentCategoryId) {
        const current = catMap.get(currentCategoryId);
        if (current) {
          initialParent = current.parentId || current.id;
        }
      }
      setSelectedParentId(initialParent || parentCategories[0].id);
    }
  }, [isOpen, selectedParentId, parentCategories, currentCategoryId, catMap]);

  // Search results across all categories
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return activeCategories.filter((c) => {
      const fullName = getCategoryFullName(c.id, categories).toLowerCase();
      return fullName.includes(q) || c.name.toLowerCase().includes(q);
    });
  }, [search, activeCategories, categories]);

  const handlePick = (id: string | null) => {
    if (id) {
      recordRecentCategoryId(id);
    }
    onSelect(id);
    onClose();
  };

  if (!isOpen) return null;

  // Selected parent and its subcategories
  const currentParent = parentCategories.find((p) => p.id === selectedParentId);
  const currentSubs = selectedParentId ? subCategoriesByParent.get(selectedParentId) ?? [] : [];

  // Resolving recent category objects
  const recentCategories = recentIds
    .map((id) => catMap.get(id))
    .filter((c): c is CategoryItem => !!c && (!kind || !c.kind || c.kind === kind));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeIn 0.15s ease-out",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          background: "#14141e",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "88vh",
          color: "var(--fg, #f1f5f9)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🏷️</span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>
                {title}
              </h3>
            </div>
            {transactionNote && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted, #94a3b8)",
                  marginTop: 4,
                  maxWidth: 460,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={transactionNote}
              >
                明細：{transactionNote}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "var(--muted, #94a3b8)",
              borderRadius: "50%",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 14,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
              e.currentTarget.style.color = "var(--muted, #94a3b8)";
            }}
          >
            ✕
          </button>
        </div>

        {/* Top Actions: Search Bar & Clear to Uncategorized */}
        <div
          style={{
            padding: "12px 20px 10px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <span
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 13,
                opacity: 0.5,
              }}
            >
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="快速搜尋分類名稱（如：外食、水電、計程車）..."
              autoFocus
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#fff",
                fontSize: 13,
                outline: "none",
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#6366f1";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--muted, #94a3b8)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handlePick(null)}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              background: !currentCategoryId ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.05)",
              border: !currentCategoryId ? "1.5px solid #ef4444" : "1px solid rgba(239, 68, 68, 0.35)",
              color: "#fca5a5",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)";
              e.currentTarget.style.borderColor = "#ef4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = !currentCategoryId ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.05)";
              e.currentTarget.style.borderColor = !currentCategoryId ? "1.5px solid #ef4444" : "1px solid rgba(239, 68, 68, 0.35)";
            }}
            title="將此筆交易設為未分類"
          >
            🚫 設為未分類
          </button>
        </div>

        {/* Quick Section: Last 3 Selected Categories (前三次選擇快捷) */}
        {recentCategories.length > 0 && !search && (
          <div
            style={{
              padding: "8px 20px",
              background: "rgba(99, 102, 241, 0.06)",
              borderBottom: "1px solid rgba(99, 102, 241, 0.15)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#a5b4fc",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginRight: 4,
              }}
            >
              ⚡ 前次快捷:
            </span>
            {recentCategories.map((rc) => {
              const fullName = getCategoryFullName(rc.id, categories);
              const isCurrent = rc.id === currentCategoryId;
              return (
                <button
                  key={rc.id}
                  type="button"
                  onClick={() => handlePick(rc.id)}
                  style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    borderRadius: 6,
                    background: isCurrent
                      ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
                      : "rgba(255, 255, 255, 0.07)",
                    color: isCurrent ? "#fff" : "#e2e8f0",
                    border: isCurrent
                      ? "1px solid #818cf8"
                      : "1px solid rgba(255, 255, 255, 0.12)",
                    fontWeight: isCurrent ? 700 : 500,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#818cf8";
                    e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isCurrent
                      ? "#818cf8"
                      : "1px solid rgba(255, 255, 255, 0.12)";
                    e.currentTarget.style.background = isCurrent
                      ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
                      : "rgba(255, 255, 255, 0.07)";
                  }}
                >
                  <span>{fullName}</span>
                  {isCurrent && <span style={{ fontSize: 10 }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Content Body: Cascading Two Columns or Search View */}
        {search ? (
          /* Search Results List */
          <div
            style={{
              padding: "12px 20px",
              overflowY: "auto",
              flex: 1,
              maxHeight: 380,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {searchResults.length === 0 ? (
              <div
                style={{
                  padding: "32px 0",
                  textAlign: "center",
                  color: "var(--muted, #94a3b8)",
                  fontSize: 13,
                }}
              >
                找不到符合「{search}」的分類
              </div>
            ) : (
              searchResults.map((c) => {
                const fullName = getCategoryFullName(c.id, categories);
                const isCurrent = c.id === currentCategoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handlePick(c.id)}
                    style={{
                      padding: "9px 14px",
                      borderRadius: 8,
                      background: isCurrent
                        ? "linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.25))"
                        : "rgba(255, 255, 255, 0.03)",
                      border: isCurrent
                        ? "1px solid #6366f1"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      color: isCurrent ? "#fff" : "var(--fg, #f1f5f9)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      fontSize: 13,
                      transition: "all 0.15s ease",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(99, 102, 241, 0.2)";
                      e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isCurrent
                        ? "linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.25))"
                        : "rgba(255, 255, 255, 0.03)";
                      e.currentTarget.style.borderColor = isCurrent
                        ? "#6366f1"
                        : "rgba(255, 255, 255, 0.08)";
                    }}
                  >
                    <span style={{ fontWeight: isCurrent ? 700 : 500 }}>
                      🏷️ {fullName}
                    </span>
                    {isCurrent && <span style={{ color: "#818cf8", fontSize: 13 }}>✓ 目前使用</span>}
                  </button>
                );
              })
            )}
          </div>
        ) : (
          /* Cascading Two-Column Layout (大類選單 -> 右邊展開小類別) */
          <div
            style={{
              display: "flex",
              flex: 1,
              overflow: "hidden",
              minHeight: 340,
              maxHeight: 420,
            }}
          >
            {/* Left Column: 大類別 (Parent Categories) */}
            <div
              style={{
                width: 190,
                borderRight: "1px solid rgba(255, 255, 255, 0.08)",
                overflowY: "auto",
                background: "rgba(0, 0, 0, 0.2)",
                padding: "8px 6px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--muted, #94a3b8)",
                  padding: "4px 8px 6px",
                  letterSpacing: "0.05em",
                }}
              >
                主大類 (點選展開)
              </div>

              {parentCategories.map((p) => {
                const isSelected = p.id === selectedParentId;
                const subs = subCategoriesByParent.get(p.id) ?? [];
                const isParentOfCurrent = currentCategoryId
                  ? catMap.get(currentCategoryId)?.parentId === p.id || currentCategoryId === p.id
                  : false;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedParentId(p.id)}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: isSelected
                        ? "linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(168, 85, 247, 0.25))"
                        : "transparent",
                      border: isSelected
                        ? "1px solid rgba(99, 102, 241, 0.6)"
                        : "1px solid transparent",
                      color: isSelected ? "#fff" : "var(--fg, #cbd5e1)",
                      fontWeight: isSelected ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 13,
                      transition: "all 0.12s ease",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {p.name}
                      {isParentOfCurrent && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "#818cf8",
                            display: "inline-block",
                          }}
                          title="包含目前選取的分類"
                        />
                      )}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 5px",
                          borderRadius: 10,
                          background: isSelected
                            ? "rgba(255, 255, 255, 0.2)"
                            : "rgba(255, 255, 255, 0.05)",
                          color: isSelected ? "#fff" : "var(--muted, #94a3b8)",
                        }}
                      >
                        {subs.length}
                      </span>
                      <span style={{ fontSize: 11, opacity: isSelected ? 1 : 0.4 }}>▶</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Column: 小類別 (Subcategories) */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {currentParent && (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingBottom: 6,
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc" }}>
                      {currentParent.name} · 細項分類
                    </div>

                    {/* Option to select the parent category directly */}
                    <button
                      type="button"
                      onClick={() => handlePick(currentParent.id)}
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: currentParent.id === currentCategoryId
                          ? "rgba(99, 102, 241, 0.3)"
                          : "rgba(255, 255, 255, 0.06)",
                        border: currentParent.id === currentCategoryId
                          ? "1px solid #818cf8"
                          : "1px solid rgba(255, 255, 255, 0.12)",
                        color: currentParent.id === currentCategoryId ? "#fff" : "var(--muted, #cbd5e1)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                      title="直接歸納至此大類別"
                    >
                      <span>選擇整類 ({currentParent.name})</span>
                      {currentParent.id === currentCategoryId && <span>✓</span>}
                    </button>
                  </div>

                  {/* Subcategories Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {currentSubs.map((sub) => {
                      const isCurrent = sub.id === currentCategoryId;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handlePick(sub.id)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: isCurrent
                              ? "linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(168, 85, 247, 0.25))"
                              : "rgba(255, 255, 255, 0.04)",
                            border: isCurrent
                              ? "1.5px solid #818cf8"
                              : "1px solid rgba(255, 255, 255, 0.08)",
                            color: isCurrent ? "#fff" : "var(--fg, #f1f5f9)",
                            fontWeight: isCurrent ? 700 : 500,
                            fontSize: 13,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 6,
                            transition: "all 0.15s ease",
                            boxShadow: isCurrent ? "0 0 12px rgba(99, 102, 241, 0.3)" : "none",
                          }}
                          onMouseEnter={(e) => {
                            if (!isCurrent) {
                              e.currentTarget.style.background = "rgba(99, 102, 241, 0.18)";
                              e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.45)";
                              e.currentTarget.style.transform = "translateY(-1px)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isCurrent) {
                              e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                              e.currentTarget.style.transform = "translateY(0)";
                            }
                          }}
                        >
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {sub.name}
                          </span>
                          {isCurrent && <span style={{ color: "#818cf8", fontSize: 13 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            background: "rgba(255, 255, 255, 0.02)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: "var(--muted, #94a3b8)",
          }}
        >
          <span>提示：點擊任何小類別即刻套用並關閉</span>
          <span>按 Esc 鍵直接關閉</span>
        </div>
      </div>
    </div>
  );
}
