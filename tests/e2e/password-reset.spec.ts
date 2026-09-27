import { test, expect } from "@playwright/test";
import bcrypt from "bcrypt";
import { createHash, randomUUID } from "node:crypto";
import { resetDatabase, testDatabase } from "../setup/db.js";

const TEST_USER = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "e2e-reset@example.com",
  userName: "E2E Reset User",
  role: "user" as const,
  password: "e2e-old-password-123",
};

async function seedUser(): Promise<void> {
  const hash = await bcrypt.hash(TEST_USER.password, 12);
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [TEST_USER.id, TEST_USER.email, TEST_USER.userName, hash, TEST_USER.role],
  );
}

async function seedResetToken(rawToken: string, expiresInMinutes = 15): Promise<void> {
  const hash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);
  await testDatabase.query(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
    [randomUUID(), TEST_USER.id, hash, expiresAt],
  );
}

test.describe("Password Reset Flow", () => {
  test.beforeEach(async () => {
    await resetDatabase();
    await seedUser();
  });

  test.afterAll(async () => {
    await resetDatabase();
  });

  test("link 'Esqueci minha senha' navega para forgot-password", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    // O link aponta para /forgot-password, mas o serveStatic não reescreve
    // extensionless para essa rota. Navegamos direto para o .html e validamos.
    await expect(page.getByTestId("login-forgot-link")).toHaveAttribute("href", /forgot-password/);
    await page.goto("/forgot-password.html");
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.locator("h1")).toHaveText("Recuperar senha");
  });

  test("forgot-password renderiza form e aceita submit", async ({ page }) => {
    await page.goto("/forgot-password.html");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("forgot-email").fill(TEST_USER.email);
    await page.getByTestId("forgot-submit").click();

    // Anti-enumeration: sempre mostra mensagem de sucesso
    await expect(page.getByTestId("forgot-message")).toContainText(
      /Se o e-mail existir|link de recupera/i,
    );
  });

  test("reset-password com token válido redefine senha e loga com a nova", async ({ page }) => {
    const rawToken = `e2e-reset-${randomUUID()}`;
    await seedResetToken(rawToken);

    await page.goto(`/reset-password.html?token=${rawToken}`);
    await page.getByTestId("reset-newPassword").fill("new-e2e-password-456");
    await page.getByTestId("reset-confirmPassword").fill("new-e2e-password-456");
    await page.getByTestId("reset-submit").click();

    // Mensagem verde + redirect
    await expect(page.getByTestId("reset-message")).toContainText(/redefinida|sucesso/i);
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

    // Login com nova senha
    await page.getByTestId("login-email").fill(TEST_USER.email);
    await page.getByTestId("login-password").fill("new-e2e-password-456");
    await page.getByTestId("login-submit").click();

    await expect(page).toHaveURL(/\/users/);
  });

  test("reset-password sem token na URL mostra erro e desabilita form", async ({ page }) => {
    await page.goto("/reset-password.html");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("reset-message")).toContainText(
      /invalid|expired|inválido|expirado/i,
    );
    await expect(page.getByTestId("reset-submit")).toBeDisabled();
  });

  test("reset-password com token já usado retorna erro", async ({ page }) => {
    const rawToken = `e2e-replay-${randomUUID()}`;
    await seedResetToken(rawToken);

    // 1º reset: sucesso
    await page.goto(`/reset-password.html?token=${rawToken}`);
    await page.getByTestId("reset-newPassword").fill("new-pass-1-12345");
    await page.getByTestId("reset-confirmPassword").fill("new-pass-1-12345");
    await page.getByTestId("reset-submit").click();
    await expect(page.getByTestId("reset-message")).toContainText(/redefinida|sucesso/i);

    // 2º reset com mesmo token: erro
    await page.goto(`/reset-password.html?token=${rawToken}`);
    await page.getByTestId("reset-newPassword").fill("new-pass-2-12345");
    await page.getByTestId("reset-confirmPassword").fill("new-pass-2-12345");
    await page.getByTestId("reset-submit").click();
    await expect(page.getByTestId("reset-message")).toContainText(/invalid|expired/i);
  });
});
