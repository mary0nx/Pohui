import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the real backend and a dedicated PostgreSQL database
 * (E2E_DATABASE_URL). The backend runs in development mode with the explicit dev login.
 */
const dbUrl = process.env.E2E_DATABASE_URL ?? "postgresql+asyncpg://familyos:familyos@localhost:5432/familyos_e2e";
const backendEnv = [
  "APP_ENV=development",
  "DEV_AUTH_ENABLED=true",
  `DATABASE_URL=${dbUrl}`,
  "APP_SECRET_KEY=e2e-secret-key-e2e-secret-key-e2e-secret",
  "BACKEND_URL=http://localhost:4173",
  "FRONTEND_URL=http://localhost:4173",
  "CORS_ORIGINS=http://localhost:4173",
  "RATE_LIMIT_PER_MINUTE=100000",
  "AUTH_RATE_LIMIT_PER_MINUTE=100000",
  "STORAGE_LOCAL_PATH=/tmp/familyos-e2e-files",
].join(" ");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    ...devices["iPhone 13"],
    browserName: "chromium",
    locale: "ru-RU",
    timezoneId: "Europe/Warsaw",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `cd ../backend && env ${backendEnv} .venv/bin/python scripts/reset_db.py && env ${backendEnv} .venv/bin/uvicorn app.main:app --port 8010`,
      url: "http://localhost:8010/health/ready",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx vite build && npx vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { E2E_API: "http://localhost:8010" },
    },
  ],
});
