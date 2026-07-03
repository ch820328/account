import { type Database, accounts, categories } from "@acc/db";
import { DEFAULT_CATEGORIES } from "./categories";
import { getBaseCurrency } from "./currency";

/**
 * Populate a brand-new user with starter categories and a default cash account.
 * Idempotent-ish: intended to run once, right after the user is created.
 */
export async function seedNewUser(db: Database, userId: string): Promise<void> {
  const baseCurrency = getBaseCurrency();

  await db.transaction(async (tx) => {
    for (const parent of DEFAULT_CATEGORIES) {
      const [inserted] = await tx
        .insert(categories)
        .values({ userId, name: parent.name, kind: parent.kind })
        .returning({ id: categories.id });

      if (inserted && parent.children?.length) {
        await tx.insert(categories).values(
          parent.children.map((childName) => ({
            userId,
            name: childName,
            kind: parent.kind,
            parentId: inserted.id,
          })),
        );
      }
    }

    await tx.insert(accounts).values({
      userId,
      name: "現金",
      type: "cash",
      currency: baseCurrency,
    });
  });
}
