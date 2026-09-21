/**
 * Experimentos didáticos para demonstrar o mecanismo de shrinking do fast-check.
 * Os testes são intencionalmente falhos e marcados como `.skip` para não
 * interromper a CI. Cada `it.skip` contém um exemplo de como o fast-check
 * reduz o contraexemplo ao menor caso que ainda falha.
 */

import { expect, it } from "vitest";
import fc from "fast-check";

/**
 * Exemplo 1 – shrinking de array de inteiros.
 *
 * A propriedade verifica que qualquer array está ordenado. Como isso não é
 * verdade, o fast-check gera um array aleatório e, em seguida, o reduz ao
 * menor contraexemplo que ainda viola a ordenação (geralmente `[1, 0]`).
 */
it.skip("array: demonstra shrinking ao menor contraexemplo desordenado", () => {
  fc.assert(
    fc.property(fc.array(fc.integer(), { minLength: 2 }), (arr) => {
      const sorted = [...arr].sort((a, b) => a - b);
      // Falha propositalmente quando o array não está ordenado
      expect(sorted).toEqual(arr);
    }),
    { numRuns: 1 }, // basta um run para disparar o erro
  );
});

/**
 * Exemplo 2 – shrinking de string.
 *
 * Propriedade falsa: toda string deve ser vazia. O fast-check gera uma string
 * aleatória e a encurta até chegar à string mínima que ainda falha – a
 * própria string vazia não satisfaz a propriedade, então o menor contraexemplo
 * costuma ser `"a"` ou `""` dependendo da condição.
 */
it.skip("string: demonstra shrinking de string longa para mínima", () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), (s) => {
      // Propriedade falsa: a string deve ser vazia
      expect(s).toBe("");
    }),
    { numRuns: 1 },
  );
});

/**
 * Exemplo 3 – shrinking de número.
 *
 * Propriedade falsa: todo número deve ser menor que 0. O fast-check gera um
 * número positivo e o reduz até o menor contraexemplo que ainda viola a
 * condição (geralmente `1`).
 */
it.skip("número: demonstra shrinking de número grande para pequeno", () => {
  fc.assert(
    fc.property(fc.nat({ max: 1000 }), (n) => {
      // Falha quando n >= 0
      expect(n).toBeLessThan(0);
    }),
    { numRuns: 1 },
  );
});

/**
 * Exemplo 4 – shrinking com múltiplos arbitraries.
 *
 * Propriedade falsa que combina array e string. O fast-check tenta reduzir
 * ambos simultaneamente, resultando em um contraexemplo como `[[1,0], "a"]`.
 */
it.skip("múltiplos: array + string", () => {
  fc.assert(
    fc.property(fc.array(fc.integer(), { minLength: 2 }), fc.string({ minLength: 1 }), (arr, s) => {
      const sorted = [...arr].sort((a, b) => a - b);
      // Falha se o array não está ordenado ou a string não está vazia
      return JSON.stringify(sorted) === JSON.stringify(arr) && s === "";
    }),
    { numRuns: 1 },
  );
});
