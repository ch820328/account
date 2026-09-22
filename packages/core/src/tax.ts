/**
 * Taiwan Individual Income Tax (綜合所得稅) calculation module.
 * Conforms to 2026 tax standards & brackets published by Ministry of Finance.
 */

export interface TaiwanTaxInputs {
  grossIncomeMinor: bigint;
  bonusIncomeMinor: bigint;
  stockGsuIncomeMinor: bigint;
  otherIncomeMinor: bigint;
  dependentsCount: number;
  marriedFilingJointly: boolean;
  youngChildrenCount: number;
  withheldTaxMinor: bigint;
  installmentCount: number;
  installmentStartMonth: number;
}

export interface TaiwanTaxResult {
  totalIncomeMinor: bigint;
  exemptionsMinor: bigint;
  standardDeductionMinor: bigint;
  salaryDeductionMinor: bigint;
  childDeductionMinor: bigint;
  totalDeductionsMinor: bigint;
  netTaxableIncomeMinor: bigint;
  bracketRatePercent: number;
  bracketProgressiveDifferenceMinor: bigint;
  calculatedTaxMinor: bigint;
  taxDueMinor: bigint;
  installmentAmountMinor: bigint;
  installmentMonths: number[];
}

export function calculateTaiwanTax(inputs: TaiwanTaxInputs): TaiwanTaxResult {
  const toDollars = (m: bigint) => Number(m) / 100;
  const toMinor = (d: number) => BigInt(Math.round(d * 100));

  const gross = toDollars(inputs.grossIncomeMinor);
  const bonus = toDollars(inputs.bonusIncomeMinor);
  const gsu = toDollars(inputs.stockGsuIncomeMinor);
  const other = toDollars(inputs.otherIncomeMinor);
  const totalIncome = gross + bonus + gsu + other;

  // Exemption: $97,000 per person
  const exemptions = Math.max(1, inputs.dependentsCount) * 97_000;

  // Standard deduction: Single $131,000, Married filing jointly $262,000
  const standardDeduction = inputs.marriedFilingJointly ? 262_000 : 131_000;

  // Salary deduction: up to $218,000
  const salaryDeduction = Math.min(gross + bonus, 218_000);

  // Preschool child deduction: $150,000 per child (under 6)
  const childDeduction = Math.max(0, inputs.youngChildrenCount) * 150_000;

  const totalDeductions = exemptions + standardDeduction + salaryDeduction + childDeduction;

  // Net Taxable Income
  const netTaxableIncome = Math.max(0, totalIncome - totalDeductions);

  // Progressive tax rate brackets (2026 Taiwan)
  let bracketRatePercent = 5;
  let bracketProgressiveDiff = 0;
  let calculatedTax = 0;

  if (netTaxableIncome <= 590_000) {
    bracketRatePercent = 5;
    bracketProgressiveDiff = 0;
    calculatedTax = netTaxableIncome * 0.05;
  } else if (netTaxableIncome <= 1_330_000) {
    bracketRatePercent = 12;
    bracketProgressiveDiff = 41_300;
    calculatedTax = netTaxableIncome * 0.12 - 41_300;
  } else if (netTaxableIncome <= 2_660_000) {
    bracketRatePercent = 20;
    bracketProgressiveDiff = 147_700;
    calculatedTax = netTaxableIncome * 0.20 - 147_700;
  } else if (netTaxableIncome <= 4_980_000) {
    bracketRatePercent = 30;
    bracketProgressiveDiff = 413_700;
    calculatedTax = netTaxableIncome * 0.30 - 413_700;
  } else {
    bracketRatePercent = 40;
    bracketProgressiveDiff = 911_700;
    calculatedTax = netTaxableIncome * 0.40 - 911_700;
  }

  calculatedTax = Math.round(calculatedTax);

  const withheld = toDollars(inputs.withheldTaxMinor);
  const taxDue = Math.max(0, calculatedTax - withheld);

  const periods = Math.max(1, inputs.installmentCount);
  const installmentAmount = Math.round(taxDue / periods);

  const installmentMonths: number[] = [];
  const startMonth = Math.max(1, Math.min(12, inputs.installmentStartMonth));
  for (let i = 0; i < periods; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1;
    installmentMonths.push(m);
  }

  return {
    totalIncomeMinor: toMinor(totalIncome),
    exemptionsMinor: toMinor(exemptions),
    standardDeductionMinor: toMinor(standardDeduction),
    salaryDeductionMinor: toMinor(salaryDeduction),
    childDeductionMinor: toMinor(childDeduction),
    totalDeductionsMinor: toMinor(totalDeductions),
    netTaxableIncomeMinor: toMinor(netTaxableIncome),
    bracketRatePercent,
    bracketProgressiveDifferenceMinor: toMinor(bracketProgressiveDiff),
    calculatedTaxMinor: toMinor(calculatedTax),
    taxDueMinor: toMinor(taxDue),
    installmentAmountMinor: toMinor(installmentAmount),
    installmentMonths,
  };
}
