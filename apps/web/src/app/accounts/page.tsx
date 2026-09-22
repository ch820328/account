"use client";

import { AmountInput } from "@/components/AmountInput";
import { Amount } from "@/components/Amount";
import { TopBar } from "@/components/TopBar";
import { Skeleton, SkeletonCard, SkeletonList } from "@/components/Skeleton";
import { AccountOptions } from "@/components/AccountOptions";
import { useSession } from "@/lib/auth-client";
import { fmt } from "@/lib/format";
import { SUPPORTED_CURRENCIES } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toDecimalString } from "@acc/money";
import { niceConfirm } from "@/lib/confirm";

const CURRENCY_FLAGS: Record<string, string> = {
  TWD: "🇹🇼",
  USD: "🇺🇸",
  JPY: "🇯🇵",
  HKD: "🇭🇰",
  CNY: "🇨🇳",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  SGD: "🇸🇬",
  CHF: "🇨🇭",
  NZD: "🇳🇿",
  KRW: "🇰🇷",
};

const ASSET_SUBTYPES: { value: string; label: string }[] = [
  { value: "bank", label: "銀行" },
  { value: "cash", label: "現金" },
  { value: "wallet", label: "電子錢包" },
  { value: "credit", label: "信用卡 (負債)" },
];

import { TAIWAN_BANKS } from "@/lib/banks";

type AccountRow = {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  balanceMinor: bigint;
  isLiability: boolean;
  balanceBaseMinor?: bigint;
  baseCurrency?: string;
  parentId?: string | null;
  bankCode?: string | null;
  accountNumber?: string | null;
  billingDay?: number | null;
  repaymentDay?: number | null;
  balanceUpdatedAt?: Date | string | null;
  cardNumber?: string | null;
  cardExpiry?: string | null;
  cardBrand?: string | null;
  archived?: boolean;
  createdAt?: Date | string | null;
};

interface GroupedAccount {
  id: string;
  name: string;
  subtitle: string;
  accounts: AccountRow[];
  totalBaseMinor: bigint;
  totalsByCurrency: {
    currency: string;
    balanceMinor: bigint;
    assetBalanceMinor: bigint;
    creditBalanceMinor: bigint;
    hasAsset: boolean;
    hasCredit: boolean;
    netBalanceMinor: bigint;
  }[];
  foreignEquivalentBaseMinor: bigint;
}

function parseErrorMessage(err: any): string {
  const msg = err.message || String(err);
  try {
    if (msg.startsWith("[") && msg.endsWith("]")) {
      const parsed = JSON.parse(msg);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        const fieldNameMap: Record<string, string> = {
          name: "名稱",
          currency: "幣別",
          openingBalance: "目前餘額",
          bankCode: "銀行代碼",
          accountNumber: "銀行帳號",
        };
        const path = first.path?.[0];
        const field = fieldNameMap[path] || path || "";
        const m = first.message;
        if (m.includes("at least 1 character") || m.includes("Required")) {
          return `${field || "欄位"}不能為空`;
        }
        return `${field ? field + "：" : ""}${m}`;
      }
    }
  } catch { }
  return msg;
}

function getAccountMeta(a: AccountRow, omitBank = false) {
  const parts: string[] = [];
  parts.push(a.currency);
  if (a.bankCode && !omitBank) {
    parts.push(`${TAIWAN_BANKS[a.bankCode] || a.bankCode} (${a.bankCode})`);
  }
  if (a.type === "credit") {
    parts.push(`信用卡`);
    if (a.billingDay) parts.push(`結帳日: 每月 ${a.billingDay} 日`);
    if (a.repaymentDay) parts.push(`繳款日: 每月 ${a.repaymentDay} 日`);
  }
  return parts.join(" · ");
}

export default function AccountsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const accounts = trpc.accounts.listWithBalances.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const rsuQuery = trpc.rsu.list.useQuery(undefined, { enabled: !!session?.user });
  const ratesQuery = trpc.accounts.activeFxRates.useQuery(undefined, { enabled: !!session?.user });

  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState("bank");
  const [currency, setCurrency] = useState("TWD");
  const [openingBalance, setOpeningBalance] = useState("");
  const [parentId, setParentId] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [billingDay, setBillingDay] = useState("");
  const [repaymentDay, setRepaymentDay] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [balanceDraft, setBalanceDraft] = useState("");

  const [editingMetaId, setEditingMetaId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBankCode, setEditBankCode] = useState("");
  const [editAccountNumber, setEditAccountNumber] = useState("");
  const [editBillingDay, setEditBillingDay] = useState("");
  const [editRepaymentDay, setEditRepaymentDay] = useState("");
  const [editType, setEditType] = useState("");
  const [editParentId, setEditParentId] = useState("");

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardBrand, setCardBrand] = useState("visa");

  const [editCardNumber, setEditCardNumber] = useState("");
  const [editCardExpiry, setEditCardExpiry] = useState("");
  const [editCardBrand, setEditCardBrand] = useState("visa");

  const invalidate = () =>
    Promise.all([
      utils.accounts.listWithBalances.invalidate(),
      utils.accounts.list.invalidate(),
      utils.netWorth.summary.invalidate(),
      utils.forecast.projection.invalidate(),
      utils.rsu.list.invalidate(),
    ]);

  const getStartOfCurrentWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };



  const create = trpc.accounts.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      setName("");
      setOpeningBalance("");
      setParentId("");
      setBankCode("");
      setAccountNumber("");
      setBillingDay("");
      setRepaymentDay("");
      setCardNumber("");
      setCardExpiry("");
      setError(null);
    },
    onError: (e) => setError(parseErrorMessage(e)),
  });

  const setBalance = trpc.accounts.setBalance.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingMetaId(null);
      setError(null);
    },
    onError: (e) => setError(parseErrorMessage(e)),
  });

  const deleteAccount = trpc.accounts.delete.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingMetaId(null);
      setError(null);
    },
    onError: (e) => setError(parseErrorMessage(e)),
  });

  const update = trpc.accounts.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingMetaId(null);
      setError(null);
    },
    onError: (e) => setError(parseErrorMessage(e)),
  });

  const handleSaveMeta = (
    id: string,
    name: string,
    parentId: string,
    bankCode: string,
    billingDay: string,
    cardNumber: string,
    cardExpiry: string,
    cardBrand: string,
    balance?: string,
    prevBalanceMinor?: bigint
  ) => {
    update.mutate({
      id,
      name: name || undefined,
      parentId: parentId || null,
      bankCode: bankCode || null,
      accountNumber: null,
      billingDay: billingDay ? Number(billingDay) : null,
      cardNumber: cardNumber || null,
      cardExpiry: cardExpiry || null,
      cardBrand: cardBrand || null,
    });
    if (balance !== undefined && prevBalanceMinor !== undefined) {
      const currentDecimalStr = String(Number(prevBalanceMinor) / 100);
      if (balance !== currentDecimalStr) {
        setBalance.mutate({ id, balance, prevBalance: currentDecimalStr });
      }
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await niceConfirm("刪除帳戶", `確認要刪除「${name}」？`, "danger");
    if (ok) deleteAccount.mutate({ id });
  };

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container">
          <Skeleton width={120} height={28} style={{ marginBottom: 20 }} />
          <SkeletonCard />
          <div style={{ marginTop: 24 }}>
            <SkeletonList rows={3} />
          </div>
        </div>
      </>
    );
  }

  const assetAccounts = ((accounts.data ?? []) as AccountRow[]).filter((a) => !a.isLiability || a.type === "credit");
  const primaryAccounts = assetAccounts.filter((a) => !a.parentId);
  const childAccounts = assetAccounts.filter((a) => a.parentId);

  const getGroupKey = (a: AccountRow): string => {
    if (a.parentId) {
      const parent = assetAccounts.find((p) => p.accountId === a.parentId);
      return parent ? getGroupKey(parent) : `account_${a.parentId}`;
    }
    if (a.bankCode) return `bank_${a.bankCode}`;
    if (a.type === "cash") return "cash";
    if (a.type === "wallet") return "wallet";
    if (a.type === "broker") return `broker_${a.accountId}`;
    return `account_${a.accountId}`;
  };

  const getGroupName = (key: string, groupAccounts: AccountRow[]): string => {
    if (key.startsWith("bank_")) {
      const code = key.replace("bank_", "");
      const bankName = TAIWAN_BANKS[code];
      const names = new Map<string, number>();
      for (const a of groupAccounts) {
        if (a.name) names.set(a.name, (names.get(a.name) ?? 0) + 1);
      }
      let maxCount = 0;
      let bestName = "";
      for (const [name, count] of names.entries()) {
        if (count > maxCount) {
          maxCount = count;
          bestName = name;
        }
      }
      return bestName || bankName || `銀行 (${code})`;
    }
    if (key === "cash") return "現金";
    if (key === "wallet") return "電子錢包";
    if (key.startsWith("broker_")) {
      return groupAccounts[0]?.name || "證券帳戶";
    }
    if (key.startsWith("account_")) {
      const accId = key.replace("account_", "");
      const acc = assetAccounts.find((a) => a.accountId === accId);
      if (acc) return acc.name;
    }
    return groupAccounts[0]?.name || "其他帳戶";
  };

  const getGroupSubtitle = (key: string, groupAccounts: AccountRow[]): string => {
    if (key.startsWith("bank_")) {
      const code = key.replace("bank_", "");
      const bankName = TAIWAN_BANKS[code];
      return bankName ? `${bankName} (${code})` : `銀行代碼: ${code}`;
    }
    if (key === "cash") return "實體貨幣與現金";
    if (key === "wallet") return "電子支付與錢包";
    if (key.startsWith("broker_")) return "📈 證券帳戶";
    if (key.startsWith("account_")) {
      const accId = key.replace("account_", "");
      const acc = assetAccounts.find((a) => a.accountId === accId);
      if (acc) return getAccountMeta(acc);
    }
    return groupAccounts[0] ? getAccountMeta(groupAccounts[0]) : "";
  };

  const base = "TWD";
  const rates = ratesQuery.data?.rates ?? [];
  const getRate = (curr: string): number => {
    if (curr === "TWD") return 1;
    return rates.find((r) => r.currency === curr)?.rate ?? 1;
  };

  const groupsMap = new Map<string, AccountRow[]>();
  for (const a of assetAccounts) {
    if (a.archived) continue;
    const key = getGroupKey(a);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(a);
  }

  const groupedAssets: GroupedAccount[] = [];
  for (const [key, list] of groupsMap.entries()) {
    const totalBaseMinor = list.reduce(
      (sum, a) => sum + (a.isLiability ? -(a.balanceBaseMinor ?? 0n) : (a.balanceBaseMinor ?? 0n)),
      0n
    );

    const currencyMap = new Map<
      string,
      {
        assetBalanceMinor: bigint;
        creditBalanceMinor: bigint;
        hasAsset: boolean;
        hasCredit: boolean;
      }
    >();
    let foreignEquivalentBaseMinor = 0n;

    for (const a of list) {
      const isCredit = a.type === "credit" || a.isLiability;
      const curr = a.currency;
      if (!currencyMap.has(curr)) {
        currencyMap.set(curr, {
          assetBalanceMinor: 0n,
          creditBalanceMinor: 0n,
          hasAsset: false,
          hasCredit: false,
        });
      }
      const entry = currencyMap.get(curr)!;
      if (isCredit) {
        entry.creditBalanceMinor += a.balanceMinor;
        entry.hasCredit = true;
      } else {
        entry.assetBalanceMinor += a.balanceMinor;
        entry.hasAsset = true;
      }

      if (a.currency !== "TWD" && a.balanceBaseMinor !== undefined) {
        foreignEquivalentBaseMinor += isCredit ? -a.balanceBaseMinor : a.balanceBaseMinor;
      }
    }

    const totalsByCurrency = Array.from(currencyMap.entries())
      .map(([curr, item]) => ({
        currency: curr,
        balanceMinor: item.assetBalanceMinor - item.creditBalanceMinor,
        assetBalanceMinor: item.assetBalanceMinor,
        creditBalanceMinor: item.creditBalanceMinor,
        hasAsset: item.hasAsset,
        hasCredit: item.hasCredit,
        netBalanceMinor: item.assetBalanceMinor - item.creditBalanceMinor,
      }))
      .sort((x, y) => (x.currency === "TWD" ? -1 : y.currency === "TWD" ? 1 : x.currency.localeCompare(y.currency)));

    list.sort((x, y) => (x.currency === "TWD" ? -1 : y.currency === "TWD" ? 1 : x.currency.localeCompare(y.currency)));

    groupedAssets.push({
      id: key,
      name: getGroupName(key, list),
      subtitle: getGroupSubtitle(key, list),
      accounts: list,
      totalBaseMinor,
      totalsByCurrency,
      foreignEquivalentBaseMinor,
    });
  }

  const activeRsus = rsuQuery.data?.filter((r) => r.active) ?? [];
  if (activeRsus.length > 0) {
    let rsuTotalBase = 0n;
    const rsuAccounts: AccountRow[] = [];
    for (const r of activeRsus) {
      const pendingQty = r.vests.filter((v) => v.status === "pending").reduce((sum, v) => sum + Number(v.quantity), 0);
      const effectivePrice = Number(r.currentPrice || (r as any).estimatedPrice || 0);
      const valueAfterSellToCover = pendingQty * (1 - Number(r.sellToCoverPct) / 100) * effectivePrice;
      const valueInBase = BigInt(Math.round(valueAfterSellToCover * getRate(r.priceCurrency) * 100));
      rsuTotalBase += valueInBase;
      rsuAccounts.push({
        accountId: `rsu_${r.id}`,
        name: `${r.name} (${r.symbol}) · 待解鎖 ${pendingQty} 股`,
        type: "rsu",
        currency: r.priceCurrency,
        balanceMinor: BigInt(Math.round(valueAfterSellToCover * 100)),
        isLiability: false,
        balanceBaseMinor: valueInBase,
        baseCurrency: "TWD",
        bankCode: null,
        accountNumber: null,
      });
    }
    groupedAssets.push({
      id: "rsu_group",
      name: "RSU 股票授予",
      subtitle: "未領取股票估值折算",
      accounts: rsuAccounts,
      totalBaseMinor: rsuTotalBase,
      totalsByCurrency: [
        {
          currency: "TWD",
          balanceMinor: rsuTotalBase,
          assetBalanceMinor: rsuTotalBase,
          creditBalanceMinor: 0n,
          hasAsset: true,
          hasCredit: false,
          netBalanceMinor: rsuTotalBase,
        },
      ],
      foreignEquivalentBaseMinor: 0n,
    });
  }

  groupedAssets.sort((x, y) => {
    const getOrder = (id: string) => {
      if (id === "cash") return 1;
      if (id === "wallet") return 2;
      if (id.startsWith("bank_")) return 3;
      if (id === "rsu_group") return 5;
      return 4;
    };
    const orderX = getOrder(x.id);
    const orderY = getOrder(y.id);
    if (orderX !== orderY) return orderX - orderY;
    return x.name.localeCompare(y.name);
  });

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>帳戶管理</h2>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          管理您的流動資金與信用卡（包含銀行活存、現金、電子錢包與信用卡）。房貸與信貸等定期負債管理，請造訪 <Link href="/schedule?tab=loan" style={{ color: "var(--accent)" }}>房貸與貸款專區 ➔</Link>。
        </p>

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate({
              name: parentId && !name ? (primaryAccounts.find(p => p.accountId === parentId)?.name ?? name) : name,
              side: subtype === "credit" ? "liability" : "asset",
              subtype,
              currency,
              openingBalance: openingBalance || undefined,
              parentId: parentId || undefined,
              bankCode: bankCode || undefined,
              accountNumber: accountNumber || undefined,
              billingDay: billingDay ? Number(billingDay) : undefined,
              repaymentDay: repaymentDay ? Number(repaymentDay) : undefined,
            });
          }}
        >
          <div className="grid cols-3">
            <label>
              名稱
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="台新薪轉 (隸屬主帳戶時可不填)" />
            </label>
            <label>
              類型
              <select value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                {ASSET_SUBTYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              幣別
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={
            (subtype === "cash" || subtype === "wallet") ? "grid cols-2" : "grid cols-3"
          } style={{ marginTop: 12 }}>
            <label>
              目前餘額
              <AmountInput

                value={openingBalance}
                onChange={setOpeningBalance}
                placeholder="0"
              />
            </label>
            <label>
              隸屬主帳戶 (可選)
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">獨立帳戶 / 新增主帳戶</option>
                <AccountOptions accounts={primaryAccounts} />
              </select>
            </label>
            {subtype !== "cash" && subtype !== "wallet" && subtype !== "broker" && (
              <label>
                銀行代碼 (如 822)
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    value={bankCode}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBankCode(val);
                      if (TAIWAN_BANKS[val] && !name) {
                        setName(TAIWAN_BANKS[val]);
                      }
                    }}
                    placeholder="822"
                    maxLength={3}
                  />
                  {TAIWAN_BANKS[bankCode] && (
                    <span style={{ fontSize: "11px", color: "var(--income)", whiteSpace: "nowrap" }}>
                      ✓ {TAIWAN_BANKS[bankCode]}
                    </span>
                  )}
                </div>
              </label>
            )}
            {subtype === "broker" && (
              <label>
                證券帳號 (可選)
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="123456789012"
                />
              </label>
            )}
          </div>

          {subtype === "bank" && (
            <div className="grid cols-1" style={{ marginTop: 12 }}>
              <label>
                銀行帳號 (可選)
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="123456789012"
                />
              </label>
            </div>
          )}

          {(subtype === "credit" || subtype === "loan" || subtype === "mortgage") && (
            <div className="grid cols-1" style={{ marginTop: 12 }}>
              <label style={{ color: "var(--accent)", fontWeight: "600" }}>
                🔗 對應主扣款 / 開戶銀行（指定這張信用卡/貸款掛在哪個銀行下）
                <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={{ marginTop: 4 }}>
                  <option value="">(自動依名稱配對 / 獨立帳戶)</option>
                  {(accounts.data ?? [])
                    .filter((a) => a.type === "bank" && !a.archived)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        🏦 {b.name} ({b.currency})
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}

          <button className="btn" style={{ marginTop: 14 }} disabled={create.isPending}>
            {create.isPending ? "新增中…" : "新增帳戶"}
          </button>
        </form>



        <div className="section-title">我的帳戶</div>
        {accounts.isLoading ? (
          <div className="muted">載入中…</div>
        ) : !groupedAssets.length ? (
          <div className="muted">尚無帳戶。</div>
        ) : (
          <div className="list" style={{ display: "grid", gap: "20px" }}>
            {groupedAssets.map((g) => {
              const isGroupCard =
                g.accounts.length > 1 ||
                ["cash", "wallet", "rsu_group"].includes(g.id) ||
                g.id.startsWith("bank_") ||
                g.id.startsWith("broker_") ||
                g.accounts.some((a) => a.type === "broker");

              if (!isGroupCard) {
                const a = g.accounts[0]!;
                const isEditingMeta = editingMetaId === a.accountId;
                if (a.type === "credit") {
                  return (
                    <PhysicalCreditCard
                      key={a.accountId}
                      a={a}
                      name={g.name}
                      isEditingMeta={isEditingMeta}
                      editingMetaId={editingMetaId}
                      editName={editName}
                      editParentId={editParentId}
                      editBankCode={editBankCode}
                      editBillingDay={editBillingDay}
                      editCardNumber={editCardNumber}
                      editCardExpiry={editCardExpiry}
                      editCardBrand={editCardBrand}
                      setEditingMetaId={setEditingMetaId}
                      setEditName={setEditName}
                      setEditParentId={setEditParentId}
                      setEditBankCode={setEditBankCode}
                      setEditBillingDay={setEditBillingDay}
                      setEditCardNumber={setEditCardNumber}
                      setEditCardExpiry={setEditCardExpiry}
                      setEditCardBrand={setEditCardBrand}
                      setBalanceDraft={setBalanceDraft}
                      balanceDraft={balanceDraft}
                      assetAccounts={assetAccounts}
                      invalidate={invalidate}
                      setError={setError}
                      onSave={handleSaveMeta}
                    />
                  );
                }
                return (
                  <div className={`list-item${isEditingMeta ? " editing" : ""}`} key={a.accountId}>
                    <div className="row">
                      <div className="meta">
                        <span className="primary">{a.name}</span>
                        <span className="secondary" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap" }}>
                          {getAccountMeta(a)}
                          {a.accountNumber && (
                            <span style={{ display: "inline-flex", alignItems: "center", marginLeft: "6px" }}>
                              · {a.type === "broker" ? "證券帳號" : "帳號"}: {a.accountNumber}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="row-inline">
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                          <Amount value={a.balanceMinor} currency={a.currency} kind="neutral" />
                          {a.balanceBaseMinor !== undefined && a.baseCurrency && a.currency !== a.baseCurrency && (
                            <span className="muted" style={{ fontSize: "11px" }}>
                              ≈ <Amount value={a.balanceBaseMinor} currency={a.baseCurrency} kind="neutral" variant="inline" />
                            </span>
                          )}
                        </div>
                        {a.type === "rsu" ? (
                          <Link className="btn ghost" href="/schedule" style={{ padding: "6px 10px", fontSize: "12px", whiteSpace: "nowrap" }}>
                            管理
                          </Link>
                        ) : (
                          <>
                            {!isEditingMeta && (
                              <>
                                <button
                                  className="btn ghost"
                                  type="button"
                                  title="編輯"
                                  onClick={() => {
                                    setEditingMetaId(a.accountId);
                                    setEditName(a.name);
                                    setEditBankCode(a.bankCode ?? "");
                                    setEditAccountNumber(a.accountNumber ?? "");
                                    setEditBillingDay(a.billingDay ? String(a.billingDay) : "");
                                    setEditRepaymentDay(a.repaymentDay ? String(a.repaymentDay) : "");
                                    setEditType(a.type);
                                    setBalanceDraft(String(Number(a.balanceMinor) / 100));
                                  }}
                                  style={{ padding: "6px 8px", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                                <Link
                                  className="btn ghost"
                                  href={`/transactions?account=${a.accountId}`}
                                  title="明細"
                                  style={{ padding: "6px 8px", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                    <polyline points="10 9 9 9 8 9"></polyline>
                                  </svg>
                                </Link>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {isEditingMeta && (
                      <div className="row-edit-panel" style={{ marginTop: "10px" }}>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            update.mutate({
                              id: a.accountId,
                              name: editName || undefined,
                              type: editType as any,
                              bankCode: editBankCode || null,
                              accountNumber: editAccountNumber || null,
                              billingDay: editBillingDay ? Number(editBillingDay) : null,
                              repaymentDay: editRepaymentDay ? Number(editRepaymentDay) : null,
                            });
                            const currentDecimalStr = String(Number(a.balanceMinor) / 100);
                            if (balanceDraft !== currentDecimalStr) {
                              setBalance.mutate({
                                id: a.accountId,
                                balance: balanceDraft,
                                prevBalance: currentDecimalStr,
                              });
                            }
                          }}
                        >
                          <div className="grid cols-3">
                            <label>
                              帳戶名稱
                              <input required value={editName} onChange={(e) => setEditName(e.target.value)} />
                            </label>
                            <label>
                              目前餘額（{a.currency}）
                              <AmountInput value={balanceDraft} onChange={setBalanceDraft} />
                            </label>
                            <label>
                              帳戶類型
                              <select value={editType} onChange={(e) => setEditType(e.target.value)}>
                                {ASSET_SUBTYPES.map(t => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                            </label>
                            {editType !== "cash" && editType !== "wallet" && editType !== "broker" && (
                              <label>
                                銀行代碼 (可選)
                                <input value={editBankCode} onChange={(e) => setEditBankCode(e.target.value)} maxLength={3} />
                              </label>
                            )}
                            {editType !== "credit" && editType !== "cash" && editType !== "wallet" && (
                              <label>
                                {editType === "broker" ? "證券帳號 (可選)" : "銀行帳號 (可選)"}
                                <input value={editAccountNumber} onChange={(e) => setEditAccountNumber(e.target.value)} />
                              </label>
                            )}
                          </div>
                          {a.type === "credit" && (
                            <div className="grid cols-2" style={{ marginTop: 10 }}>
                              <label>
                                結帳日 (每月的幾號)
                                <input type="number" min={1} max={31} value={editBillingDay} onChange={(e) => setEditBillingDay(e.target.value)} />
                              </label>
                              <label>
                                繳款日 (每月的幾號)
                                <input type="number" min={1} max={31} value={editRepaymentDay} onChange={(e) => setEditRepaymentDay(e.target.value)} />
                              </label>
                            </div>
                          )}
                          <div className="row-inline" style={{ marginTop: "10px" }}>
                            <button className="btn sm" type="submit" disabled={update.isPending || setBalance.isPending}>
                              {update.isPending || setBalance.isPending ? "儲存中…" : "儲存"}
                            </button>
                            <button type="button" className="btn ghost sm" onClick={() => setEditingMetaId(null)}>
                              取消
                            </button>
                            <button type="button" className="btn danger sm" onClick={() => handleDelete(a.accountId, a.name)} disabled={deleteAccount.isPending} style={{ marginLeft: "auto" }}>
                              {deleteAccount.isPending ? "刪除中…" : "刪除"}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div className="card" key={g.id} style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "14px", marginBottom: "14px" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text)", textTransform: "none", fontWeight: 700 }}>
                        {g.name}
                      </h3>
                      <span className="secondary" style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {g.subtitle}
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {g.totalsByCurrency.map((t) => {
                        const fmtM = (val: bigint) => Math.round(Number(val) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

                        if (t.hasAsset && t.hasCredit) {
                          return (
                            <div key={t.currency} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", marginBottom: "6px" }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                                <span className="muted" style={{ fontSize: "11px" }}>存款資產</span>
                                <span className="muted" style={{ fontSize: "11px" }}>{t.currency}</span>
                                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--fg)" }}>
                                  $ {fmtM(t.assetBalanceMinor)}
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                                <span className="muted" style={{ fontSize: "11px" }}>刷卡未繳</span>
                                <span className="muted" style={{ fontSize: "11px" }}>{t.currency}</span>
                                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--expense)" }}>
                                  -$ {fmtM(t.creditBalanceMinor)}
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: "2px", marginTop: "2px" }}>
                                <span className="muted" style={{ fontSize: "11px" }}>兩者淨額</span>
                                <span className="muted" style={{ fontSize: "11px" }}>{t.currency}</span>
                                <span style={{ fontSize: "15px", fontWeight: 700, color: t.netBalanceMinor < 0n ? "var(--expense)" : "var(--fg)" }}>
                                  {t.netBalanceMinor < 0n ? "-$" : "$"} {fmtM(t.netBalanceMinor < 0n ? -t.netBalanceMinor : t.netBalanceMinor)}
                                </span>
                              </div>
                            </div>
                          );
                        }

                        if (t.hasCredit && !t.hasAsset) {
                          return (
                            <div key={t.currency} style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: "6px" }}>
                              <span className="muted" style={{ fontSize: "11px" }}>💳 刷卡未繳</span>
                              <span className="muted" style={{ fontSize: "12px", width: "32px", textAlign: "left" }}>{t.currency}</span>
                              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--expense)" }}>
                                -$ {fmtM(t.creditBalanceMinor)}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div key={t.currency} style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: "6px" }}>
                            <span className="muted" style={{ fontSize: "12px", width: "32px", textAlign: "left" }}>{t.currency}</span>
                            <span style={{ fontSize: "16px", fontWeight: 700 }}>
                              <Amount value={t.assetBalanceMinor} currency={t.currency} kind="income" variant="stat" />
                            </span>
                          </div>
                        );
                      })}
                      {g.foreignEquivalentBaseMinor !== 0n && g.totalsByCurrency.some(t => t.currency !== base) && (
                        <div style={{ marginTop: "4px" }}>
                          <span className="muted" style={{ fontSize: "11px" }}>
                            外幣等值 ≈ <Amount value={g.foreignEquivalentBaseMinor} currency={base} kind="neutral" variant="inline" />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                    {g.accounts.map((a) => {
                      const isEditingMeta = editingMetaId === a.accountId;
                      if (a.type === "credit") {
                        return (
                          <PhysicalCreditCard
                            key={a.accountId}
                            a={a}
                            name={g.name}
                            isEditingMeta={isEditingMeta}
                            editingMetaId={editingMetaId}
                            editName={editName}
                            editParentId={editParentId}
                            editBankCode={editBankCode}
                            editBillingDay={editBillingDay}
                            editCardNumber={editCardNumber}
                            editCardExpiry={editCardExpiry}
                            editCardBrand={editCardBrand}
                            setEditingMetaId={setEditingMetaId}
                            setEditName={setEditName}
                            setEditParentId={setEditParentId}
                            setEditBankCode={setEditBankCode}
                            setEditBillingDay={setEditBillingDay}
                            setEditCardNumber={setEditCardNumber}
                            setEditCardExpiry={setEditCardExpiry}
                            setEditCardBrand={setEditCardBrand}
                            setBalanceDraft={setBalanceDraft}
                            balanceDraft={balanceDraft}
                            assetAccounts={assetAccounts}
                            invalidate={invalidate}
                            setError={setError}
                            onSave={handleSaveMeta}
                          />
                        );
                      }

                      return (
                        <div className={`list-item${isEditingMeta ? " editing" : ""}`} key={a.accountId} style={{ borderBottom: "1px dashed rgba(255,255,255,0.04)", paddingBottom: "8px" }}>
                          <div className="row" style={{ border: "none", padding: 0 }}>
                            <div className="meta">
                              <span className="primary" style={{ fontSize: "14px", fontWeight: 600 }}>
                                {CURRENCY_FLAGS[a.currency] || "🏳️"} {a.currency}
                              </span>
                              <span className="secondary" style={{ fontSize: "12px", color: "var(--muted)" }}>
                                {getAccountMeta(a, true)}
                                {a.accountNumber && (
                                  <span style={{ display: "block", marginTop: "2px" }}>
                                    · {a.type === "broker" ? "證券帳號" : "帳號"}: {a.accountNumber}
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="row-inline">
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                                <Amount
                                  value={a.balanceMinor}
                                  currency={a.currency}
                                  kind={a.isLiability ? "expense" : "income"}
                                  signed={a.isLiability}
                                />
                                {a.balanceBaseMinor !== undefined && a.baseCurrency && a.currency !== a.baseCurrency && (
                                  <span className="muted" style={{ fontSize: "11px" }}>
                                    ≈ <Amount value={a.balanceBaseMinor} currency={a.baseCurrency} kind="neutral" variant="inline" />
                                  </span>
                                )}
                              </div>
                              {a.type === "rsu" ? (
                                <Link className="btn ghost" href="/schedule" style={{ padding: "6px 10px", fontSize: "12px", whiteSpace: "nowrap" }}>
                                  管理
                                </Link>
                              ) : (
                                <>
                                  {!isEditingMeta && (
                                    <>
                                      <button
                                        className="btn ghost"
                                        type="button"
                                        title="編輯"
                                        onClick={() => {
                                          setEditingMetaId(a.accountId);
                                          setEditName(a.name);
                                          setEditBankCode(a.bankCode ?? "");
                                          setEditAccountNumber(a.accountNumber ?? "");
                                          setEditBillingDay(a.billingDay ? String(a.billingDay) : "");
                                          setEditRepaymentDay(a.repaymentDay ? String(a.repaymentDay) : "");
                                          setEditType(a.type);
                                          setEditParentId(a.parentId ?? "");
                                          setBalanceDraft(String(Number(a.balanceMinor) / 100));
                                        }}
                                        style={{ padding: "6px 8px", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                      </button>
                                      <Link
                                        className="btn ghost"
                                        href={`/transactions?account=${a.accountId}`}
                                        title="明細"
                                        style={{ padding: "6px 8px", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                          <polyline points="14 2 14 8 20 8"></polyline>
                                          <line x1="16" y1="13" x2="8" y2="13"></line>
                                          <line x1="16" y1="17" x2="8" y2="17"></line>
                                          <polyline points="10 9 9 9 8 9"></polyline>
                                        </svg>
                                      </Link>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {isEditingMeta && (
                            <div className="row-edit-panel" style={{ marginTop: "10px" }}>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  update.mutate({
                                    id: a.accountId,
                                    name: editName || undefined,
                                    parentId: editParentId || null,
                                    bankCode: editBankCode || null,
                                    accountNumber: editAccountNumber || null,
                                    billingDay: editBillingDay ? Number(editBillingDay) : null,
                                    repaymentDay: editRepaymentDay ? Number(editRepaymentDay) : null,
                                  });
                                  const currentDecimalStr = String(Number(a.balanceMinor) / 100);
                                  if (balanceDraft !== currentDecimalStr) {
                                    setBalance.mutate({
                                      id: a.accountId,
                                      balance: balanceDraft,
                                      prevBalance: currentDecimalStr,
                                    });
                                  }
                                }}
                              >
                                <div className={
                                  a.type === "credit" ? "grid cols-2" :
                                    (a.type === "cash" || a.type === "wallet") ? "grid cols-2" :
                                      a.type === "broker" ? "grid cols-2" : "grid cols-3"
                                }>
                                  <label>
                                    帳戶名稱
                                    <input required value={editName} onChange={(e) => setEditName(e.target.value)} />
                                  </label>
                                  <label>
                                    目前餘額（{a.currency}）
                                    <AmountInput value={balanceDraft} onChange={setBalanceDraft} />
                                  </label>
                                  {a.type !== "cash" && a.type !== "wallet" && a.type !== "broker" && (
                                    <label>
                                      銀行代碼 (可選)
                                      <input value={editBankCode} onChange={(e) => setEditBankCode(e.target.value)} maxLength={3} />
                                    </label>
                                  )}
                                  {a.type !== "credit" && a.type !== "cash" && a.type !== "wallet" && (
                                    <label>
                                      {a.type === "broker" ? "證券帳號 (可選)" : "銀行帳號 (可選)"}
                                      <input value={editAccountNumber} onChange={(e) => setEditAccountNumber(e.target.value)} />
                                    </label>
                                  )}
                                </div>
                                {a.type === "credit" && (
                                  <div className="grid cols-2" style={{ marginTop: 10 }}>
                                    <label>
                                      結帳日 (每月的幾號)
                                      <input type="number" min={1} max={31} value={editBillingDay} onChange={(e) => setEditBillingDay(e.target.value)} />
                                    </label>
                                    <label>
                                      繳款日 (每月的幾號)
                                      <input type="number" min={1} max={31} value={editRepaymentDay} onChange={(e) => setEditRepaymentDay(e.target.value)} />
                                    </label>
                                  </div>
                                )}
                                <div className="row-inline" style={{ marginTop: "10px" }}>
                                  <button className="btn sm" type="submit" disabled={update.isPending || setBalance.isPending}>
                                    {update.isPending || setBalance.isPending ? "儲存中…" : "儲存"}
                                  </button>
                                  <button type="button" className="btn ghost sm" onClick={() => setEditingMetaId(null)}>
                                    取消
                                  </button>
                                  <button type="button" className="btn danger sm" onClick={() => handleDelete(a.accountId, a.name)} disabled={deleteAccount.isPending} style={{ marginLeft: "auto" }}>
                                    {deleteAccount.isPending ? "刪除中…" : "刪除"}
                                  </button>
                                </div>
                              </form>
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
        )}
      </div>

      {error && (
        <>
          <style>{`
            @keyframes toast-in {
              from { transform: translate(-50%, -20px); opacity: 0; }
              to { transform: translate(-50%, 0); opacity: 1; }
            }
          `}</style>
          <div
            style={{
              position: "fixed",
              top: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(224, 86, 86, 0.95)",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "8px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.1)",
              fontSize: "14px",
              fontWeight: 600,
              animation: "toast-in 0.25s ease-out forwards",
            }}
          >
            <span>⚠️ {error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: "16px",
                padding: "0 0 0 10px",
                opacity: 0.8,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </>
      )}
    </>
  );
}

function PhysicalCreditCard({
  a,
  name,
  isEditingMeta,
  editingMetaId,
  editName,
  editParentId,
  editBankCode,
  editBillingDay,
  editCardNumber,
  editCardExpiry,
  editCardBrand,
  setEditingMetaId,
  setEditName,
  setEditParentId,
  setEditBankCode,
  setEditBillingDay,
  setEditCardNumber,
  setEditCardExpiry,
  setEditCardBrand,
  setBalanceDraft,
  balanceDraft,
  assetAccounts,
  invalidate,
  setError,
  onSave,
}: {
  a: AccountRow;
  name: string;
  isEditingMeta: boolean;
  editingMetaId: string | null;
  editName: string;
  editParentId: string;
  editBankCode: string;
  editBillingDay: string;
  editCardNumber: string;
  editCardExpiry: string;
  editCardBrand: string;
  setEditingMetaId: (id: string | null) => void;
  setEditName: (v: string) => void;
  setEditParentId: (v: string) => void;
  setEditBankCode: (v: string) => void;
  setEditBillingDay: (v: string) => void;
  setEditCardNumber: (v: string) => void;
  setEditCardExpiry: (v: string) => void;
  setEditCardBrand: (v: string) => void;
  setBalanceDraft: (v: string) => void;
  balanceDraft: string;
  assetAccounts: AccountRow[];
  invalidate: () => void;
  setError: (msg: string | null) => void;
  onSave: (
    id: string,
    name: string,
    parentId: string,
    bankCode: string,
    billingDay: string,
    cardNumber: string,
    cardExpiry: string,
    cardBrand: string,
    balance?: string,
    prevBalanceMinor?: bigint
  ) => void;
}) {
  const [showRepayForm, setShowRepayForm] = useState(false);

  const formatCardNumber = (num?: string | null): string => {
    if (!num) return "•••• •••• •••• ••••";
    const cleaned = num.replace(/\s+/g, "");
    if (cleaned.length <= 4) return `•••• •••• •••• ${cleaned}`;
    return "•••• •••• •••• " + cleaned.slice(-4);
  };

  const renderCardBrandLogo = (brand?: string | null) => {
    const b = brand?.toLowerCase() || "visa";
    if (b === "visa") return <span style={{ fontStyle: "italic", fontWeight: 800, fontSize: "16px", color: "#f8fafc", fontFamily: "sans-serif" }}>VISA</span>;
    if (b === "mastercard") return <span style={{ fontWeight: 800, fontSize: "14px", color: "#eb001b", fontFamily: "sans-serif" }}>MasterCard</span>;
    if (b === "jcb") return <span style={{ fontWeight: 800, fontSize: "14px", letterSpacing: "0.5px", fontFamily: "sans-serif" }}><span style={{ color: "#005baa" }}>J</span><span style={{ color: "#e3001b" }}>C</span><span style={{ color: "#00933b" }}>B</span></span>;
    if (b === "amex") return <span style={{ fontWeight: 800, fontSize: "13px", color: "#007bc1", textShadow: "1px 1px 0 #fff", fontFamily: "sans-serif" }}>AMEX</span>;
    return <span style={{ fontWeight: 700, textTransform: "uppercase" }}>{b}</span>;
  };

  return (
    <div style={{ gridColumn: "1 / -1", padding: "16px 0", borderBottom: "1px dashed rgba(255,255,255,0.04)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
        <div className="physical-credit-card">
          <div className="card-top">
            <span className="card-bank-name">{a.name}</span>
            {renderCardBrandLogo(a.cardBrand)}
          </div>
          <div className="card-middle">
            <div className="card-chip" style={{ marginBottom: "8px" }}></div>
            <div className="card-number">
              {formatCardNumber(a.cardNumber)}
            </div>
          </div>
          <div className="card-bottom">
            <div>
              <div className="card-holder">Card Currency</div>
              <div className="card-holder-name">{a.currency} {name}</div>
            </div>
            <div className="card-meta-row">
              <div className="card-meta-item">
                <span className="card-meta-label">EXPIRY</span>
                <span className="card-meta-value">{a.cardExpiry || "---"}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: "280px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="secondary" style={{ fontSize: "14px", color: "var(--muted)", fontWeight: 500 }}>
              📅 結帳日: 每月 {a.billingDay} 日 · 繳款日: 每月 {a.repaymentDay} 日
            </span>

            <div className="row-inline">
              <button
                className="btn ghost"
                type="button"
                onClick={() => setShowRepayForm(!showRepayForm)}
                style={{ padding: "4px 8px", fontSize: "11px", whiteSpace: "nowrap" }}
              >
                {showRepayForm ? "取消" : "手動還款"}
              </button>
              <button
                className="btn ghost"
                type="button"
                title={editingMetaId === a.accountId ? "收合" : "編輯"}
                onClick={() => {
                  setEditingMetaId(editingMetaId === a.accountId ? null : a.accountId);
                  setEditName(a.name);
                  setEditParentId(a.parentId ?? "");
                  setEditBankCode(a.bankCode ?? "");
                  setEditBillingDay(a.billingDay ? String(a.billingDay) : "");
                  setEditCardNumber(a.cardNumber ?? "");
                  setEditCardExpiry(a.cardExpiry ?? "");
                  setEditCardBrand(a.cardBrand ?? "visa");
                  setBalanceDraft(toDecimalString({ amount: a.balanceMinor, currency: a.currency }));
                }}
                style={{ padding: "4px 6px", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}
              >
                {editingMetaId === a.accountId ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                )}
              </button>
              {editingMetaId !== a.accountId && (
                <Link
                  className="btn ghost"
                  href={`/transactions?account=${a.accountId}`}
                  title="明細"
                  style={{ padding: "4px 6px", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </Link>
              )}
            </div>
          </div>

          <CreditCardStatement
            accountId={a.accountId}
            currency={a.currency}
            assetAccounts={assetAccounts}
            onRepaid={invalidate}
            onError={(msg) => setError(msg)}
            showRepayForm={showRepayForm}
            setShowRepayForm={setShowRepayForm}
          />
        </div>
      </div>

      {isEditingMeta && (
        <div className="row-edit-panel" style={{ marginTop: "16px" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave(a.accountId, editName, editParentId, editBankCode, editBillingDay, editCardNumber, editCardExpiry, editCardBrand, balanceDraft, a.balanceMinor);
            }}
          >
            <div className="grid cols-3">
              <label>
                帳戶名稱
                <input required value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <label>
                銀行代碼 (可選)
                <input value={editBankCode} onChange={(e) => setEditBankCode(e.target.value)} maxLength={3} />
              </label>
              <label>
                目前餘額 ({a.currency})
                <AmountInput value={balanceDraft} onChange={setBalanceDraft} />
              </label>
            </div>
            <div className="grid cols-3" style={{ marginTop: 10 }}>
              <label>
                卡片種類
                <select value={editCardBrand} onChange={(e) => setEditCardBrand(e.target.value)}>
                  <option value="visa">VISA</option>
                  <option value="mastercard">MasterCard</option>
                  <option value="jcb">JCB</option>
                  <option value="amex">AMEX</option>
                </select>
              </label>
              <label>
                卡片末四碼或識別號
                <input placeholder="例如: 1234" value={editCardNumber} onChange={(e) => setEditCardNumber(e.target.value)} />
              </label>
              <label>
                有效期限 (MM/YY，選填)
                <input placeholder="例如: 12/28" value={editCardExpiry} onChange={(e) => setEditCardExpiry(e.target.value)} />
              </label>
            </div>
            <div className="grid cols-2" style={{ marginTop: 10 }}>
              <label>
                結帳日 (每月的幾號)
                <input type="number" min={1} max={31} value={editBillingDay} onChange={(e) => setEditBillingDay(e.target.value)} />
              </label>
              <label style={{ color: "var(--accent)", fontWeight: "600" }}>
                🔗 對應自動扣款 / 還錢銀行帳戶（還錢帳戶）
                <select value={editParentId} onChange={(e) => setEditParentId(e.target.value)}>
                  <option value="">(自動依名稱配對 / 獨立帳戶)</option>
                  {assetAccounts
                    .filter((b) => b.type === "bank")
                    .map((b) => (
                      <option key={b.accountId} value={b.accountId}>
                        🏦 {b.name} ({b.currency})
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="row-inline" style={{ marginTop: "16px" }}>
              <button className="btn sm" type="submit">儲存設定</button>
              <button type="button" className="btn ghost sm" onClick={() => setEditingMetaId(null)}>取消</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function CreditCardStatement({
  accountId,
  currency,
  assetAccounts,
  onRepaid,
  onError,
  showRepayForm,
  setShowRepayForm,
}: {
  accountId: string;
  currency: string;
  assetAccounts: AccountRow[];
  onRepaid: () => void;
  onError?: (msg: string) => void;
  showRepayForm: boolean;
  setShowRepayForm: (val: boolean) => void;
}) {
  const billing = trpc.accounts.creditCardBilling.useQuery({ accountId }, { staleTime: 30_000 });
  const repayMutation = trpc.transactions.create.useMutation({
    onSuccess: () => {
      billing.refetch();
      onRepaid();
    },
    onError: (e) => {
      onError?.(parseErrorMessage(e));
    },
  });

  const [fromAccountId, setFromAccountId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [repayDate, setRepayDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  // Accordion state: open current statement by default, or allow toggling
  const [openCycle, setOpenCycle] = useState<"current" | "unbilled" | "past" | null>("current");

  useEffect(() => {
    if (billing.data) {
      // Default to paying the current statement's due amount, or total outstanding if statement settled
      const targetMinor = billing.data.currentStatement.dueMinor > 0n
        ? billing.data.currentStatement.dueMinor
        : billing.data.currentOutstandingMinor;
      setRepayAmount(toDecimalString({ amount: targetMinor, currency }));
    }
  }, [billing.data, currency]);

  useEffect(() => {
    const defaultFrom = assetAccounts.find((a) => a.type === "bank")?.accountId || assetAccounts[0]?.accountId;
    if (defaultFrom) {
      setFromAccountId(defaultFrom);
    }
  }, [assetAccounts]);

  if (billing.isLoading) {
    return <div className="muted" style={{ fontSize: "12px", marginTop: "8px" }}>載入帳單期數與明細中…</div>;
  }
  if (!billing.data) return null;

  const {
    billingDay,
    repaymentDay,
    currentOutstandingMinor,
    installmentRemainingMinor,
    unbilled,
    currentStatement,
    pastStatements,
  } = billing.data;

  const handleRepay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromAccountId || !repayAmount) return;
    setError(null);
    repayMutation.mutate(
      {
        accountId: fromAccountId,
        type: "transfer",
        transferAccountId: accountId,
        amount: repayAmount,
        currency,
        occurredAt: new Date(repayDate),
        note: `結清信用卡帳單 (${currentStatement.statementName})`,
      },
      {
        onError: (err) => setError(err.message),
        onSuccess: () => {
          setShowRepayForm(false);
          setError(null);
        },
      },
    );
  };

  const renderTransactionRow = (t: {
    id: string;
    occurredAt: Date | string;
    note: string | null;
    categoryName: string | null;
    amountMinor: bigint;
    type: string;
  }) => {
    const dateStr = typeof t.occurredAt === "string" ? t.occurredAt.slice(0, 10) : new Date(t.occurredAt).toISOString().slice(0, 10);
    const isIncome = t.type === "income";
    return (
      <div
        key={t.id}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "7px 12px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
          fontSize: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span className="number-mono" style={{ color: "var(--muted)", fontSize: "11px", flexShrink: 0 }}>
            {dateStr}
          </span>
          <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.note || (t.type === "transfer" ? "還款轉帳" : "一般消費")}
          </span>
          {t.categoryName && (
            <span
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: "4px",
                background: "rgba(255,255,255,0.06)",
                color: "var(--muted)",
                flexShrink: 0,
              }}
            >
              {t.categoryName}
            </span>
          )}
        </div>
        <span
          className="number-mono"
          style={{
            fontWeight: 600,
            color: isIncome ? "var(--income)" : "var(--expense)",
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          {isIncome ? "+" : "−"}{fmt(t.amountMinor, currency)}
        </span>
      </div>
    );
  };

  return (
    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* 1. 核心數值摘要卡片 */}
      <div
        style={{
          padding: "12px 16px",
          background: "rgba(255,255,255,0.02)",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "12px",
        }}
      >
        <div>
          <span className="muted" style={{ fontSize: "11px", display: "block" }}>目前累計欠款</span>
          <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>
            {fmt(currentOutstandingMinor, currency)}
          </span>
        </div>
        <div>
          <span className="muted" style={{ fontSize: "11px", display: "block" }}>
            本期應繳 ({currentStatement.statementName})
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: "15px",
              color: currentStatement.dueMinor > 0n ? "var(--expense)" : "var(--income)",
            }}
          >
            {currentStatement.dueMinor > 0n ? fmt(currentStatement.dueMinor, currency) : "已全額結清 ✓"}
          </span>
        </div>
        <div>
          <span className="muted" style={{ fontSize: "11px", display: "block" }}>
            下期未結帳金額 (累積中)
          </span>
          <span style={{ fontWeight: 600, fontSize: "15px", color: "var(--text)" }}>
            {fmt(unbilled.totalMinor, currency)}
          </span>
        </div>
        <div>
          <span className="muted" style={{ fontSize: "11px", display: "block" }}>分期剩餘未到期</span>
          <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--muted)" }}>
            {fmt(installmentRemainingMinor, currency)}
          </span>
        </div>
      </div>

      {/* 2. 本期已出帳帳單 (Current Statement) */}
      <div
        style={{
          border: `1px solid ${currentStatement.dueMinor > 0n ? "rgba(255, 107, 107, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
          borderRadius: "8px",
          background: currentStatement.dueMinor > 0n ? "rgba(255, 107, 107, 0.03)" : "rgba(255, 255, 255, 0.01)",
          overflow: "hidden",
        }}
      >
        <div
          onClick={() => setOpenCycle(openCycle === "current" ? null : "current")}
          style={{
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
              📑 {currentStatement.statementName}
            </span>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              ({currentStatement.cycleStart} ~ {currentStatement.cycleEnd})
            </span>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "12px",
                fontWeight: 600,
                background: currentStatement.dueMinor > 0n ? "rgba(255, 107, 107, 0.2)" : "rgba(53, 196, 141, 0.2)",
                color: currentStatement.dueMinor > 0n ? "var(--expense)" : "var(--income)",
              }}
            >
              {currentStatement.dueMinor > 0n ? `待繳 ${fmt(currentStatement.dueMinor, currency)} · 截止日 ${currentStatement.dueDate}` : "已結清 ✓"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              {currentStatement.transactions.length} 筆
            </span>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              {openCycle === "current" ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {openCycle === "current" && (
          <div>
            {currentStatement.transactions.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                本期帳單週期內無刷卡紀錄
              </div>
            ) : (
              <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                {currentStatement.transactions.map(renderTransactionRow)}
              </div>
            )}

            <div
              style={{
                padding: "10px 14px",
                background: "rgba(0,0,0,0.2)",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                本期消費總計: <strong style={{ color: "var(--text)" }}>{fmt(currentStatement.totalMinor, currency)}</strong>
              </span>
              {currentStatement.dueMinor > 0n && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setRepayAmount(toDecimalString({ amount: currentStatement.dueMinor, currency }));
                    setShowRepayForm(true);
                  }}
                  style={{
                    padding: "5px 12px",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "var(--income)",
                    color: "#000",
                  }}
                >
                  🏦 立即繳清本期帳單 ({fmt(currentStatement.dueMinor, currency)})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. 下期未結帳金額 (Unbilled) */}
      <div
        style={{
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "8px",
          background: "rgba(255, 255, 255, 0.01)",
          overflow: "hidden",
        }}
      >
        <div
          onClick={() => setOpenCycle(openCycle === "unbilled" ? null : "unbilled")}
          style={{
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
              ⏳ 未結帳金額 (下期帳單累積中)
            </span>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              ({unbilled.cycleStart} ~ 至今)
            </span>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.08)",
                color: "var(--muted-fg)",
              }}
            >
              累積 {fmt(unbilled.totalMinor, currency)} · 每月 {billingDay} 號結帳
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              {unbilled.transactions.length} 筆
            </span>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              {openCycle === "unbilled" ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {openCycle === "unbilled" && (
          <div>
            {unbilled.transactions.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                目前尚無未結帳刷卡消費
              </div>
            ) : (
              <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                {unbilled.transactions.map(renderTransactionRow)}
              </div>
            )}

            <div
              style={{
                padding: "8px 14px",
                background: "rgba(0,0,0,0.2)",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                本期累積未結帳: <strong style={{ color: "var(--text)" }}>{fmt(unbilled.totalMinor, currency)}</strong>
              </span>
              <Link
                href={`/transactions?account=${accountId}`}
                className="btn ghost"
                style={{ padding: "4px 10px", fontSize: "11px" }}
              >
                ＋ 查看所有刷卡交易
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 4. 歷史帳單 (Past Statements) */}
      {pastStatements.length > 0 && (
        <div
          style={{
            border: "1px solid rgba(255, 255, 255, 0.05)",
            borderRadius: "8px",
            background: "rgba(255, 255, 255, 0.01)",
            overflow: "hidden",
          }}
        >
          <div
            onClick={() => setOpenCycle(openCycle === "past" ? null : "past")}
            style={{
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>
                📁 歷史帳單存檔
              </span>
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                ({pastStatements.length} 期)
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              {openCycle === "past" ? "▲" : "▼"}
            </span>
          </div>

          {openCycle === "past" && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              {pastStatements.map((past, pIdx) => (
                <div key={pIdx} style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <strong style={{ fontSize: "13px" }}>{past.statementName} ({past.cycleStart} ~ {past.cycleEnd})</strong>
                    <span className="number-mono" style={{ fontWeight: 600 }}>{fmt(past.totalMinor, currency)}</span>
                  </div>
                  <div style={{ maxHeight: "160px", overflowY: "auto" }}>
                    {past.transactions.map(renderTransactionRow)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. 快速還款表單彈窗 / 展開列 */}
      {showRepayForm && (
        <form
          onSubmit={handleRepay}
          style={{
            marginTop: "6px",
            padding: "14px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: "8px",
            border: "1px solid var(--accent)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "10px", color: "var(--text)" }}>
            💳 結清信用卡帳單 — 填寫扣款來源
          </div>
          <div className="grid cols-3" style={{ gap: "10px" }}>
            <label style={{ fontSize: "11px" }}>
              付款帳戶 (扣款銀行)
              <select
                style={{ fontSize: "12px", padding: "6px 8px" }}
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                required
              >
                {assetAccounts
                  .filter((a) => ["bank", "cash", "wallet"].includes(a.type))
                  .map((a) => (
                    <option key={a.accountId} value={a.accountId}>
                      🏦 {a.name} ({fmt(a.balanceMinor, a.currency)})
                    </option>
                  ))}
              </select>
            </label>
            <label style={{ fontSize: "11px" }}>
              還款金額 ({currency})
              <AmountInput
                style={{ fontSize: "12px", padding: "6px 8px" }}
                required
                value={repayAmount}
                onChange={setRepayAmount}
              />
            </label>
            <label style={{ fontSize: "11px" }}>
              還款扣款日期
              <input
                style={{ fontSize: "12px", padding: "6px 8px" }}
                type="date"
                value={repayDate}
                onChange={(e) => setRepayDate(e.target.value)}
                required
              />
            </label>
          </div>
          {error && <div className="error" style={{ fontSize: "11px", marginTop: "6px" }}>{error}</div>}
          <div style={{ display: "flex", gap: "10px", marginTop: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "5px 12px", fontSize: "12px" }}
              onClick={() => setShowRepayForm(false)}
            >
              取消
            </button>
            <button
              className="btn"
              style={{
                padding: "5px 16px",
                fontSize: "12px",
                fontWeight: 700,
                background: "var(--income)",
                color: "#000",
              }}
              type="submit"
              disabled={repayMutation.isPending}
            >
              {repayMutation.isPending ? "還款處理中…" : "確認扣款結清"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
