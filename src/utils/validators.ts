/**
 * Valida se uma string é um email válido (formato básico).
 *
 * Regras:
 * - Deve conter exatamente um "@"
 * - Parte antes do "@" deve ter ao menos 1 caractere
 * - Parte depois do "@" deve conter ao menos um "."
 * - Não pode conter espaços em branco
 * - Não pode ser vazia
 *
 * @param value Valor de entrada (qualquer tipo)
 * @returns true se for um email válido, false caso contrário
 */
export function isValidEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.includes(" ")) return false;

  const atIndex = trimmed.indexOf("@");
  if (atIndex === -1) return false;
  // somente um @
  if (trimmed.indexOf("@", atIndex + 1) !== -1) return false;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (local.length === 0) return false;
  if (domain.length === 0) return false;
  if (!domain.includes(".")) return false;

  return true;
}

/**
 * Valida se uma string não está vazia (após trim).
 *
 * @param value Valor de entrada (qualquer tipo)
 * @returns true se não estiver vazia, false caso contrário
 */
export function isNonEmptyString(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().length > 0;
}
