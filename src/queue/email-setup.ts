/**
 * Constantes e nomes da fila de e-mails transacionais.
 *
 * Mantidos em um módulo próprio (paralelo a `setup.ts` de pagamentos) para
 * isolar a infraestrutura de dead-letter da fila de e-mails da de pagamentos.
 */

/** Nome da exchange de dead-letter para a fila `email-notifications`. */
export const EMAIL_DLX_NAME = "email-dlx";

/** Nome da Dead Letter Queue (DLQ) para a fila `email-notifications`. */
export const EMAIL_DLQ_NAME = "email-dlq";

/** Nome padrão da fila de e-mails transacionais. */
export const EMAIL_QUEUE = "email-notifications";
