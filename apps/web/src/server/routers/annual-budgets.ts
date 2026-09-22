import {
  annualBudgets,
  taxEstimates,
  transactions,
  categories,
  accounts,
  recurringRules,
  payrollProfiles,
  payrollLines,
  installmentSchedules,
  loanPaymentSchedules,
  loanPaymentTiers,
  loanRateAdjustments,
  forecastSettings,
  attachments,
  type Database,
} from "@acc/db";
import { TRPCError } from "@trpc/server";
import { and, or, like, eq, asc, desc, gte, lt, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { fromDecimal } from "@acc/money";
import {
  sumPayrollLines,
  getAccountBalances,
  calculateTaiwanTax,
  calculateBudgetAllocations,
  calculateLoanPeriodPayment,
  prorateTransactionByPeriod,
  type BudgetAllocationItem,
} from "@acc/core";

export { calculateTaiwanTax, prorateTransactionByPeriod } from "@acc/core";

/**
 * Pure helper to compute annual budget allocations by loading DB records and
 * delegating amortization calculation to @acc/core.
 */
export interface SafeToSpendSummary {
  totalAnnualBudgetMinor: string;
  pastSpentMinor: string;
  futureFixedMinor: string;
  safeToSpendMinor: string;
  remainingMonths: number;
  monthlySafeToSpendMinor: string;
}

export interface MajorCategoryEnvelopeData {
  key: string;
  name: string;
  label: string;
  icon: string;
  desc: string;
  annualBudgetMinor: string;
  pastSpentMinor: string;
  futureFixedMinor: string;
  safeToSpendMinor: string;
  monthlySafeToSpendMinor: string;
  itemsCount: number;
  fixedItemsCount: number;
  rollingItemsCount: number;
}

export async function computeAnnualBudgetList(
  db: Database,
  userId: string,
  targetYear: number
): Promise<{
  year: number;
  currentMonthIdx: number;
  items: BudgetAllocationItem[];
  safeToSpendSummary: SafeToSpendSummary;
  majorCategoryEnvelopes: MajorCategoryEnvelopeData[];
}> {
  const now = new Date();
  const isCurrentYear = targetYear === now.getFullYear();
  const currentMonthIdx = isCurrentYear
    ? now.getMonth() + 1
    : targetYear < now.getFullYear()
    ? 13
    : 1;

  // 1. Fetch user accounts and all annual budgets
  const allAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));
  const accMap = new Map(allAccounts.map((a) => [a.id, a]));

  const budgetRows = await db
    .select({
      id: annualBudgets.id,
      year: annualBudgets.year,
      name: annualBudgets.name,
      icon: annualBudgets.icon,
      annualAmountMinor: annualBudgets.annualAmountMinor,
      allocationType: annualBudgets.allocationType,
      targetMonths: annualBudgets.targetMonths,
      accountId: annualBudgets.accountId,
      accountName: accounts.name,
      accountType: accounts.type,
      accountCurrency: accounts.currency,
      categoryId: annualBudgets.categoryId,
      categoryName: categories.name,
      matchPattern: annualBudgets.matchPattern,
      note: annualBudgets.note,
      sortOrder: annualBudgets.sortOrder,
      createdAt: annualBudgets.createdAt,
    })
    .from(annualBudgets)
    .leftJoin(categories, eq(annualBudgets.categoryId, categories.id))
    .leftJoin(accounts, eq(annualBudgets.accountId, accounts.id))
    .where(and(eq(annualBudgets.userId, userId), eq(annualBudgets.year, targetYear)))
    .orderBy(asc(annualBudgets.sortOrder), asc(annualBudgets.createdAt));

  // 2. Fetch all expense transactions for this year (aligned to Taiwan UTC+8: 2026-01-01 00:00:00 = 2025-12-31 16:00:00 UTC)
  // Also include credit transactions whose statementMonth belongs to this year
  const startOfYear = new Date(Date.UTC(targetYear - 1, 11, 31, 16, 0, 0));
  const endOfYear = new Date(Date.UTC(targetYear, 11, 31, 16, 0, 0));

  const yearTxs = await db
    .select({
      id: transactions.id,
      amountMinor: transactions.amountMinor,
      occurredAt: transactions.occurredAt,
      note: transactions.note,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      statementMonth: transactions.statementMonth,
      isPaid: transactions.isPaid,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        or(
          and(gte(transactions.occurredAt, startOfYear), lt(transactions.occurredAt, endOfYear)),
          like(transactions.statementMonth, `${targetYear}-%`)
        )
      )
    );

  const allCats = await db.select().from(categories).where(eq(categories.userId, userId));
  const catMap = new Map(allCats.map((c) => [c.id, c]));

  // 3. For each budget item, build actual spending map and calculate allocations
  const items: BudgetAllocationItem[] = budgetRows.map((budget) => {
    const cat = budget.categoryId ? catMap.get(budget.categoryId) : null;
    let rootCat = cat;
    const visited = new Set<string>();
    while (rootCat?.parentId) {
      if (visited.has(rootCat.parentId)) break;
      visited.add(rootCat.parentId);
      const p = catMap.get(rootCat.parentId);
      if (!p) break;
      rootCat = p;
    }
    const parentCategoryId = rootCat ? rootCat.id : null;
    const parentCategoryName = rootCat ? rootCat.name : null;

    const rawPattern = (budget.matchPattern || "").trim().toLowerCase();
    const monthActuals = new Map<number, bigint>();
    const monthHasRecords = new Map<number, boolean>();
    const monthPaidStatus = new Map<number, boolean>();
    const monthTxDateNotes = new Map<number, string | null>();
    const monthTxIds = new Map<number, string | null>();

    for (let m = 1; m <= 12; m++) {
      monthActuals.set(m, 0n);
      monthHasRecords.set(m, false);
      monthPaidStatus.set(m, true);
    }

    for (const tx of yearTxs) {
      const acc = accMap.get(tx.accountId);
      const isCredit = acc?.type === "credit";
      let m: number;
      let txDateNote: string | null = null;
      const taiwanEpoch = new Date(tx.occurredAt).getTime() + 8 * 3600 * 1000;
      const occurredDate = new Date(taiwanEpoch);
      const occurredMonth = occurredDate.getUTCMonth() + 1;
      const occurredDay = occurredDate.getUTCDate();

      // Scheme 1: For credit transactions with a statementMonth in targetYear,
      // cash outflow aligns to statement billing month (statementMonth).
      if (isCredit && tx.statementMonth && tx.statementMonth.startsWith(`${targetYear}-`)) {
        m = parseInt(tx.statementMonth.slice(5), 10);
      } else {
        m = occurredMonth;
      }
      if (isCredit) {
        txDateNote = `${occurredMonth}/${occurredDay}刷卡`;
      }

      if (budget.accountId && tx.accountId !== budget.accountId) continue;

      const noteLower = (tx.note || "").toLowerCase();
      let isMatch = false;

      if (rawPattern) {
        // Support comma/pipe/slash separated keywords
        const keywords = rawPattern.split(/[,|/]/).map((k) => k.trim()).filter(Boolean);
        // Special case: "droplets" should also match "digitalocean"
        if (keywords.includes("droplets") && !keywords.includes("digitalocean")) {
          keywords.push("digitalocean");
        }
        const matchesKeyword = keywords.some((k) => noteLower.includes(k));
        if (matchesKeyword) {
          const isSameCategory = !budget.categoryId || tx.categoryId === budget.categoryId;
          const isRelatedCategory = Boolean(
            budget.categoryId &&
              tx.categoryId &&
              (catMap.get(tx.categoryId)?.parentId === budget.categoryId ||
                (catMap.get(tx.categoryId)?.parentId &&
                  catMap.get(tx.categoryId)?.parentId === catMap.get(budget.categoryId)?.parentId))
          );
          if (isSameCategory || isRelatedCategory) {
            isMatch = true;
          }
        }
      } else if (budget.allocationType === "fixed_months") {
        // Fixed expense with no pattern: match if note includes item name
        const nameLower = (budget.name || "").trim().toLowerCase();
        if (nameLower && noteLower.includes(nameLower)) {
          const isSameCategory = !budget.categoryId || tx.categoryId === budget.categoryId;
          const isRelatedCategory = Boolean(
            budget.categoryId &&
              tx.categoryId &&
              (catMap.get(tx.categoryId)?.parentId === budget.categoryId ||
                (catMap.get(tx.categoryId)?.parentId &&
                  catMap.get(tx.categoryId)?.parentId === catMap.get(budget.categoryId)?.parentId))
          );
          if (isSameCategory || isRelatedCategory) {
            isMatch = true;
          }
        }
      } else if (budget.allocationType === "rolling") {
        // Rolling budget envelope: all expenses in this category roll in
        if (budget.categoryId && tx.categoryId === budget.categoryId) {
          isMatch = true;
        }
      }

      if (isMatch) {
        // Check for billing cycle period tag [計費區間: 2026-06-30 ~ 2026-09-03]
        const periodMatch = (tx.note || "").match(
          /\[(?:計費區間|期間|計費週期|週期):\s*(\d{4}-\d{2}-\d{2})\s*[~至-]\s*(\d{4}-\d{2}-\d{2})\s*\]/
        );
        if (periodMatch && periodMatch[1] && periodMatch[2]) {
          const proratedMap = prorateTransactionByPeriod(
            tx.amountMinor,
            periodMatch[1],
            periodMatch[2],
            targetYear
          );
          if (proratedMap.size > 0) {
            for (const [monthNum, amount] of proratedMap.entries()) {
              monthActuals.set(monthNum, (monthActuals.get(monthNum) ?? 0n) + amount);
              monthHasRecords.set(monthNum, true);
              if (isCredit && !tx.isPaid) {
                monthPaidStatus.set(monthNum, false);
              }
              if (txDateNote) {
                monthTxDateNotes.set(monthNum, txDateNote);
              }
              monthTxIds.set(monthNum, tx.id);
            }
          } else {
            monthActuals.set(m, (monthActuals.get(m) ?? 0n) + tx.amountMinor);
            monthHasRecords.set(m, true);
            if (isCredit && !tx.isPaid) {
              monthPaidStatus.set(m, false);
            }
            if (txDateNote) {
              monthTxDateNotes.set(m, txDateNote);
            }
            monthTxIds.set(m, tx.id);
          }
        } else {
          monthActuals.set(m, (monthActuals.get(m) ?? 0n) + tx.amountMinor);
          monthHasRecords.set(m, true);
          if (isCredit && !tx.isPaid) {
            monthPaidStatus.set(m, false);
          }
          if (txDateNote) {
            monthTxDateNotes.set(m, txDateNote);
          }
          monthTxIds.set(m, tx.id);
        }
      }
    }

    const alloc = calculateBudgetAllocations({
      targetYear,
      currentMonthIdx,
      annualAmountMinor: budget.annualAmountMinor,
      allocationType: budget.allocationType === "fixed_months" ? "fixed_months" : "rolling",
      targetMonthsStr: budget.targetMonths,
      monthActuals,
      monthHasRecords,
      monthPaidStatus,
      monthTxDateNotes,
      monthTxIds,
    });

    return {
      ...budget,
      parentCategoryId,
      parentCategoryName,
      allocationType: budget.allocationType === "fixed_months" ? "fixed_months" : "rolling",
      ...alloc,
    };
  });

  // 3.5. Automatically calculate and sync active loan payment schedules (房貸自動同步)
  const activeLoanSchedules = await db
    .select()
    .from(loanPaymentSchedules)
    .where(and(eq(loanPaymentSchedules.userId, userId), eq(loanPaymentSchedules.active, true)))
    .orderBy(asc(loanPaymentSchedules.createdAt));

  if (activeLoanSchedules.length > 0) {
    const scheduleIds = activeLoanSchedules.map((s) => s.id);

    const loanTiers = await db
      .select()
      .from(loanPaymentTiers)
      .where(inArray(loanPaymentTiers.scheduleId, scheduleIds))
      .orderBy(asc(loanPaymentTiers.fromPeriod));
    const tiersBySchedule = new Map<string, typeof loanTiers>();
    for (const t of loanTiers) {
      const list = tiersBySchedule.get(t.scheduleId);
      if (list) list.push(t);
      else tiersBySchedule.set(t.scheduleId, [t]);
    }

    const loanAdjustments = await db
      .select()
      .from(loanRateAdjustments)
      .where(inArray(loanRateAdjustments.scheduleId, scheduleIds))
      .orderBy(asc(loanRateAdjustments.fromPeriod));
    const adjustmentsBySchedule = new Map<string, typeof loanAdjustments>();
    for (const a of loanAdjustments) {
      const list = adjustmentsBySchedule.get(a.scheduleId);
      if (list) list.push(a);
      else adjustmentsBySchedule.set(a.scheduleId, [a]);
    }

    const [forecastSetting] = await db
      .select({ loanBaseRate: forecastSettings.loanBaseRate })
      .from(forecastSettings)
      .where(eq(forecastSettings.userId, userId))
      .limit(1);
    const baseRate = forecastSetting?.loanBaseRate ?? "1.85";

    // Find "房租房貸" or "住" category
    let housingSubCat = allCats.find((c) => c.name.includes("房貸") || c.name.includes("房租"));
    let housingParentCat = allCats.find((c) => !c.parentId && c.name.includes("住"));
    if (!housingSubCat && housingParentCat) {
      housingSubCat = allCats.find((c) => c.parentId === housingParentCat!.id);
    }
    const housingCatId = housingSubCat?.id ?? housingParentCat?.id ?? null;
    const housingCatName = housingSubCat?.name ?? "房租房貸";
    const housingParentId = housingParentCat?.id ?? null;
    const housingParentName = housingParentCat?.name ?? "住";

    for (const s of activeLoanSchedules) {
      // If a budget item with this loan's name is already manually configured, don't duplicate
      const alreadyHasManual = budgetRows.some(
        (b) => b.name.trim().toLowerCase() === s.name.trim().toLowerCase()
      );
      if (alreadyHasManual) continue;

      const tiers = tiersBySchedule.get(s.id) ?? [];
      const adjustments = adjustmentsBySchedule.get(s.id) ?? [];
      const liabAcc = accMap.get(s.liabilityAccountId);
      const sourceAcc = accMap.get(s.sourceAccountId);
      const initialPrincipalMinor = liabAcc?.openingBalanceMinor ?? s.amountMinor;

      // Calculate monthly payments across all 12 months for targetYear
      const monthAllocMap = new Map<number, bigint>();
      let annualLoanAmountMinor = 0n;
      let lastIsGrace = false;

      for (let m = 1; m <= 12; m++) {
        const paymentRes = calculateLoanPeriodPayment({
          amortizationMethod: s.amortizationMethod,
          amountMinor: s.amountMinor,
          rateMargin: s.rateMargin,
          totalPeriods: s.totalPeriods,
          completedPeriods: s.completedPeriods,
          nextRunDate: s.nextRunDate,
          tiers,
          adjustments,
          initialPrincipalMinor,
          baseRate,
          targetYear,
          month: m,
        });
        monthAllocMap.set(m, paymentRes.amountMinor);
        annualLoanAmountMinor += paymentRes.amountMinor;
        lastIsGrace = paymentRes.isGrace;
      }

      // Match actual debit transactions in targetYear
      const sNameLower = s.name.toLowerCase();
      const loanKeywords = [sNameLower, "房貸"];
      if (sNameLower.includes("新青安")) loanKeywords.push("新青安");
      if (sNameLower.includes("華南")) loanKeywords.push("華南房貸", "華南");

      const monthActuals = new Map<number, bigint>();
      const monthHasRecords = new Map<number, boolean>();
      const monthPaidStatus = new Map<number, boolean>();
      const monthTxDateNotes = new Map<number, string | null>();
      const monthTxIds = new Map<number, string | null>();

      for (let m = 1; m <= 12; m++) {
        monthActuals.set(m, 0n);
        monthHasRecords.set(m, false);
        monthPaidStatus.set(m, true);
      }

      for (const tx of yearTxs) {
        if (s.sourceAccountId && tx.accountId !== s.sourceAccountId) continue;

        const noteLower = (tx.note || "").toLowerCase();
        const matchesKeyword = loanKeywords.some((k) => noteLower.includes(k));
        const matchesCategory = housingCatId && tx.categoryId === housingCatId;

        if (matchesKeyword || matchesCategory) {
          const d = new Date(new Date(tx.occurredAt).getTime() + 8 * 3600 * 1000);
          const m = d.getUTCMonth() + 1;
          monthActuals.set(m, (monthActuals.get(m) ?? 0n) + tx.amountMinor);
          monthHasRecords.set(m, true);
          monthTxIds.set(m, tx.id);
        }
      }

      const alloc = calculateBudgetAllocations({
        targetYear,
        currentMonthIdx,
        annualAmountMinor: annualLoanAmountMinor,
        allocationType: "fixed_months",
        targetMonthsStr: "1,2,3,4,5,6,7,8,9,10,11,12",
        monthActuals,
        monthHasRecords,
        monthPaidStatus,
        monthTxDateNotes,
        monthTxIds,
        monthAllocationsMap: monthAllocMap,
      });

      const autoItem: BudgetAllocationItem = {
        id: `loan-${s.id}`,
        year: targetYear,
        name: s.name,
        icon: "🏠",
        annualAmountMinor: annualLoanAmountMinor,
        allocationType: "fixed_months",
        targetMonths: "1,2,3,4,5,6,7,8,9,10,11,12",
        accountId: s.sourceAccountId,
        accountName: sourceAcc?.name ?? "銀行帳戶",
        accountType: sourceAcc?.type ?? "bank",
        accountCurrency: s.currency,
        categoryId: housingCatId,
        categoryName: housingCatName,
        parentCategoryId: housingParentId,
        parentCategoryName: housingParentName,
        matchPattern: loanKeywords.join(", "),
        note: s.note || (lastIsGrace ? "寬限期純繳息（貸款排程自動同步）" : "本息平均攤還（貸款排程自動同步）"),
        sortOrder: -100,
        isAutoLoan: true,
        ...alloc,
      };

      items.push(autoItem);
    }

    items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  // 4. Compute Safe-to-Spend & 6 Major Category Envelopes (食、衣、住、行、育、樂)
  const remainingMonths = Math.max(1, 12 - currentMonthIdx + 1);

  let totalAnnualBudgetMinor = 0n;
  let pastSpentMinor = 0n;
  let futureFixedMinor = 0n;

  for (const item of items) {
    totalAnnualBudgetMinor += item.annualAmountMinor;
    pastSpentMinor += item.spentAmountMinor;
    for (const m of item.months) {
      if (m.month >= currentMonthIdx && item.allocationType === "fixed_months") {
        futureFixedMinor += m.allocatedMinor;
      }
    }
  }

  const totalCommitted = pastSpentMinor + futureFixedMinor;
  const safeToSpendMinor = totalAnnualBudgetMinor > totalCommitted ? totalAnnualBudgetMinor - totalCommitted : 0n;
  const monthlySafeToSpendMinor = safeToSpendMinor / BigInt(remainingMonths);

  const MAJOR_PILLARS = [
    { key: "food", name: "食", label: "食", icon: "🍱", desc: "三餐外食、食材、飲料、零食、柴米油鹽" },
    { key: "clothing", name: "衣", label: "衣", icon: "👕", desc: "服飾、鞋包、配件、日常用品、美妝" },
    { key: "housing", name: "住", label: "住", icon: "🏠", desc: "房租房貸、水電瓦斯、管理費、修繕" },
    { key: "transport", name: "行", label: "行", icon: "🚗", desc: "捷運公車大眾運輸、高鐵、油錢、停車、eTag" },
    { key: "education", name: "育", label: "育", icon: "📚", desc: "書籍雜誌、進修課程、學費、學習用品" },
    { key: "recreation", name: "樂", label: "樂", icon: "🎮", desc: "聚餐交際、電影遊戲、旅遊、數位訂閱、保險醫療" },
    { key: "other", name: "其他", label: "其他", icon: "📦", desc: "所得稅、綜合所得稅、規費與其他各項開銷" },
  ];

  const majorCategoryEnvelopes = MAJOR_PILLARS.map((m) => {
    const matchedItems = items.filter((item) => {
      const pName = item.parentCategoryName || "";
      const cName = item.categoryName || "";
      return pName.includes(m.name) || cName.includes(m.name);
    });

    let catAnnualBudgetMinor = 0n;
    let catPastSpentMinor = 0n;
    let catFutureFixedMinor = 0n;
    let fixedItemsCount = 0;
    let rollingItemsCount = 0;

    for (const item of matchedItems) {
      catAnnualBudgetMinor += item.annualAmountMinor;
      catPastSpentMinor += item.spentAmountMinor;
      if (item.allocationType === "fixed_months") fixedItemsCount++;
      else rollingItemsCount++;

      for (const mon of item.months) {
        if (mon.month >= currentMonthIdx && item.allocationType === "fixed_months") {
          catFutureFixedMinor += mon.allocatedMinor;
        }
      }
    }

    const catCommitted = catPastSpentMinor + catFutureFixedMinor;
    const catSafeToSpendMinor = catAnnualBudgetMinor > catCommitted ? catAnnualBudgetMinor - catCommitted : 0n;
    const catMonthlySafeToSpendMinor = catSafeToSpendMinor / BigInt(remainingMonths);

    return {
      key: m.key,
      name: m.name,
      label: m.label,
      icon: m.icon,
      desc: m.desc,
      annualBudgetMinor: String(catAnnualBudgetMinor),
      pastSpentMinor: String(catPastSpentMinor),
      futureFixedMinor: String(catFutureFixedMinor),
      safeToSpendMinor: String(catSafeToSpendMinor),
      monthlySafeToSpendMinor: String(catMonthlySafeToSpendMinor),
      itemsCount: matchedItems.length,
      fixedItemsCount,
      rollingItemsCount,
    };
  });

  return {
    year: targetYear,
    currentMonthIdx,
    items,
    safeToSpendSummary: {
      totalAnnualBudgetMinor: String(totalAnnualBudgetMinor),
      pastSpentMinor: String(pastSpentMinor),
      futureFixedMinor: String(futureFixedMinor),
      safeToSpendMinor: String(safeToSpendMinor),
      remainingMonths,
      monthlySafeToSpendMinor: String(monthlySafeToSpendMinor),
    },
    majorCategoryEnvelopes,
  };
}

/**
 * Pure helper to retrieve or synthesize tax estimation data for a given year.
 */
export async function getTaxEstimateData(db: Database, userId: string, year: number) {
  const [existing] = await db
    .select()
    .from(taxEstimates)
    .where(and(eq(taxEstimates.userId, userId), eq(taxEstimates.year, year)))
    .limit(1);

  if (existing) {
    const calc = calculateTaiwanTax({
      grossIncomeMinor: existing.grossIncomeMinor,
      bonusIncomeMinor: existing.bonusIncomeMinor,
      stockGsuIncomeMinor: existing.stockGsuIncomeMinor,
      otherIncomeMinor: existing.otherIncomeMinor,
      dependentsCount: existing.dependentsCount,
      marriedFilingJointly: existing.marriedFilingJointly,
      youngChildrenCount: existing.youngChildrenCount,
      withheldTaxMinor: existing.withheldTaxMinor,
      installmentCount: existing.installmentCount,
      installmentStartMonth: existing.installmentStartMonth,
    });

    return {
      ...existing,
      ...calc,
    };
  }

  // Default calculation baseline for user ($190,000 monthly salary, $342,000 bonus, $924,000 GSU)
  const defaultCalc = calculateTaiwanTax({
    grossIncomeMinor: 228_000_000n,
    bonusIncomeMinor: 34_200_000n,
    stockGsuIncomeMinor: 92_400_000n,
    otherIncomeMinor: 0n,
    dependentsCount: 4,
    marriedFilingJointly: true,
    youngChildrenCount: 1,
    withheldTaxMinor: 31_590_000n,
    installmentCount: 3,
    installmentStartMonth: 5,
  });

  return {
    id: null,
    userId,
    year,
    grossIncomeMinor: 228_000_000n,
    bonusIncomeMinor: 34_200_000n,
    stockGsuIncomeMinor: 92_400_000n,
    otherIncomeMinor: 0n,
    dependentsCount: 4,
    marriedFilingJointly: true,
    youngChildrenCount: 1,
    withheldTaxMinor: 31_590_000n,
    installmentCount: 3,
    installmentStartMonth: 5,
    accountId: null,
    updatedAt: new Date(),
    ...defaultCalc,
  };
}

export const annualBudgetsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          year: z.number().int().min(2020).max(2050).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const targetYear = input?.year ?? new Date().getFullYear();
      return computeAnnualBudgetList(ctx.db, ctx.user.id, targetYear);
    }),

  cashflowProjection: protectedProcedure
    .input(
      z
        .object({
          year: z.number().int().min(2020).max(2050).optional(),
          accountId: z.string().uuid().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const targetYear = input?.year ?? new Date().getFullYear();
      const now = new Date();
      const isCurrentYear = targetYear === now.getFullYear();
      const currentMonthIdx = isCurrentYear
        ? now.getMonth() + 1
        : targetYear < now.getFullYear()
        ? 13
        : 1;

      // 1. Fetch user accounts with real-time balances
      const balances = await getAccountBalances(ctx.db, ctx.user.id);
      const userAccounts = balances.map((b) => ({
        id: b.accountId,
        name: b.name,
        type: b.type,
        currency: b.currency,
        balanceMinor: b.balanceMinor,
      }));

      const targetAccounts = input?.accountId
        ? userAccounts.filter((a) => a.id === input.accountId)
        : userAccounts.filter((a) => a.type === "bank" || a.type === "cash" || a.type === "wallet");

      // 2. Fetch active recurring rules
      const recurrings = await ctx.db
        .select()
        .from(recurringRules)
        .where(and(eq(recurringRules.userId, ctx.user.id), eq(recurringRules.active, true)));

      // 3. Fetch active payroll profiles & lines in a single batch (no N+1 queries)
      const payrolls = await ctx.db
        .select()
        .from(payrollProfiles)
        .where(and(eq(payrollProfiles.userId, ctx.user.id), eq(payrollProfiles.active, true)));

      const profileIds = payrolls.map((p) => p.id);
      const allPayrollLines =
        profileIds.length > 0
          ? await ctx.db
              .select()
              .from(payrollLines)
              .where(inArray(payrollLines.profileId, profileIds))
          : [];

      const linesByProfile = new Map<string, typeof allPayrollLines>();
      for (const line of allPayrollLines) {
        if (!linesByProfile.has(line.profileId)) {
          linesByProfile.set(line.profileId, []);
        }
        linesByProfile.get(line.profileId)!.push(line);
      }

      const payrollMap = new Map<string, bigint>();
      for (const p of payrolls) {
        const lines = linesByProfile.get(p.id) ?? [];
        const netSalary = sumPayrollLines(lines).netMinor;
        payrollMap.set(p.depositAccountId, (payrollMap.get(p.depositAccountId) ?? 0n) + netSalary);
      }

      // 4. Fetch installment schedules
      const installments = await ctx.db
        .select()
        .from(installmentSchedules)
        .where(and(eq(installmentSchedules.userId, ctx.user.id), eq(installmentSchedules.active, true)));

      // 5. Fetch all annual budgets
      const budgetListResult = await computeAnnualBudgetList(ctx.db, ctx.user.id, targetYear);
      const budgetItems = budgetListResult.items;

      // Account -> Map<month, bigint>
      const accountBudgetMonthlyMap = new Map<string, Map<number, bigint>>();
      for (const acc of targetAccounts) {
        const mmap = new Map<number, bigint>();
        for (let m = 1; m <= 12; m++) mmap.set(m, 0n);
        accountBudgetMonthlyMap.set(acc.id, mmap);
      }

      const defaultAccount =
        targetAccounts.find((a) => a.type === "bank") || targetAccounts[0];

      for (const b of budgetItems) {
        const accId = b.accountId || (input?.accountId ? null : defaultAccount?.id);
        if (!accId || !accountBudgetMonthlyMap.has(accId)) continue;
        const mmap = accountBudgetMonthlyMap.get(accId)!;

        for (const mObj of b.months) {
          if (mObj.month >= currentMonthIdx) {
            mmap.set(mObj.month, (mmap.get(mObj.month) ?? 0n) + mObj.effectiveMinor);
          }
        }
      }

      // 6. Build projections for months from currentMonthIdx to 12
      const runningBalance = new Map<string, bigint>();
      for (const a of targetAccounts) {
        runningBalance.set(a.id, a.balanceMinor);
      }

      const startMonth = Math.max(1, Math.min(currentMonthIdx, 12));
      const forecastMonths = [];

      for (let m = startMonth; m <= 12; m++) {
        const monthKey = `${targetYear}-${String(m).padStart(2, "0")}`;
        let totalMonthInflow = 0n;
        let totalMonthFixedOutflow = 0n;
        let totalMonthBudgetOutflow = 0n;

        const accBreakdowns = targetAccounts.map((acc) => {
          const startingBal = runningBalance.get(acc.id) ?? 0n;

          let accInflow = payrollMap.get(acc.id) ?? 0n;
          for (const r of recurrings) {
            if (r.kind === "income" && r.accountId === acc.id) {
              accInflow += r.amountMinor;
            }
          }

          let accFixedOutflow = 0n;
          for (const r of recurrings) {
            if (r.kind === "expense" && r.accountId === acc.id) {
              accFixedOutflow += r.amountMinor;
            }
          }
          for (const inst of installments) {
            if (inst.accountId === acc.id) {
              accFixedOutflow += inst.amountMinor;
            }
          }

          const accBudgetOutflow = accountBudgetMonthlyMap.get(acc.id)?.get(m) ?? 0n;
          const accNet = accInflow - (accFixedOutflow + accBudgetOutflow);
          const endBal = startingBal + accNet;
          runningBalance.set(acc.id, endBal);

          totalMonthInflow += accInflow;
          totalMonthFixedOutflow += accFixedOutflow;
          totalMonthBudgetOutflow += accBudgetOutflow;

          return {
            accountId: acc.id,
            accountName: acc.name,
            startingBalanceMinor: startingBal,
            inflowMinor: accInflow,
            fixedOutflowMinor: accFixedOutflow,
            budgetOutflowMinor: accBudgetOutflow,
            netCashflowMinor: accNet,
            projectedBalanceMinor: endBal,
          };
        });

        const totalNet = totalMonthInflow - (totalMonthFixedOutflow + totalMonthBudgetOutflow);
        const totalEndBal = accBreakdowns.reduce(
          (sum, a) => sum + a.projectedBalanceMinor,
          0n
        );

        forecastMonths.push({
          month: m,
          monthKey,
          isCurrent: m === currentMonthIdx,
          inflowMinor: totalMonthInflow,
          fixedOutflowMinor: totalMonthFixedOutflow,
          budgetOutflowMinor: totalMonthBudgetOutflow,
          netCashflowMinor: totalNet,
          projectedBalanceMinor: totalEndBal,
          accountsBreakdown: accBreakdowns,
        });
      }

      return {
        year: targetYear,
        accounts: targetAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          currentBalanceMinor: a.balanceMinor,
        })),
        forecastMonths,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        year: z.number().int().default(2026),
        name: z.string().min(1, "請輸入項目名稱"),
        icon: z.string().optional().default("⚡"),
        annualAmount: z.string().min(1, "請輸入年度預算金額"),
        allocationType: z.enum(["rolling", "fixed_months"]).default("rolling"),
        targetMonths: z.string().optional(),
        accountId: z.string().uuid().nullable().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        matchPattern: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const annualAmountMinor = fromDecimal(input.annualAmount.trim(), "TWD").amount;

      const existing = await ctx.db
        .select({ sortOrder: annualBudgets.sortOrder })
        .from(annualBudgets)
        .where(and(eq(annualBudgets.userId, ctx.user.id), eq(annualBudgets.year, input.year)));
      const nextSort = existing.reduce((max, b) => Math.max(max, b.sortOrder), 0) + 1;

      const [created] = await ctx.db
        .insert(annualBudgets)
        .values({
          userId: ctx.user.id,
          year: input.year,
          name: input.name.trim(),
          icon: input.icon?.trim() || "⚡",
          annualAmountMinor,
          allocationType: input.allocationType,
          targetMonths: input.targetMonths?.trim() || null,
          accountId: input.accountId || null,
          categoryId: input.categoryId || null,
          matchPattern: input.matchPattern?.trim() || input.name.trim(),
          note: input.note?.trim() || null,
          sortOrder: nextSort,
        })
        .returning();

      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        year: z.number().int().optional(),
        name: z.string().min(1, "請輸入項目名稱"),
        icon: z.string().optional(),
        annualAmount: z.string().optional(),
        allocationType: z.enum(["rolling", "fixed_months"]).optional(),
        targetMonths: z.string().nullable().optional(),
        accountId: z.string().uuid().nullable().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        matchPattern: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(annualBudgets)
        .where(and(eq(annualBudgets.id, input.id), eq(annualBudgets.userId, ctx.user.id)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到年度預算項目" });

      let annualAmountMinor = existing.annualAmountMinor;
      if (input.annualAmount && input.annualAmount.trim() !== "") {
        annualAmountMinor = fromDecimal(input.annualAmount.trim(), "TWD").amount;
      }

      const [updated] = await ctx.db
        .update(annualBudgets)
        .set({
          year: input.year ?? existing.year,
          name: input.name.trim(),
          icon: input.icon !== undefined ? input.icon.trim() : existing.icon,
          annualAmountMinor,
          allocationType: input.allocationType ?? existing.allocationType,
          targetMonths: input.targetMonths !== undefined ? input.targetMonths : existing.targetMonths,
          accountId: input.accountId !== undefined ? input.accountId : existing.accountId,
          categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
          matchPattern:
            input.matchPattern !== undefined
              ? (input.matchPattern?.trim() || input.name.trim())
              : existing.matchPattern,
          note: input.note !== undefined ? input.note : existing.note,
          updatedAt: new Date(),
        })
        .where(and(eq(annualBudgets.id, input.id), eq(annualBudgets.userId, ctx.user.id)))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(annualBudgets)
        .where(and(eq(annualBudgets.id, input.id), eq(annualBudgets.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到年度預算項目" });
      return deleted;
    }),

  updateSort: protectedProcedure
    .input(z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (const item of input) {
          await tx
            .update(annualBudgets)
            .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
            .where(and(eq(annualBudgets.id, item.id), eq(annualBudgets.userId, ctx.user.id)));
        }
      });
      return { success: true };
    }),

  /**
   * Pending monthly items that need approval/confirmation for a given month.
   * Finds items scheduled for this month where actual spending is 0.
   */
  pendingMonthlyItems: protectedProcedure
    .input(
      z.object({
        year: z.number().int().default(() => new Date().getFullYear()),
        month: z.number().int().min(1).max(12).default(() => new Date().getMonth() + 1),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const targetYear = input?.year ?? now.getFullYear();
      const targetMonth = input?.month ?? (now.getMonth() + 1);

      const computed = await computeAnnualBudgetList(ctx.db, ctx.user.id, targetYear);
      const accountsList = await ctx.db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, ctx.user.id));
      const accMap = new Map(accountsList.map((a) => [a.id, a]));

      // Filter for items that have an expected amount in this targetMonth but actual is 0
      const pending = [];
      for (const item of computed.items) {
        // Auto-synced loan items are already scheduled and managed under upcoming bills (Section 1),
        // so exclude them here to prevent duplicate listing and double counting in pending budgets.
        if (item.isAutoLoan) continue;

        const monthInfo = item.months.find((m) => m.month === targetMonth);
        if (!monthInfo) continue;

        // Has an allocation or scheduled budget for this month
        const allocated = Number(monthInfo.allocatedMinor);
        const actual = Number(monthInfo.actualMinor);

        // Only include if scheduled/budgeted > 0 and no actual recorded yet
        if (allocated > 0 && actual === 0) {
          const acc = item.accountId ? accMap.get(item.accountId) : null;
          pending.push({
            budgetId: item.id,
            name: item.name,
            icon: item.icon,
            allocationType: item.allocationType,
            targetMonths: item.targetMonths,
            allocatedMinor: monthInfo.allocatedMinor,
            estimatedAmount: Math.round(allocated / 100),
            accountId: item.accountId,
            accountName: acc?.name || null,
            accountType: acc?.type || null,
            accountCurrency: acc?.currency || "TWD",
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            parentCategoryName: item.parentCategoryName,
            note: item.note,
          });
        }
      }

      return {
        year: targetYear,
        month: targetMonth,
        items: pending,
      };
    }),

  /**
   * One-click confirmation to settle an annual budget item as a real expense transaction.
   * Auto-creates the transaction with pre-bound account, category, and amount.
   */
  confirmSettlement: protectedProcedure
    .input(
      z.object({
        budgetId: z.string().uuid(),
        year: z.number().int().default(() => new Date().getFullYear()),
        month: z.number().int().min(1).max(12).default(() => new Date().getMonth() + 1),
        amount: z.string().min(1, "請輸入金額"),
        accountId: z.string().uuid().optional(),
        categoryId: z.string().uuid().optional(),
        occurredAt: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch the annual budget record
      const [budget] = await ctx.db
        .select()
        .from(annualBudgets)
        .where(and(eq(annualBudgets.id, input.budgetId), eq(annualBudgets.userId, ctx.user.id)))
        .limit(1);

      if (!budget) {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定的年度預算項目" });
      }

      // 2. Determine target account
      const targetAccountId = input.accountId || budget.accountId;
      if (!targetAccountId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "請指定扣款帳戶（可於確認時選擇，或在預算設定中綁定預設帳戶）",
        });
      }

      const [acct] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, targetAccountId), eq(accounts.userId, ctx.user.id)))
        .limit(1);

      if (!acct) {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定的扣款帳戶" });
      }

      // 3. Determine category, currency, and amount
      const targetCategoryId = input.categoryId || budget.categoryId || null;
      const currency = acct.currency.toUpperCase();
      const { amount } = fromDecimal(input.amount.trim(), currency);

      // Determine date (default to today or 1st of the target month if past/future)
      let dateObj = new Date();
      if (input.occurredAt) {
        dateObj = new Date(input.occurredAt);
      } else {
        const now = new Date();
        if (now.getFullYear() !== input.year || now.getMonth() + 1 !== input.month) {
          dateObj = new Date(input.year, input.month - 1, 15, 12, 0, 0);
        }
      }

      const txNote = input.note?.trim() || `[年度預算] ${budget.name}`;

      // 4. Insert transaction
      const [createdTx] = await ctx.db
        .insert(transactions)
        .values({
          userId: ctx.user.id,
          accountId: targetAccountId,
          categoryId: targetCategoryId,
          type: "expense",
          amountMinor: amount,
          currency,
          occurredAt: dateObj,
          note: txNote,
          source: "recurring",
        })
        .returning();

      return {
        success: true,
        transaction: createdTx,
      };
    }),

  getTaxEstimate: protectedProcedure
    .input(z.object({ year: z.number().int().default(2026) }))
    .query(async ({ ctx, input }) => {
      return getTaxEstimateData(ctx.db, ctx.user.id, input.year);
    }),

  saveTaxEstimate: protectedProcedure
    .input(
      z.object({
        year: z.number().int().default(2026),
        grossIncome: z.string(),
        bonusIncome: z.string(),
        stockGsuIncome: z.string(),
        otherIncome: z.string().optional().default("0"),
        dependentsCount: z.number().int().min(0).max(20).default(4),
        marriedFilingJointly: z.boolean().default(true),
        youngChildrenCount: z.number().int().min(0).max(10).default(1),
        withheldTax: z.string(),
        installmentCount: z.number().int().min(1).max(12).default(3),
        installmentStartMonth: z.number().int().min(1).max(12).default(5),
        accountId: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const grossIncomeMinor = fromDecimal(input.grossIncome.trim() || "0", "TWD").amount;
      const bonusIncomeMinor = fromDecimal(input.bonusIncome.trim() || "0", "TWD").amount;
      const stockGsuIncomeMinor = fromDecimal(input.stockGsuIncome.trim() || "0", "TWD").amount;
      const otherIncomeMinor = fromDecimal(input.otherIncome?.trim() || "0", "TWD").amount;
      const withheldTaxMinor = fromDecimal(input.withheldTax.trim() || "0", "TWD").amount;

      const calc = calculateTaiwanTax({
        grossIncomeMinor,
        bonusIncomeMinor,
        stockGsuIncomeMinor,
        otherIncomeMinor,
        dependentsCount: input.dependentsCount,
        marriedFilingJointly: input.marriedFilingJointly,
        youngChildrenCount: input.youngChildrenCount,
        withheldTaxMinor,
        installmentCount: input.installmentCount,
        installmentStartMonth: input.installmentStartMonth,
      });

      const [saved] = await ctx.db
        .insert(taxEstimates)
        .values({
          userId: ctx.user.id,
          year: input.year,
          grossIncomeMinor,
          bonusIncomeMinor,
          stockGsuIncomeMinor,
          otherIncomeMinor,
          dependentsCount: input.dependentsCount,
          marriedFilingJointly: input.marriedFilingJointly,
          youngChildrenCount: input.youngChildrenCount,
          withheldTaxMinor,
          calculatedTaxMinor: calc.calculatedTaxMinor,
          taxDueMinor: calc.taxDueMinor,
          installmentCount: input.installmentCount,
          installmentStartMonth: input.installmentStartMonth,
          accountId: input.accountId || null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [taxEstimates.userId, taxEstimates.year],
          set: {
            grossIncomeMinor,
            bonusIncomeMinor,
            stockGsuIncomeMinor,
            otherIncomeMinor,
            dependentsCount: input.dependentsCount,
            marriedFilingJointly: input.marriedFilingJointly,
            youngChildrenCount: input.youngChildrenCount,
            withheldTaxMinor,
            calculatedTaxMinor: calc.calculatedTaxMinor,
            taxDueMinor: calc.taxDueMinor,
            installmentCount: input.installmentCount,
            installmentStartMonth: input.installmentStartMonth,
            accountId: input.accountId || null,
            updatedAt: new Date(),
          },
        })
        .returning();

      return {
        ...saved,
        ...calc,
      };
    }),

  applyTaxToCashflow: protectedProcedure
    .input(
      z.object({
        year: z.number().int().default(2026),
        accountId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const estimate = await getTaxEstimateData(ctx.db, ctx.user.id, input.year);
      const targetAccount = input.accountId || estimate.accountId || null;
      const targetMonthsStr = estimate.installmentMonths.join(",");

      const [existing] = await ctx.db
        .select()
        .from(annualBudgets)
        .where(
          and(
            eq(annualBudgets.userId, ctx.user.id),
            eq(annualBudgets.year, input.year),
            eq(annualBudgets.name, "綜合所得稅 (分期)")
          )
        )
        .limit(1);

      if (existing) {
        const [updated] = await ctx.db
          .update(annualBudgets)
          .set({
            annualAmountMinor: estimate.taxDueMinor,
            allocationType: "fixed_months",
            targetMonths: targetMonthsStr,
            accountId: targetAccount,
            note: `${input.year}年綜合所得稅 (分${estimate.installmentCount}期申報)`,
            updatedAt: new Date(),
          })
          .where(eq(annualBudgets.id, existing.id))
          .returning();
        return updated;
      } else {
        const [created] = await ctx.db
          .insert(annualBudgets)
          .values({
            userId: ctx.user.id,
            year: input.year,
            name: "綜合所得稅 (分期)",
            icon: "⚖️",
            annualAmountMinor: estimate.taxDueMinor,
            allocationType: "fixed_months",
            targetMonths: targetMonthsStr,
            accountId: targetAccount,
            note: `${input.year}年綜合所得稅 (分${estimate.installmentCount}期申報)`,
          })
          .returning();
        return created;
      }
    }),

  getItemBills: protectedProcedure
    .input(
      z.object({
        budgetId: z.string().uuid(),
        year: z.number().int().default(2026),
      })
    )
    .query(async ({ ctx, input }) => {
      const [budget] = await ctx.db
        .select({
          id: annualBudgets.id,
          name: annualBudgets.name,
          icon: annualBudgets.icon,
          annualAmountMinor: annualBudgets.annualAmountMinor,
          allocationType: annualBudgets.allocationType,
          targetMonths: annualBudgets.targetMonths,
          accountId: annualBudgets.accountId,
          accountName: accounts.name,
          categoryId: annualBudgets.categoryId,
          categoryName: categories.name,
          matchPattern: annualBudgets.matchPattern,
        })
        .from(annualBudgets)
        .leftJoin(categories, eq(annualBudgets.categoryId, categories.id))
        .leftJoin(accounts, eq(annualBudgets.accountId, accounts.id))
        .where(and(eq(annualBudgets.id, input.budgetId), eq(annualBudgets.userId, ctx.user.id)))
        .limit(1);

      if (!budget) throw new TRPCError({ code: "NOT_FOUND", message: "找不到預算項目" });

      const startWindow = new Date(Date.UTC(input.year - 1, 10, 1, 0, 0, 0));
      const endWindow = new Date(Date.UTC(input.year + 1, 1, 1, 0, 0, 0));

      const txRows = await ctx.db
        .select({
          id: transactions.id,
          amountMinor: transactions.amountMinor,
          occurredAt: transactions.occurredAt,
          accountId: transactions.accountId,
          accountName: accounts.name,
          accountType: accounts.type,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          note: transactions.note,
        })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, ctx.user.id),
            eq(transactions.type, "expense"),
            gte(transactions.occurredAt, startWindow),
            lt(transactions.occurredAt, endWindow)
          )
        )
        .orderBy(desc(transactions.occurredAt));

      const rawPattern = (budget.matchPattern || "").trim().toLowerCase();
      const keywords = rawPattern ? rawPattern.split(/[,|/]/).map((k) => k.trim()).filter(Boolean) : [];
      if (keywords.includes("droplets") && !keywords.includes("digitalocean")) keywords.push("digitalocean");

      const matchedTxs = txRows.filter((tx) => {
        if (budget.accountId && tx.accountId !== budget.accountId) return false;
        const noteLower = (tx.note || "").toLowerCase();

        if (keywords.length > 0) {
          const hasKw = keywords.some((k) => noteLower.includes(k));
          if (hasKw && (!budget.categoryId || tx.categoryId === budget.categoryId)) return true;
        } else if (budget.allocationType === "fixed_months") {
          const nameLower = (budget.name || "").trim().toLowerCase();
          if (nameLower && noteLower.includes(nameLower)) {
            if (!budget.categoryId || tx.categoryId === budget.categoryId) return true;
          }
        } else if (budget.allocationType === "rolling") {
          if (budget.categoryId && tx.categoryId === budget.categoryId) return true;
        }
        return false;
      });

      const txIds = matchedTxs.map((t) => t.id);
      const attachmentsMap = new Map<string, { id: string; filename: string; contentType: string; sizeBytes: number }[]>();
      if (txIds.length > 0) {
        const attRows = await ctx.db
          .select({
            id: attachments.id,
            transactionId: attachments.transactionId,
            filename: attachments.filename,
            contentType: attachments.contentType,
            sizeBytes: attachments.sizeBytes,
          })
          .from(attachments)
          .where(and(eq(attachments.userId, ctx.user.id), inArray(attachments.transactionId, txIds)));

        for (const a of attRows) {
          if (!a.transactionId) continue;
          if (!attachmentsMap.has(a.transactionId)) attachmentsMap.set(a.transactionId, []);
          attachmentsMap.get(a.transactionId)!.push({
            id: a.id,
            filename: a.filename,
            contentType: a.contentType,
            sizeBytes: a.sizeBytes,
          });
        }
      }

      const coveredMonths = new Set<number>();
      let totalSpentMinor = 0n;

      const bills = matchedTxs.map((tx) => {
        totalSpentMinor += tx.amountMinor;
        const periodMatch = (tx.note || "").match(
          /\[(?:計費區間|期間|計費週期|週期):\s*(\d{4}-\d{2}-\d{2})\s*[~至-]\s*(\d{4}-\d{2}-\d{2})\s*\]/
        );

        let startDate: string | null = null;
        let endDate: string | null = null;
        let totalDays: number | null = null;
        const prorations: { month: number; days: number; amountMinor: string }[] = [];

        if (periodMatch && periodMatch[1] && periodMatch[2]) {
          startDate = periodMatch[1];
          endDate = periodMatch[2];
          const [sy, sm, sd] = startDate.split("-").map(Number);
          const [ey, em, ed] = endDate.split("-").map(Number);
          if (sy && sm && sd && ey && em && ed) {
            const sDate = new Date(Date.UTC(sy, sm - 1, sd));
            const eDate = new Date(Date.UTC(ey, em - 1, ed));
            totalDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / (86400 * 1000)) + 1);

            const prorateMap = prorateTransactionByPeriod(tx.amountMinor, startDate, endDate, input.year);
            for (const [m, amt] of prorateMap.entries()) {
              if (amt > 0n) {
                coveredMonths.add(m);
                const mStart = new Date(Date.UTC(input.year, m - 1, 1));
                const mEnd = new Date(Date.UTC(input.year, m, 0));
                const oStart = Math.max(sDate.getTime(), mStart.getTime());
                const oEnd = Math.min(eDate.getTime(), mEnd.getTime());
                const days = Math.max(0, Math.round((oEnd - oStart) / (86400 * 1000)) + 1);
                prorations.push({ month: m, days, amountMinor: String(amt) });
              }
            }
          }
        } else {
          const taiwanEpoch = new Date(tx.occurredAt).getTime() + 8 * 3600 * 1000;
          const m = new Date(taiwanEpoch).getUTCMonth() + 1;
          coveredMonths.add(m);
          prorations.push({ month: m, days: 30, amountMinor: String(tx.amountMinor) });
        }

        const cleanNote = (tx.note || "").replace(/\[(?:計費區間|期間|計費週期|週期):[^\]]+\]\s*/g, "").trim();

        return {
          id: tx.id,
          amountMinor: String(tx.amountMinor),
          occurredAt: tx.occurredAt,
          paidDate: tx.occurredAt.toISOString().split("T")[0],
          accountId: tx.accountId,
          accountName: tx.accountName,
          accountType: tx.accountType,
          categoryId: tx.categoryId,
          categoryName: tx.categoryName,
          note: cleanNote,
          rawNote: tx.note,
          startDate,
          endDate,
          totalDays,
          prorations,
          attachments: attachmentsMap.get(tx.id) ?? [],
        };
      });

      const annualMinor = budget.annualAmountMinor;
      const monthlyBaseMinor = annualMinor / 12n;
      const maxCoveredMonth = coveredMonths.size > 0 ? Math.max(...Array.from(coveredMonths)) : 0;
      const progressRatio = maxCoveredMonth > 0 ? maxCoveredMonth / 12 : 0;
      const progressBudgetMinor = (annualMinor * BigInt(maxCoveredMonth)) / 12n;
      const varianceMinor = totalSpentMinor - progressBudgetMinor;

      return {
        budget: {
          id: budget.id,
          name: budget.name,
          icon: budget.icon,
          annualAmountMinor: String(annualMinor),
          monthlyBudgetMinor: String(monthlyBaseMinor),
          accountId: budget.accountId,
          accountName: budget.accountName,
          categoryId: budget.categoryId,
          categoryName: budget.categoryName,
        },
        bills,
        summary: {
          totalBillsCount: bills.length,
          maxCoveredMonth,
          progressRatioText: maxCoveredMonth > 0 ? `${maxCoveredMonth}/12 年 (${Math.round(progressRatio * 100)}%)` : "尚未登記",
          progressBudgetMinor: String(progressBudgetMinor),
          totalSpentMinor: String(totalSpentMinor),
          varianceMinor: String(varianceMinor),
          isOverBudget: varianceMinor > 0n,
        },
      };
    }),

  saveBill: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        budgetId: z.string().uuid(),
        amount: z.string().regex(/^\d+(\.\d+)?$/, "請輸入有效金額"),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇計費起始日"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇計費結束日"),
        paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇繳款日期"),
        accountId: z.string().uuid("請選擇扣款帳戶"),
        categoryId: z.string().uuid().optional().nullable(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [budget] = await ctx.db
        .select()
        .from(annualBudgets)
        .where(and(eq(annualBudgets.id, input.budgetId), eq(annualBudgets.userId, ctx.user.id)))
        .limit(1);
      if (!budget) throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定的預算項目" });

      const amountMinor = fromDecimal(input.amount.trim(), "TWD").amount;
      const periodTag = `[計費區間: ${input.startDate} ~ ${input.endDate}]`;
      const cleanNote = (input.note || "").replace(/\[(?:計費區間|期間|計費週期|週期):[^\]]+\]\s*/g, "").trim();
      const finalNote = cleanNote ? `${periodTag} ${cleanNote}` : `${periodTag} ${budget.name}`;
      const catId = input.categoryId || budget.categoryId || null;

      if (input.id) {
        const [updated] = await ctx.db
          .update(transactions)
          .set({
            amountMinor,
            accountId: input.accountId,
            categoryId: catId,
            occurredAt: new Date(`${input.paidAt}T00:00:00`),
            note: finalNote,
          })
          .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)))
          .returning();
        return updated;
      } else {
        const [created] = await ctx.db
          .insert(transactions)
          .values({
            userId: ctx.user.id,
            accountId: input.accountId,
            categoryId: catId,
            type: "expense",
            currency: "TWD",
            amountMinor,
            occurredAt: new Date(`${input.paidAt}T00:00:00`),
            note: finalNote,
            source: "manual",
          })
          .returning();
        return created;
      }
    }),

  deleteBill: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(transactions)
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到此帳單交易" });
      return deleted;
    }),
});
