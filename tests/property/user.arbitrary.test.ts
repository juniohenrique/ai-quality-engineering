import { test } from "vitest";
import fc from "fast-check";
import { arbitraryUser } from "./arbitraries/user.arbitrary.js";

test('property: arbitraryUser generates valid User instances', () => {
  fc.assert(
    fc.property(arbitraryUser, (user) => {
      // email contém "@"
      if (!user.email.includes('@')) return false;
      // nome não vazio
      if (!user.userName || user.userName.trim().length === 0) return false;
      // id não vazio
      if (!user.id || user.id.trim().length === 0) return false;
      return true;
    }),
    { numRuns: 100 },
  );
});
