/** Origins allowed for better-auth CSRF / origin checks (comma-separated in TRUSTED_ORIGINS). */
export function getTrustedOrigins(): string[] {
  const extra =
    process.env.TRUSTED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  return [
    ...new Set(
      [
        process.env.BETTER_AUTH_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        ...extra,
      ].filter((v): v is string => Boolean(v)),
    ),
  ];
}
