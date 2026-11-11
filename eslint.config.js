import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.ts"],
    rules: {
      // The rpi-led-matrix platform shim in src/led/animator.ts is intentionally untyped.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
