import React, { useMemo } from "react";

export function CategoryOptions({
  categories,
  kind,
  omitNone = false,
}: {
  categories: any[];
  kind: string;
  omitNone?: boolean;
}) {
  const groups = useMemo(() => {
    const all = categories ?? [];
    const active = all.filter((c) => c.kind === kind);
    const childrenByParent = new Map<string, typeof all>();
    for (const c of active) {
      if (c.parentId) {
        const list = childrenByParent.get(c.parentId) ?? [];
        list.push(c);
        childrenByParent.set(c.parentId, list);
      }
    }

    type OptionItem = { id: string; label: string; isSubGroup?: boolean; isLeaf?: boolean };
    const itemsList: ({ type: 'group'; parent: (typeof all)[0]; label: string; options: OptionItem[] } | { type: 'standalone'; item: (typeof all)[0] })[] = [];

    for (const p of active.filter((c) => !c.parentId)) {
      const l1 = childrenByParent.get(p.id) ?? [];
      if (l1.length) {
        const options: OptionItem[] = [];
        for (const item1 of l1) {
          const l2 = childrenByParent.get(item1.id) ?? [];
          if (l2.length > 0) {
            options.push({ id: item1.id, label: `📁 ${item1.name}`, isSubGroup: true });
            for (const item2 of l2) {
              options.push({ id: item2.id, label: `\u00A0\u00A0\u00A0\u00A0↳ ${item2.name}`, isLeaf: true });
            }
          } else {
            options.push({ id: item1.id, label: item1.name, isLeaf: true });
          }
        }
        itemsList.push({ type: 'group', parent: p, label: p.name, options });
      } else {
        itemsList.push({ type: 'standalone', item: p });
      }
    }
    return itemsList;
  }, [categories, kind]);

  return (
    <>
      {!omitNone && <option value="">未分類</option>}
      {groups.map((x) =>
        x.type === "group" ? (
          <optgroup key={x.label} label={x.label}>
            <option value={x.parent.id}>
              {x.parent.name} (整類)
            </option>
            {x.options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={x.item.id} value={x.item.id}>
            {x.item.name}
          </option>
        )
      )}
    </>
  );
}
