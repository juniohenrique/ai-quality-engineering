/**
 * Divide um array em páginas de tamanho fixo.
 *
 * A última página pode ter menos elementos que `size`.
 *
 * @param items Array de entrada (não é mutado)
 * @param size Tamanho de cada página (> 0)
 * @returns Array de páginas (cada página é um array de itens)
 * @throws Error se `size <= 0`
 */
export function paginate<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("size must be greater than 0");
  }

  const pages: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    // slice is safe even if i+size exceeds length; it returns up to end
    pages.push(items.slice(i, i + size));
  }

  return pages;
}
