import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle: `node .next/standalone/server.js`.
  // See specs/12-Architecture.md §12.12.
  output: "standalone",
  typedRoutes: true,
  // `better-sqlite3` is a native module (a compiled `.node` binary) and must
  // not be bundled/traced by webpack/Turbopack — it has to be loaded via a
  // real `require` against `node_modules` at runtime. This is the current
  // stable Next 15+ config key (superseding the older
  // `experimental.serverComponentsExternalPackages`). See
  // specs/12-Architecture.md §12.5 / §12.12 and src/server/db/client.ts.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
