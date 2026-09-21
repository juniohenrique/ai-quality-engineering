import { defineConfig, devices } from "@playwright/test";

/**
 * Configuração do Playwright para testes E2E
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",

  /* Timeout para cada teste */
  timeout: 30 * 1000,

  /* Configuração de retries */
  retries: process.env.CI ? 1 : 0,

  /* Paralelismo */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter */
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],

  /* Configuração compartilhada para todos os projetos */
  use: {
    /* Base URL para testes */
    baseURL: "http://localhost:3000",

    /* Coleta traces em caso de falha */
    trace: "on-first-retry",

    /* Screenshot em caso de falha */
    screenshot: "only-on-failure",
  },

  /* Configuração de projetos (browsers) */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Servidor de desenvolvimento */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/quality_dev",
    },
  },
});
