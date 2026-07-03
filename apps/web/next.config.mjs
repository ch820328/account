/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Internal workspace packages are shipped as TypeScript source.
  transpilePackages: ["@acc/money", "@acc/db", "@acc/core", "@acc/rpc"],
  // Keep native/node-only deps out of the bundle.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
