import { INSTRUMENT_TYPES, MARKETS } from "@acc/db";
import { z } from "zod";

const market = z.enum(MARKETS);
const instrumentType = z.enum(INSTRUMENT_TYPES);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const decimal = z.string().regex(/^\d+(\.\d+)?$/);

export const upsertInstrumentsInput = z.object({
  instruments: z
    .array(
      z.object({
        symbol: z.string().min(1),
        market,
        name: z.string().min(1),
        currency: z.string().length(3),
        type: instrumentType,
      }),
    )
    .min(1),
});

export const upsertPricesInput = z.object({
  source: z.string().min(1).default("quant-trading"),
  asOf: isoDate.optional(),
  prices: z
    .array(
      z.object({
        symbol: z.string().min(1),
        market,
        price: decimal,
        currency: z.string().length(3),
      }),
    )
    .min(1),
});

export const upsertFxInput = z.object({
  source: z.string().min(1).default("quant-trading"),
  asOf: isoDate.optional(),
  rates: z
    .array(
      z.object({
        base: z.string().length(3),
        quote: z.string().length(3),
        rate: decimal,
      }),
    )
    .min(1),
});

export const syncHoldingsInput = z.object({
  source: z.string().min(1).default("quant-trading"),
  /** Full snapshot: holdings not in payload are removed. */
  replace: z.boolean().default(true),
  holdings: z.array(
    z.object({
      symbol: z.string().min(1),
      market,
      quantity: decimal,
      avgCost: decimal.optional(),
      costCurrency: z.string().length(3).optional(),
      accountId: z.string().uuid().optional(),
    }),
  ),
});
