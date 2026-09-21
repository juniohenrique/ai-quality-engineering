/**
 * Ordena um array de números em ordem crescente.
 * Implementação simples (bubble sort) usada para fins didáticos
 * e para testar propriedades com fast-check.
 *
 * @param input Array de números (readonly)
 * @returns Novo array ordenado (não muta o original)
 */
export function sort(input: readonly number[]): number[] {
  // Copia para evitar mutação do array original
  const result = Array.from(input);
  const n = result.length;
  // Algoritmo bubble sort clássico
  for (let i = 0; i < n - 1; i++) {
    // Otimização: se nenhum swap na passagem, array já está ordenado
    let swapped = false;
    for (let j = 0; j < n - i - 1; j++) {
      const left = result[j];
      const right = result[j + 1];
      if (left !== undefined && right !== undefined && left > right) {
        result[j] = right;
        result[j + 1] = left;
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return result;
}
