import { test, expect } from "@playwright/test";

/**
 * E2E Test — Login Flow
 *
 * Valida o fluxo completo de login do usuário:
 * - Preenchimento do formulário
 * - Submissão e validação de credenciais
 * - Redirecionamento em caso de sucesso
 * - Exibição de mensagem de erro em caso de falha
 *
 * Este é um dos fluxos mais críticos do sistema. Falhas aqui
 * bloqueiam o acesso a todo o resto da aplicação.
 */

test.describe("Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Navega para a página de login antes de cada teste
    await page.goto("/login");
  });

  test("deve realizar login com sucesso e redirecionar para /users", async ({ page }) => {
    // Arrange: Credenciais válidas
    const validEmail = "test@example.com";
    const validPassword = "password";

    // Act: Preenche o formulário de login
    await page.getByTestId("login-email").fill(validEmail);
    await page.getByTestId("login-password").fill(validPassword);
    await page.getByTestId("login-submit").click();

    // Assert: Verifica redirecionamento para /users
    await expect(page).toHaveURL("/users");

    // Assert: Verifica que a página de usuários foi carregada
    await expect(page.locator("h1")).toHaveText("Usuários");
  });

  test("deve exibir mensagem de erro com credenciais inválidas", async ({ page }) => {
    // Arrange: Credenciais inválidas
    const invalidEmail = "wrong@example.com";
    const invalidPassword = "wrongpassword";

    // Act: Preenche o formulário com credenciais incorretas
    await page.getByTestId("login-email").fill(invalidEmail);
    await page.getByTestId("login-password").fill(invalidPassword);
    await page.getByTestId("login-submit").click();

    // Assert: Verifica que permanece na página de login
    await expect(page).toHaveURL("/login");

    // Assert: Verifica que a mensagem de erro é exibida
    const errorMessage = page.getByTestId("login-message");
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText("Invalid credentials");
  });

  test("deve exibir mensagem de erro com email inválido", async ({ page }) => {
    // Arrange: Email vazio e senha válida
    const invalidEmail = "";
    const validPassword = "password";

    // Act: Preenche apenas a senha
    await page.getByTestId("login-email").fill(invalidEmail);
    await page.getByTestId("login-password").fill(validPassword);
    await page.getByTestId("login-submit").click();

    // Assert: Verifica que permanece na página de login
    await expect(page).toHaveURL("/login");

    // Assert: Verifica que a mensagem de erro é exibida
    const errorMessage = page.getByTestId("login-message");
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText("Invalid request");
  });

  test("deve exibir mensagem de erro com senha vazia", async ({ page }) => {
    // Arrange: Email válido e senha vazia
    const validEmail = "test@example.com";
    const invalidPassword = "";

    // Act: Preenche apenas o email
    await page.getByTestId("login-email").fill(validEmail);
    await page.getByTestId("login-password").fill(invalidPassword);
    await page.getByTestId("login-submit").click();

    // Assert: Verifica que permanece na página de login
    await expect(page).toHaveURL("/login");

    // Assert: Verifica que a mensagem de erro é exibida
    const errorMessage = page.getByTestId("login-message");
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText("Invalid request");
  });

  test("deve permitir navegar para página de usuários via link", async ({ page }) => {
    // Act: Clica no link para a página de usuários
    await page.getByTestId("login-users-link").click();

    // Assert: Verifica redirecionamento para /users
    await expect(page).toHaveURL("/users");
    await expect(page.locator("h1")).toHaveText("Usuários");
  });
});
