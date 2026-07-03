import { fmt } from "@/lib/format";

export type MoneyKind = "income" | "expense" | "neutral" | "auto";

type AmountProps = {
  value: bigint;
  currency: string;
  kind?: MoneyKind;
  /** Show + / − before the amount (uses absolute value when kind is income/expense). */
  signed?: boolean;
  className?: string;
  variant?: "amount" | "stat" | "inline";
};

function resolveKind(value: bigint, kind: MoneyKind): "income" | "expense" | "neutral" {
  if (kind === "auto") {
    if (value > 0n) return "income";
    if (value < 0n) return "expense";
    return "neutral";
  }
  return kind;
}

export function Amount({
  value,
  currency,
  kind = "neutral",
  signed = false,
  className = "",
  variant = "amount",
}: AmountProps) {
  const resolved = resolveKind(value, kind);
  const displayValue =
    signed && resolved !== "neutral" && value < 0n ? -value : value;

  let prefix = "";
  if (signed) {
    if (resolved === "income") prefix = "+";
    else if (resolved === "expense") prefix = "−";
    else if (kind === "auto") {
      if (value > 0n) prefix = "+";
      else if (value < 0n) prefix = "−";
    }
  }

  const variantClass =
    variant === "stat" ? "stat" : variant === "amount" ? "amount" : "money";
  const colorClass = resolved !== "neutral" ? resolved : "";

  return (
    <span className={[variantClass, colorClass, className].filter(Boolean).join(" ")}>
      {prefix}
      {fmt(displayValue, currency)}
    </span>
  );
}
