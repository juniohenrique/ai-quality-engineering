import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isValidEmail, isNonEmptyString } from "../../src/utils/validators.js";

describe("isValidEmail — propriedades", () => {
  const fcOptions = { numRuns: 100 } as const;

  /**
   * Determinismo: mesma entrada produz o mesmo resultado.
   */
  it("é determinística: mesma entrada → mesmo output", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const first = isValidEmail(input);
        const second = isValidEmail(input);
        expect(first).toBe(second);
      }),
      fcOptions,
    );
  });

  /**
   * Emails válidos devem passar.
   */
  it("emails válidos passam", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        expect(isValidEmail(email)).toBe(true);
      }),
      fcOptions,
    );
  });

  /**
   * Strings vazias ou apenas espaços devem falhar.
   */
  it("strings vazias falham", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
  });

  /**
   * Entradas que não são emails devem falhar.
   */
  it("entradas não‑email falham", () => {
    fc.assert(
      fc.property(
        // gerar strings que não são emails simples
        fc.string().filter((s) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
        (str) => {
          // se a string contém "@" mas não satisfaz regras básicas, deve ser false
          return isValidEmail(str) === false;
        },
      ),
      fcOptions,
    );
  });
});

describe("isNonEmptyString — propriedades", () => {
  const fcOptions = { numRuns: 100 } as const;

  it("não lança exceção para nenhum input", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        // função nunca deve lançar
        isNonEmptyString(input);
        return true;
      }),
      fcOptions,
    );
  });

  it("strings vazias ou apenas espaços falham", () => {
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString("   ")).toBe(false);
  });

  it("strings não vazias passam", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (s) => {
          expect(isNonEmptyString(s)).toBe(true);
        },
      ),
      fcOptions,
    );
  });
});
