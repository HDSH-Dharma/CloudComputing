// Re-export of the canonical contracts that live next to the Edge Functions.
// Next.js: add `transpilePackages: ["@filamentiq/shared"]` and `experimental.externalDir: true`
// to next.config, and `"allowImportingTsExtensions": true` to tsconfig (Next uses noEmit).
export * from "../../../supabase/functions/_shared/contracts.ts";
