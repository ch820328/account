import { loadRootEnv } from "@acc/db/env";

loadRootEnv();

async function main() {
  const { db, sqlClient, user } = await import("@acc/db");
  const { eq, or } = await import("drizzle-orm");
  const {
    getDefaultAdminPassword,
    getDefaultAdminUsername,
    usernameToInternalEmail,
  } = await import("../src/lib/auth-credentials.js");
  const { auth } = await import("../src/server/auth.js");

  const adminUsername = getDefaultAdminUsername();
  const password = getDefaultAdminPassword();
  const internalEmail = usernameToInternalEmail(adminUsername);

  const [existing] = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(or(eq(user.username, adminUsername), eq(user.email, internalEmail)))
    .limit(1);

  if (existing?.username === adminUsername) {
    console.log(`Admin already exists (${adminUsername}), skipping.`);
    await sqlClient.end();
    return;
  }

  if (existing && !existing.username) {
    await db
      .update(user)
      .set({ username: adminUsername, displayUsername: adminUsername })
      .where(eq(user.id, existing.id));
    console.log(`Linked username "${adminUsername}" to existing admin user.`);
    await sqlClient.end();
    return;
  }

  console.log(`Creating default admin (${adminUsername})…`);
  const result = await auth.api.signUpEmail({
    body: {
      email: internalEmail,
      username: adminUsername,
      password,
      name: "Admin",
    },
  });

  if (result && typeof result === "object" && "error" in result && result.error) {
    const msg =
      typeof result.error === "object" && result.error && "message" in result.error
        ? String(result.error.message)
        : "Failed to create admin user";
    throw new Error(msg);
  }

  console.log("Default admin created (onboarding categories + cash account included).");
  await sqlClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
