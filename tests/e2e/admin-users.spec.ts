import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../setup/db.js";

/*
 * E2E Test — Admin Users Management (S06-00e)
 *
 * Valida que a coluna Role aparece na listagem de /users e que
 * /user-form.html em modo edição (?id=xyz) permite ao admin mudar a role
 * de outros usuários, mas bloqueia a auto-alteração (select disabled).
 *
 * NÃO modifica src/, public/ ou outros testes.
 */

const ADMIN_USER = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "admin@example.com",
  userName: "Admin User",
  role: "admin" as const,
  password: "admin-pass-12345",
};

const OTHER_USER = {
  id: "00000000-0000-0000-0000-000000000020",
  email: "other@example.com",
  userName: "Other User",
  role: "user" as const,
  password: "other-pass-12345",
};

async function seedUsers(): Promise<void> {
  const adminHash = await bcrypt.hash(ADMIN_USER.password, 12);
  const otherHash = await bcrypt.hash(OTHER_USER.password, 12);
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [ADMIN_USER.id, ADMIN_USER.email, ADMIN_USER.userName, adminHash, ADMIN_USER.role],
  );
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [OTHER_USER.id, OTHER_USER.email, OTHER_USER.userName, otherHash, OTHER_USER.role],
  );
}

/**
 * Helper de login via UI. Navega até /login.html, preenche as credenciais,
 * submete o formulário e aguarda o redirecionamento para /users.
 * Os tokens (auth_access_token / auth_refresh_token) são persistidos no
 * localStorage do browser context por app.js antes da navegação.
 */
async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login.html");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/users/);
  await page.waitForLoadState("networkidle");
}

/**
 * Consulta diretamente o banco de teste para obter o UUID de um usuário.
 */
async function getUserIdByEmail(email: string): Promise<string> {
  const result = await testDatabase.query("SELECT id FROM users WHERE email = $1", [email]);
  return result.rows[0].id;
}

test.describe("Admin Users Management (S06-00e)", () => {
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

  test("coluna Role aparece na listagem", async ({ page }) => {
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);

    // A coluna "Role" está no <thead> e a listagem tem exatamente 2 linhas
    await expect(page.getByRole("columnheader", { name: "Role" })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // Verifica que há exatamente 1 "admin" e 1 "user" no corpo da tabela
    const roles = await page.locator("tbody tr td:nth-child(3)").allTextContents();
    expect(roles).toHaveLength(2);
    expect(roles).toContain("admin");
    expect(roles).toContain("user");
  });

  test("admin abre form de outro user e vê select habilitado", async ({ page }) => {
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);

    const otherId = await getUserIdByEmail(OTHER_USER.email);
    await page.goto(`/user-form.html?id=${otherId}`);
    await page.waitForLoadState("networkidle");

    const roleSelect = page.getByTestId("user-role");
    await expect(roleSelect).toBeEnabled();
    await expect(roleSelect).toHaveValue("user");
  });

  test("admin muda role de outro user via form", async ({ page }) => {
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);

    const otherId = await getUserIdByEmail(OTHER_USER.email);
    await page.goto(`/user-form.html?id=${otherId}`);
    await page.waitForLoadState("networkidle");

    // Altera a role de "user" para "admin" e salva
    await page.getByTestId("user-role").selectOption("admin");
    await page.getByTestId("user-save").click();

    // Mensagem de sucesso + redirect para /users
    await expect(page.getByTestId("user-message")).toContainText(/atualizado/i);
    await expect(page).toHaveURL(/\/users/);

    // Relê o usuário no banco e confirma a role alterada
    const result = await testDatabase.query("SELECT role FROM users WHERE id = $1", [otherId]);
    expect(result.rows[0].role).toBe("admin");
  });

  test("admin abre form do próprio perfil e vê select desabilitado", async ({ page }) => {
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);

    // O id do próprio admin é o mesmo UUID usado no seed — e também o `sub`
    // do JWT emitido no login, que app.js compara contra o parâmetro ?id=.
    await page.goto(`/user-form.html?id=${ADMIN_USER.id}`);
    await page.waitForLoadState("networkidle");

    const roleSelect = page.getByTestId("user-role");
    await expect(roleSelect).toBeDisabled();
    await expect(roleSelect).toHaveAttribute("title", /própria permissão/i);
  });
});
