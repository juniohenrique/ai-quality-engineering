import { test } from 'vitest';
import fc from 'fast-check';

/**
 * Número de execuções geradas pelo fast-check.
 * Pode ser sobrescrito via variável de ambiente para validar o setup
 * em diferentes profundidades (ex: FAST_CHECK_NUM_RUNS=100 npm run test:property).
 */
const numRuns = Number.parseInt(process.env.FAST_CHECK_NUM_RUNS ?? '10', 10);

/**
 * Propriedade trivial: sort(sort(x)) === sort(x), isto é, o sort é idempotente.
 * Serve apenas para validar que o toolchain de property testing funciona.
 */
test('property: sort should be idempotent — sort(sort(x)) === sort(x)', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (arr) => {
      const sorted = arr.slice().sort((a, b) => a - b);
      const sortedAgain = sorted.slice().sort((a, b) => a - b);
      return JSON.stringify(sorted) === JSON.stringify(sortedAgain);
    }),
    { numRuns },
  );
});
