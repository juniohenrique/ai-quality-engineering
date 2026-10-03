import { test, expect } from "@playwright/test";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../../setup/db.js";

/**
 * E2E Test — XSS Protection (S06-04)
 *
 * Valida que userName com payload XSS armazenado não executa no browser do admin
 * quando lista usuários em /users.
 *
 * Fix no frontend: public/app.js usa createElement + textContent (não innerHTML).
 */

const ADMIN_USER = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "admin@example.com",
  userName: "Admin User",
  role: "admin" as const,
  password: "admin-pass-12345",
};

const XSS_USER = {
  id: "00000000-0000-0000-0000-000000000030",
  email: "xss@example.com",
  // Payload XSS que tentaria executar se innerHTML fosse usado
  userName: '<img src=x onerror="window.__xss=1">',
  role: "user" as const,
  password: "xss-pass-12345",
};

async function seedUsers(): Promise<void> {
  const adminHash = await bcrypt.hash(ADMIN_USER.password, 12);
  const xssHash = await bcrypt.hash(XSS_USER.password, 12);
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [ADMIN_USER.id, ADMIN_USER.email, ADMIN_USER.userName, adminHash, ADMIN_USER.role],
  );
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [XSS_USER.id, XSS_USER.email, XSS_USER.userName, xssHash, XSS_USER.role],
  );
}

async function loginAs(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login.html");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/users/);
  await page.waitForLoadState("networkidle");
}

test.describe("XSS Protection (S06-04)", () => {
  test.beforeAll(async () => {
    await resetDatabase();
  });

  test.beforeEach(async () => {
    await resetDatabase();
    await seedUsers();
  });

  test.afterAll(async () => {
    await resetDatabase();
  });

  test("admin abre /users e payload XSS em userName NÃO executa", async ({ page }) => {
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);

    // Verifica que a variável window.__xss NÃO foi definida (payload não executou)
    const xssExecuted = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__xss,
    );
    expect(xssExecuted).toBeUndefined();

    // Verifica que o texto aparece LITERAL na célula (não como elemento HTML renderizado)
    const userRows = page.getByTestId("user-row");
    const xssRow = userRows.filter({ hasText: XSS_USER.userName });
    await expect(xssRow).toHaveCount(1);

    // Verifica que nenhum elemento <img> foi renderizado dentro da tabela
    const imgElements = page.locator("tbody tr img");
    await expect(imgElements).toHaveCount(0);

    // Verifica que o conteúdo da célula é exatamente o payload como texto
    const cellText = await xssRow.locator("td").first().textContent();
    expect(cellText).toBe(XSS_USER.userName);
  });
});
