import { test, expect } from "@playwright/test";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../setup/db.js";

const TEST_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "e2e-login@example.com",
  userName: "E2E Login User",
  role: "user" as const,
  password: "e2e-password-123",
};

test.describe("Login Flow", () => {
  test.beforeEach(async () => {
    await resetDatabase();
    const hash = await bcrypt.hash(TEST_USER.password, 12);
    await testDatabase.query(
      "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
      [TEST_USER.id, TEST_USER.email, TEST_USER.userName, hash, TEST_USER.role],
    );
  });

  test.afterAll(async () => {
    await resetDatabase();
  });

  test("deve realizar login com sucesso e redirecionar para /users", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("login-email").fill(TEST_USER.email);
    await page.getByTestId("login-password").fill(TEST_USER.password);
    await page.getByTestId("login-submit").click();

    await expect(page).toHaveURL(/\/users/);
    await expect(page.locator("h1")).toHaveText("Usuários");

    // localStorage deve ter os 2 tokens
    const tokens = await page.evaluate(() => {
      interface BrowserGlobals {
        localStorage: { getItem(key: string): string | null };
      }
      const g = globalThis as unknown as BrowserGlobals;
      return {
        access: g.localStorage.getItem("auth_access_token"),
        refresh: g.localStorage.getItem("auth_refresh_token"),
      };
    });
    expect(tokens.access).toMatch(/^eyJ/);
    expect(tokens.refresh).toMatch(/^eyJ/);
  });

  test("deve exibir mensagem de erro com credenciais inválidas", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("login-email").fill("wrong@example.com");
    await page.getByTestId("login-password").fill("wrongpassword");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-message")).toContainText(/Invalid credentials/i);
    await expect(page).toHaveURL(/\/login/);
  });
});
