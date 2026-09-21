import { test, expect } from "@playwright/test";

/**
 * E2E Test — User Edit Flow
 *
 * Valida o fluxo completo de edição de usuário:
 * - Criação de um usuário (setup)
 * - Navegação para o formulário de edição
 * - Modificação dos dados
 * - Salvamento das alterações
 * - Verificação da persistência das mudanças
 *
 * Este fluxo garante que alterações em usuários sejam persistidas
 * corretamente no backend e refletidas na UI.
 */

test.describe("User Edit Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Navega para a página de usuários antes de cada teste
    await page.goto("/users");
  });

  test("deve editar um usuário com sucesso e refletir as mudanças na listagem", async ({
    page,
  }) => {
    // Arrange: Cria um usuário primeiro para poder editá-lo
    const timestamp = Date.now();
    const originalUser = {
      userName: "Carlos Original",
      email: `carlos.original.${timestamp}@example.com`,
    };

    await page.getByTestId("user-create-button").click();
    await page.getByTestId("user-name").fill(originalUser.name);
    await page.getByTestId("user-email").fill(originalUser.email);
    await page.getByTestId("user-save").click();
    await expect(page).toHaveURL("/users");

    // Act: Localiza o usuário na listagem e clica no botão de editar
    const userRows = page.getByTestId("user-row");
    const targetRow = userRows.filter({ hasText: originalUser.email }).first();
    await targetRow.getByTestId("user-edit-button").click();

    // Assert: Verifica que navegou para o formulário de edição
    await expect(page).toHaveURL(/\/user-form\?id=\d+/);
    await expect(page.locator("h1")).toHaveText("Editar usuário");

    // Act: Modifica os dados
    const updatedUser = {
      userName: "Carlos Editado",
      email: `carlos.editado.${timestamp}@example.com`,
    };

    await page.getByTestId("user-name").clear();
    await page.getByTestId("user-name").fill(updatedUser.name);
    await page.getByTestId("user-email").clear();
    await page.getByTestId("user-email").fill(updatedUser.email);
    await page.getByTestId("user-save").click();

    // Assert: Verifica redirecionamento para /users
    await expect(page).toHaveURL("/users");

    // Assert: Verifica que as mudanças aparecem na listagem
    const updatedRow = userRows.filter({ hasText: updatedUser.email }).first();
    await expect(updatedRow).toContainText(updatedUser.name);
    await expect(updatedRow).toContainText(updatedUser.email);

    // Assert: Verifica que o email antigo não existe mais
    await expect(page.getByText(originalUser.email)).not.toBeVisible();
  });

  test("deve exibir erro ao editar usuário com email inválido", async ({ page }) => {
    // Arrange: Cria um usuário primeiro
    const timestamp = Date.now();
    const user = {
      userName: "Ana Silva",
      email: `ana.silva.${timestamp}@example.com`,
    };

    await page.getByTestId("user-create-button").click();
    await page.getByTestId("user-name").fill(user.name);
    await page.getByTestId("user-email").fill(user.email);
    await page.getByTestId("user-save").click();
    await expect(page).toHaveURL("/users");

    // Act: Navega para edição
    const userRows = page.getByTestId("user-row");
    const targetRow = userRows.filter({ hasText: user.email }).first();
    await targetRow.getByTestId("user-edit-button").click();

    // Act: Tenta atualizar com email inválido
    await page.getByTestId("user-email").clear();
    await page.getByTestId("user-email").fill("email-invalido");
    await page.getByTestId("user-save").click();

    // Assert: Validação HTML5 impede o submit, permanece na página de edição
    await expect(page).toHaveURL(/\/user-form\?id=\d+/);
  });

  test("deve exibir erro ao editar usuário com email duplicado", async ({ page }) => {
    // Arrange: Cria dois usuários
    const timestamp = Date.now();
    const user1 = {
      userName: "Ricardo Santos",
      email: `ricardo.santos.${timestamp}@example.com`,
    };
    const user2 = {
      userName: "Paula Costa",
      email: `paula.costa.${timestamp}@example.com`,
    };

    // Cria o primeiro usuário
    await page.getByTestId("user-create-button").click();
    await page.getByTestId("user-name").fill(user1.name);
    await page.getByTestId("user-email").fill(user1.email);
    await page.getByTestId("user-save").click();
    await expect(page).toHaveURL("/users");

    // Cria o segundo usuário
    await page.getByTestId("user-create-button").click();
    await page.getByTestId("user-name").fill(user2.name);
    await page.getByTestId("user-email").fill(user2.email);
    await page.getByTestId("user-save").click();
    await expect(page).toHaveURL("/users");

    // Act: Edita o segundo usuário tentando usar o email do primeiro
    const userRows = page.getByTestId("user-row");
    const targetRow = userRows.filter({ hasText: user2.email }).first();
    await targetRow.getByTestId("user-edit-button").click();

    await page.getByTestId("user-email").clear();
    await page.getByTestId("user-email").fill(user1.email);
    await page.getByTestId("user-save").click();

    // Assert: Verifica que continua na página de edição
    await expect(page).toHaveURL(/\/user-form\?id=\d+/);

    // Assert: Verifica mensagem de erro
    const errorMessage = page.getByTestId("user-message");
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).not.toHaveText("Usuário atualizado.");
  });

  test("deve permitir cancelar a edição de usuário", async ({ page }) => {
    // Arrange: Cria um usuário
    const timestamp = Date.now();
    const user = {
      userName: "Bruno Lima",
      email: `bruno.lima.${timestamp}@example.com`,
    };

    await page.getByTestId("user-create-button").click();
    await page.getByTestId("user-name").fill(user.name);
    await page.getByTestId("user-email").fill(user.email);
    await page.getByTestId("user-save").click();
    await expect(page).toHaveURL("/users");

    // Act: Navega para edição
    const userRows = page.getByTestId("user-row");
    const targetRow = userRows.filter({ hasText: user.email }).first();
    await targetRow.getByTestId("user-edit-button").click();
    await expect(page).toHaveURL(/\/user-form\?id=\d+/);

    // Act: Faz alterações mas cancela
    await page.getByTestId("user-name").clear();
    await page.getByTestId("user-name").fill("Nome Alterado");
    await page.getByTestId("user-cancel").click();

    // Assert: Verifica retorno para listagem
    await expect(page).toHaveURL("/users");

    // Assert: Verifica que as alterações não foram salvas
    const unchangedRow = userRows.filter({ hasText: user.email }).first();
    await expect(unchangedRow).toContainText(user.name);
    await expect(page.getByText("Nome Alterado")).not.toBeVisible();
  });
});
