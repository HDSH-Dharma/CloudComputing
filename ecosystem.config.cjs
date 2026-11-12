// PM2 process file for the Domainesia VPS (CloudPanel Node.js site).
//   pm2 startOrReload ecosystem.config.cjs --env production
// Env vars come from a file OUTSIDE the repo (default ~/filamentiq.env).
const ENV_FILE = process.env.FILAMENTIQ_ENV_FILE || `${process.env.HOME}/filamentiq.env`;

module.exports = {
  apps: [
    {
      // Next.js app (apps/web, owned by Flabianos). Port MUST match the "App Port" of the CloudPanel site.
      name: "filamentiq-web",
      cwd: "./apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3010",
      node_args: `--env-file=${ENV_FILE}`,
      max_memory_restart: "500M",
      env_production: { NODE_ENV: "production" },
    },
    // Optional: long-running monitoring worker (Maverick) if it does not run as a Supabase cron/Edge Function.
    // {
    //   name: "filamentiq-worker",
    //   cwd: "./apps/worker",
    //   script: "dist/index.js",
    //   node_args: `--env-file=${ENV_FILE}`,
    //   env_production: { NODE_ENV: "production" },
    // },
  ],
};
