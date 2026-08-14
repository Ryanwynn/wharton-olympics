/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // PGlite ships a WASM bundle; keep it external to the server bundle so Next
    // doesn't try to trace/bundle the wasm. On Neon this is irrelevant (swap to `pg`).
    serverComponentsExternalPackages: ["@electric-sql/pglite"],
  },
};

export default nextConfig;
