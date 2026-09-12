import eslint from "@eslint/js";

export default [
  {
    ignores: ["dist", "coverage", "node_modules"],
  },
  eslint.configs.recommended,
];
