import { test, expect } from "@playwright/test";

/**
 * E2E Test — User Creation Flow
 *
 * Valida o fluxo completo de criação de usuário:
 * - Navegação para o formulário de criação
 * - Preenchimento e submissão do formulário
 * - Validação de dados
 * - Persistência no backend
 * - Reflexão na listagem de usuários
 *
 * Este fluxo garante que o frontend, backend e banco de dados
 * estejam integrados corretamente no caminho de criação de usuários.
 */

test.describe("User Creation Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Navega para a página de usuários antes de cada teste
    await page.goto("/users");
  });

  test("deve criar um usuário com sucesso e exibi-lo na listagem", async ({ page }) => {
    // Arrange: Dados do novo usuário com timestamp para garantir unicidade
    const timestamp = Date.now();
    const newUser = {
      userName: "João Silva",
      email: `joao.silva.${timestamp}@example.com`,
    };

    // Act: Navega para o formulário de criação
    await page.getByTestId("user-create-button").click();
    await expect(page).toHaveURL("/user-form");
    await expect(page.locator("h1")).toHaveText("Novo usuário");

    // Act: Preenche o formulário
    await page.getByTestId("user-name").fill(newUser.name);
    await page.getByTestId("user-email").fill(newUser.email);
    await page.getByTestId("user-save").click();

    // Assert: Verifica redirecionamento para /users
    await expect(page).toHaveURL("/users");

    // Assert: Verifica que o usuário aparece na listagem
    const userRows = page.getByTestId("user-row");
    const lastRow = userRows.last();
    await expect(lastRow).toContainText(newUser.name);
    await expect(lastRow).toContainText(newUser.email);
  });

  test("deve exibir erro ao tentar criar usuário com email inválido", async ({ page }) => {
    // Arrange: Dados com email inválido (sem @)
    const invalidUser = {
      userName: "Maria Santos",
      email: "email-invalido",
    };

    // Act: Navega para o formulário de criação
    await page.getByTestId("user-create-button").click();
    await expect(page).toHaveURL("/user-form");

    // Act: Preenche o formulário com email inválido (validação HTML5 vai bloquear)
    await page.getByTestId("user-name").fill(invalidUser.name);
    await page.getByTestId("user-email").fill(invalidUser.email);

    // Assert: O botão de submit deve estar desabilitado ou a validação HTML5 impede o submit
    // Verifica que continua na página do formulário após tentar submeter
    await page.getByTestId("user-save").click();
    await expect(page).toHaveURL("/user-form");
  });

  test("deve exibir erro ao criar usuário com email duplicado", async ({ page }) => {
    // Arrange: Cria um usuário primeiro com timestamp para garantir unicidade entre execuções
    const timestamp = Date.now();
    const existingUser = {
      userName: "Pedro Oliveira",
      email: `pedro.oliveira.${timestamp}@example.com`,
    };

    // Act: Cria o primeiro usuário
    await page.getByTestId("user-create-button").click();
    await page.getByTestId("user-name").fill(existingUser.name);
    await page.getByTestId("user-email").fill(existingUser.email);
    await page.getByTestId("user-save").click();
    await expect(page).toHaveURL("/users");

    // Act: Tenta criar outro usuário com o mesmo email
    await page.getByTestId("user-create-button").click();
    await page.getByTestId("user-name").fill("Outro Nome");
    await page.getByTestId("user-email").fill(existingUser.email);
    await page.getByTestId("user-save").click();

    // Assert: Verifica que continua na página do formulário
    await expect(page).toHaveURL("/user-form");

    // Assert: Verifica que a mensagem de erro é exibida
    const errorMessage = page.getByTestId("user-message");
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).not.toHaveText("Usuário criado.");
  });

  test("deve permitir cancelar a criação de usuário", async ({ page }) => {
    // Act: Navega para o formulário de criação
    await page.getByTestId("user-create-button").click();
    await expect(page).toHaveURL("/user-form");

    // Act: Preenche parcialmente o formulário
    await page.getByTestId("user-name").fill("Ana Costa");

    // Act: Cancela a operação
    await page.getByTestId("user-cancel").click();

    // Assert: Verifica retorno para a página de usuários
    await expect(page).toHaveURL("/users");
    await expect(page.locator("h1")).toHaveText("Usuários");
  });
});
