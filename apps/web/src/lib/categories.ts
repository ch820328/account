export type CategoryItem = {
  id: string;
  name: string;
  kind?: string;
  parentId?: string | null;
};

/**
 * Returns the full hierarchical category name: e.g. "🏠 住 · 家庭開銷 · 管理費" or "主分類 · 子分類".
 */
export function getCategoryFullName(
  categoryId: string | null | undefined,
  categories: CategoryItem[] = []
): string {
  if (!categoryId) return "未分類";
  const catMap = new Map<string, CategoryItem>(categories.map((c) => [c.id, c]));
  const item = catMap.get(categoryId);
  if (!item) return "未分類";

  const chain: string[] = [item.name];
  let curr: CategoryItem | undefined = item;
  const visited = new Set<string>([item.id]);

  while (curr?.parentId) {
    if (visited.has(curr.parentId)) break; // cycle protection
    visited.add(curr.parentId);
    const parent = catMap.get(curr.parentId);
    if (!parent) break;
    chain.unshift(parent.name);
    curr = parent;
  }

  return chain.join(" · ");
}

/**
 * Returns the top-level root category name for grouping purposes (e.g. "🏠 住").
 */
export function getParentCategoryName(
  categoryId: string | null | undefined,
  categories: CategoryItem[] = []
): string {
  if (!categoryId) return "未分類";
  const catMap = new Map<string, CategoryItem>(categories.map((c) => [c.id, c]));
  const item = catMap.get(categoryId);
  if (!item) return "未分類";

  let curr: CategoryItem = item;
  const visited = new Set<string>([item.id]);

  while (curr.parentId) {
    if (visited.has(curr.parentId)) break;
    visited.add(curr.parentId);
    const parent = catMap.get(curr.parentId);
    if (!parent) break;
    curr = parent;
  }

  return curr.name;
}

/**
 * Returns the root CategoryItem for a given category.
 */
export function getRootCategory(
  categoryId: string | null | undefined,
  categories: CategoryItem[] = []
): CategoryItem | null {
  if (!categoryId) return null;
  const catMap = new Map<string, CategoryItem>(categories.map((c) => [c.id, c]));
  const item = catMap.get(categoryId);
  if (!item) return null;

  let curr: CategoryItem = item;
  const visited = new Set<string>([item.id]);

  while (curr.parentId) {
    if (visited.has(curr.parentId)) break;
    visited.add(curr.parentId);
    const parent = catMap.get(curr.parentId);
    if (!parent) break;
    curr = parent;
  }

  return curr;
}

/**
 * Returns depth from root: 0 for root pillar, 1 for level 1, 2 for level 2.
 */
export function getCategoryDepth(
  categoryId: string | null | undefined,
  categories: CategoryItem[] = []
): number {
  if (!categoryId) return 0;
  const catMap = new Map<string, CategoryItem>(categories.map((c) => [c.id, c]));
  let depth = 0;
  let curr = catMap.get(categoryId);
  const visited = new Set<string>();

  while (curr?.parentId) {
    if (visited.has(curr.parentId)) break;
    visited.add(curr.parentId);
    depth++;
    curr = catMap.get(curr.parentId);
  }

  return depth;
}

export const FIXED_EXPENSE_PILLARS = ["🍱 食", "👕 衣", "🏠 住", "🚗 行", "📚 育", "🎮 樂", "📦 其他"];

export function getPillarSortIndex(name: string): number {
  if (name === "其他" || name.includes("其他")) return 900;
  const idx = FIXED_EXPENSE_PILLARS.findIndex(
    (p) => p === name || name.includes(p.replace(/^[^\s]+\s*/, ""))
  );
  return idx === -1 ? 999 : idx;
}

export function isFixedPillar(c: { name: string; kind?: string; parentId?: string | null }): boolean {
  if (c.kind !== "expense" || c.parentId) return false;
  return FIXED_EXPENSE_PILLARS.some(
    (p) => p === c.name || c.name.includes(p.replace(/^[^\s]+\s*/, "")) || c.name === "其他" || c.name === "📦 其他"
  );
}

const RECENT_CATEGORIES_KEY = "acc_recent_category_ids";

export function getRecentCategoryIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function recordRecentCategoryId(catId: string | null | undefined): void {
  if (typeof window === "undefined" || !catId) return;
  try {
    const prev = getRecentCategoryIds().filter((id) => id !== catId);
    const updated = [catId, ...prev].slice(0, 3);
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(updated));
  } catch {}
}

