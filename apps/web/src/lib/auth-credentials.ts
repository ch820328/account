/** Internal email for better-auth (users log in with username only). */
export function usernameToInternalEmail(username: string): string {
  const u = username.trim().toLowerCase();
  const domain = (process.env.AUTH_EMAIL_DOMAIN ?? "users.example.com").toLowerCase();
  return `${u}@${domain}`;
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function getDefaultAdminUsername(): string {
  return normalizeUsername(process.env.ADMIN_USERNAME ?? "admin");
}

export function getDefaultAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "admin";
}
