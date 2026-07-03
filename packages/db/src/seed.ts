import { loadRootEnv } from "./repo-root.js";

loadRootEnv();

/** Seed shared reference data (instruments). Safe to run repeatedly. */
const REFERENCE_INSTRUMENTS = [
  { symbol: "2330", market: "TW", name: "台積電", currency: "TWD", type: "stock" },
  { symbol: "0050", market: "TW", name: "元大台灣50", currency: "TWD", type: "etf" },
  { symbol: "0056", market: "TW", name: "元大高股息", currency: "TWD", type: "etf" },
  { symbol: "VOO", market: "US", name: "Vanguard S&P 500 ETF", currency: "USD", type: "etf" },
  { symbol: "VT", market: "US", name: "Vanguard Total World ETF", currency: "USD", type: "etf" },
  { symbol: "AAPL", market: "US", name: "Apple Inc.", currency: "USD", type: "stock" },
] as const;

async function main() {
  const { db, instruments, sqlClient } = await import("./index.js");

  console.log("Seeding reference instruments...");
  await db
    .insert(instruments)
    .values(REFERENCE_INSTRUMENTS.map((i) => ({ ...i })))
    .onConflictDoNothing({
      target: [instruments.symbol, instruments.market],
    });
  console.log(`Seeded ${REFERENCE_INSTRUMENTS.length} instruments (existing ones skipped).`);
  await sqlClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
