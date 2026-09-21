import { test, expect } from '@playwright/test';

/**
 * E2E Test — User Deletion Flow
 *
 * Valida o fluxo completo de exclusão de usuário:
 * - Criação de um usuário (setup)
 * - Localização do usuário na listagem
 * - Acionamento da exclusão
 * - Confirmação da exclusão
 * - Verificação da remoção da listagem
 *
 * Este fluxo garante que exclusões sejam processadas corretamente
 * e refletidas imediatamente na UI, com confirmação do usuário.
 */

test.describe('User Deletion Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navega para a página de usuários antes de cada teste
    await page.goto('/users');
  });

  test('deve excluir um usuário com sucesso após confirmação', async ({ page }) => {
    // Arrange: Cria um usuário primeiro para poder excluí-lo
    const timestamp = Date.now();
    const userToDelete = {
      userName: 'Roberto Deletado',
      email: `roberto.deletado.${timestamp}@example.com`,
    };

    await page.getByTestId('user-create-button').click();
    await page.getByTestId('user-name').fill(userToDelete.name);
    await page.getByTestId('user-email').fill(userToDelete.email);
    await page.getByTestId('user-save').click();
    await expect(page).toHaveURL('/users');

    // Assert: Verifica que o usuário aparece na listagem antes da exclusão
    const userRowsBefore = page.getByTestId('user-row');
    const targetRow = userRowsBefore.filter({ hasText: userToDelete.email }).first();
    await expect(targetRow).toBeVisible();
    await expect(targetRow).toContainText(userToDelete.name);
    await expect(targetRow).toContainText(userToDelete.email);

    // Act: Clica no botão de excluir
    await targetRow.getByTestId('user-delete-button').click();

    // Act: Confirma a exclusão no diálogo de confirmação
    page.on('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Tem certeza');
      await dialog.accept();
    });

    // Aguarda a exclusão ser processada
    await page.waitForTimeout(500);

    // Assert: Verifica que o usuário não aparece mais na listagem
    const userRowsAfter = page.getByTestId('user-row');
    const deletedRow = userRowsAfter.filter({ hasText: userToDelete.email });
    await expect(deletedRow).toHaveCount(0);
  });

  test('deve cancelar a exclusão quando o usuário cancela o diálogo', async ({ page }) => {
    // Arrange: Cria um usuário primeiro
    const timestamp = Date.now();
    const userToKeep = {
      userName: 'Ana Preservada',
      email: `ana.preservada.${timestamp}@example.com`,
    };

    await page.getByTestId('user-create-button').click();
    await page.getByTestId('user-name').fill(userToKeep.name);
    await page.getByTestId('user-email').fill(userToKeep.email);
    await page.getByTestId('user-save').click();
    await expect(page).toHaveURL('/users');

    // Assert: Verifica que o usuário aparece na listagem
    const userRowsBefore = page.getByTestId('user-row');
    const targetRow = userRowsBefore.filter({ hasText: userToKeep.email }).first();
    await expect(targetRow).toBeVisible();

    // Act: Clica no botão de excluir mas cancela
    await targetRow.getByTestId('user-delete-button').click();

    // Act: Cancela a exclusão no diálogo de confirmação
    page.on('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.dismiss();
    });

    // Aguarda um momento para garantir que nenhuma exclusão ocorreu
    await page.waitForTimeout(500);

    // Assert: Verifica que o usuário ainda aparece na listagem
    const userRowsAfter = page.getByTestId('user-row');
    const preservedRow = userRowsAfter.filter({ hasText: userToKeep.email }).first();
    await expect(preservedRow).toBeVisible();
    await expect(preservedRow).toContainText(userToKeep.name);
    await expect(preservedRow).toContainText(userToKeep.email);
  });

  test('deve excluir múltiplos usuários sequencialmente', async ({ page }) => {
    // Arrange: Cria dois usuários
    const timestamp = Date.now();
    const users = [
      {
        userName: 'Primeiro Usuário',
        email: `primeiro.${timestamp}@example.com`,
      },
      {
        userName: 'Segundo Usuário',
        email: `segundo.${timestamp}@example.com`,
      },
    ];

    // Cria os usuários
    for (const user of users) {
      await page.getByTestId('user-create-button').click();
      await page.getByTestId('user-name').fill(user.name);
      await page.getByTestId('user-email').fill(user.email);
      await page.getByTestId('user-save').click();
      await expect(page).toHaveURL('/users');
    }

    // Assert: Verifica que ambos os usuários aparecem na listagem
    for (const user of users) {
      const row = page.getByTestId('user-row').filter({ hasText: user.email }).first();
      await expect(row).toBeVisible();
    }

    // Act: Exclui o primeiro usuário
    const firstRow = page.getByTestId('user-row').filter({ hasText: users[0].email }).first();
    await firstRow.getByTestId('user-delete-button').click();

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.waitForTimeout(500);

    // Assert: Verifica que o primeiro foi removido e o segundo permanece
    const firstRowAfter = page.getByTestId('user-row').filter({ hasText: users[0].email });
    await expect(firstRowAfter).toHaveCount(0);

    const secondRow = page.getByTestId('user-row').filter({ hasText: users[1].email }).first();
    await expect(secondRow).toBeVisible();

    // Act: Exclui o segundo usuário
    await secondRow.getByTestId('user-delete-button').click();
    await page.waitForTimeout(500);

    // Assert: Verifica que o segundo também foi removido
    const secondRowAfter = page.getByTestId('user-row').filter({ hasText: users[1].email });
    await expect(secondRowAfter).toHaveCount(0);
  });
});
