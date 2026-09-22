import React from "react";

const TYPE_LABELS: Record<string, string> = {
  cash: "現金",
  bank: "銀行",
  credit: "信用卡",
  wallet: "電子錢包",
  loan: "貸款",
  mortgage: "房貸",
};

export function AccountOptions({
  accounts,
  includeOther,
}: {
  accounts: { id?: string; accountId?: string; name: string; currency: string; type?: string }[];
  includeOther?: boolean;
}) {
  const groups = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const label: string = a.type && TYPE_LABELS[a.type] ? TYPE_LABELS[a.type]! : "其他";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(a);
  }

  // Define standard order for group keys
  const order = ["現金", "銀行", "信用卡", "證券", "電子錢包", "房貸", "貸款", "其他"];

  return (
    <>
      {includeOther && <option value="other">其他 (轉帳給他人)</option>}
      {order.map((label) => {
        const items = groups.get(label);
        if (!items || items.length === 0) return null;
        return (
          <optgroup key={label} label={label}>
            {items.map((a) => {
              const id = a.id ?? a.accountId;
              return (
                <option key={id} value={id}>
                  {a.name} ({a.currency}){a.type && TYPE_LABELS[a.type] ? ` [${TYPE_LABELS[a.type]}]` : ""}
                </option>
              );
            })}
          </optgroup>
        );
      })}
    </>
  );
}
