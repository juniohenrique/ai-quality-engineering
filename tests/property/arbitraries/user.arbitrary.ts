/**
 * Arbitrary generator for {@link User} objects.
 * Utiliza fast-check para gerar valores que sempre satisfaçam as invariantes
 * definidas na classe {@code User} (email válido, nome não vazio, id UUID).
 */
import fc from "fast-check";
import { User } from "../../../src/domain/user.js"; // caminho relativo ao diretório de testes

/**
 * {@link User} arbitrário.
 * - id: UUID string
 * - email: endereço de email válido, já normalizado para minúsculas e sem espaços
 * - userName: string não vazia (1 a 100 caracteres)
 * - role: 'user' (o padrão do domínio); passwordHash é null por padrão
 */
export const arbitraryUser: fc.Arbitrary<User> = fc
  .record({
    id: fc.uuid(),
    email: fc.emailAddress().map((e) => e.trim().toLowerCase()),
    userName: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  })
  .map((props) => new User(props));
