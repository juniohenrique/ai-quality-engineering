import { describe, it } from "vitest";
import fc from "fast-check";
import { sort } from "../../src/utils/sort.js";

/**
 * Propriedades para validar a implementação de {@link sort}.
 * Cada propriedade é testada isoladamente com fast-check.
 */

describe("sort — propriedades", () => {
  const fcOptions = { numRuns: 100 } as const;

  /**
   * Idempotência: aplicar sort duas vezes tem o mesmo resultado que aplicar uma vez.
   */
  it("é idempotente: sort(sort(x)) === sort(x)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (input) => {
        const first = sort(input);
        const second = sort(first);
        // compare arrays via JSON.stringify (determinístico)
        return JSON.stringify(first) === JSON.stringify(second);
      }),
      fcOptions,
    );
  });

  /**
   * Tamanho preservado: o array resultante tem o mesmo tamanho do original.
   */
  it("preserva o tamanho do array", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (input) => {
        const sorted = sort(input);
        return sorted.length === input.length;
      }),
      fcOptions,
    );
  });

  /**
   * Ordem consistente: após a ordenação, cada elemento é <= ao próximo.
   */
  it("mantém ordem consistente (≤) entre elementos adjacentes", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (input) => {
        const sorted = sort(input);
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i] > sorted[i + 1]) return false;
        }
        return true;
      }),
      fcOptions,
    );
  });

  /**
   * Permutação preservada: o conjunto de valores permanece o mesmo (mesma multiset).
   */
  it("preserva a permutação dos elementos", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (input) => {
        const sorted = sort(input);
        // comparar multiset usando contagem de ocorrências
        const count = (arr: number[]) => {
          const map = new Map<number, number>();
          for (const v of arr) {
            map.set(v, (map.get(v) ?? 0) + 1);
          }
          return map;
        };
        const originalMap = count(input);
        const sortedMap = count(sorted);
        if (originalMap.size !== sortedMap.size) return false;
        for (const [k, v] of originalMap) {
          if (sortedMap.get(k) !== v) return false;
        }
        return true;
      }),
      fcOptions,
    );
  });

  /**
   * Bônus: não muta o array de entrada.
   */
  it("não muta o array de entrada", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (input) => {
        const clone = input.slice();
        sort(input);
        return JSON.stringify(input) === JSON.stringify(clone);
      }),
      fcOptions,
    );
  });
});
