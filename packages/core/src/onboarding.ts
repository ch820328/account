import { type Database, accounts, categories } from "@acc/db";
import { and, eq } from "drizzle-orm";
import { DEFAULT_CATEGORIES } from "./categories";
import { getBaseCurrency } from "./currency";

/**
 * Insert any default categories (parent groups + children) the user is
 * missing, matched by name/kind. Idempotent — safe to re-run to backfill
 * newly added defaults for existing users. Returns how many were added.
 */
export async function seedMissingDefaultCategories(
  db: Database,
  userId: string,
): Promise<{ added: number }> {
  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const parentByKey = new Map<string, string>(); // `${kind}:${name}` -> id
  const childKeys = new Set<string>(); // `${parentId}:${name}`
  for (const c of existing) {
    if (!c.parentId) parentByKey.set(`${c.kind}:${c.name}`, c.id);
    else childKeys.add(`${c.parentId}:${c.name}`);
  }

  let added = 0;
  for (const def of DEFAULT_CATEGORIES) {
    let parentId = parentByKey.get(`${def.kind}:${def.name}`);
    if (!parentId) {
      const [ins] = await db
        .insert(categories)
        .values({ userId, name: def.name, kind: def.kind })
        .returning({ id: categories.id });
      parentId = ins!.id;
      parentByKey.set(`${def.kind}:${def.name}`, parentId);
      added += 1;
    }
    for (const childName of def.children ?? []) {
      if (childKeys.has(`${parentId}:${childName}`)) continue;
      await db
        .insert(categories)
        .values({ userId, name: childName, kind: def.kind, parentId });
      childKeys.add(`${parentId}:${childName}`);
      added += 1;
    }
  }
  return { added };
}

/**
 * Populate a brand-new user with starter categories and a default cash account.
 */
export async function seedNewUser(db: Database, userId: string): Promise<void> {
  const baseCurrency = getBaseCurrency();

  await db.transaction(async (tx) => {
    await seedMissingDefaultCategories(tx as unknown as Database, userId);

    const [cash] = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.type, "cash")))
      .limit(1);
    if (!cash) {
      await tx.insert(accounts).values({
        userId,
        name: "現金",
        type: "cash",
        currency: baseCurrency,
      });
    }
  });
}
