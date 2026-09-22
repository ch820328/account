/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Internal workspace packages are shipped as TypeScript source.
  transpilePackages: ["@acc/money", "@acc/db", "@acc/core", "@acc/rpc"],
  // Keep native/node-only deps out of the bundle.
  serverExternalPackages: ["postgres"],
  allowedDevOrigins: ["192.168.0.114", "192.168.68.54", "192.168.0.*", "192.168.68.*", "localhost", "account.sepancorp.com"],
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
