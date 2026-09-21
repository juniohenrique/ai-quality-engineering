import { describe, it } from "vitest";
import fc from "fast-check";
import { paginate } from "../../src/utils/paginate.js";

/**
 * Propriedades para validar a implementação de {@link paginate}.
 */

describe("paginate — propriedades", () => {
  const fcOptions = { numRuns: 100 } as const;

  /**
   * Número correto de páginas: a quantidade de páginas deve ser
   * Math.ceil(items.length / size).
   */
  it("retorna o número correto de páginas", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
        fc.integer({ min: 1, max: 10 }),
        (items, size) => {
          const pages = paginate(items, size);
          return pages.length === Math.ceil(items.length / size);
        },
      ),
      fcOptions,
    );
  });

  /**
   * Concatenação preserva conteúdo e ordem: a concatenação de todas as páginas deve
   * ser idêntica ao array original.
   */
  it("concatenação preserva conteúdo e ordem", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
        fc.integer({ min: 1, max: 10 }),
        (items, size) => {
          const pages = paginate(items, size);
          const flat = pages.flat();
          return JSON.stringify(flat) === JSON.stringify(items);
        },
      ),
      fcOptions,
    );
  });

  /**
   * Nenhuma página excede o tamanho especificado.
   */
  it("nenhuma página excede o tamanho máximo", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
        fc.integer({ min: 1, max: 10 }),
        (items, size) => {
          const pages = paginate(items, size);
          return pages.every((p) => p.length <= size);
        },
      ),
      fcOptions,
    );
  });

  /**
   * Bônus: última página nunca vazia quando há itens.
   */
  it("última página nunca vazia quando items > 0", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 100 }),
        fc.integer({ min: 1, max: 10 }),
        (items, size) => {
          const pages = paginate(items, size);
          const last = pages[pages.length - 1];
          return last !== undefined && last.length > 0;
        },
      ),
      fcOptions,
    );
  });

  /**
   * Bônus: idempotência – paginar duas vezes não altera o resultado.
   */
  it("é idempotente: paginar duas vezes não muda o resultado", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
        fc.integer({ min: 1, max: 10 }),
        (items, size) => {
          const first = paginate(items, size);
          const second = paginate(first.flat(), size);
          // comparar via JSON.stringify para garantir mesma estrutura
          return JSON.stringify(first) === JSON.stringify(second);
        },
      ),
      fcOptions,
    );
  });
});
