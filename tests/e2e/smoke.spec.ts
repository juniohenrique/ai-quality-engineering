import { test, expect } from '@playwright/test';

/**
 * Smoke test — valida que o servidor está rodando e responde
 *
 * Este teste é o mínimo necessário para validar que:
 * - O servidor sobe corretamente
 * - A página inicial carrega
 * - O endpoint de health está acessível
 */

test.describe('Smoke Test', () => {
  test('deve carregar a página inicial', async ({ page }) => {
    await page.goto('/');

    // Verifica que a página carregou e tem conteúdo esperado
    await expect(page).toHaveTitle(/AI Quality Engineering/i);
  });

  test('deve acessar o endpoint de health', async ({ request }) => {
    const response = await request.get('/health');

    // Aceita 200 (DB ok) ou 503 (DB indisponível, mas servidor rodando)
    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(['ok', 'degraded']).toContain(body.status);
  });
});
