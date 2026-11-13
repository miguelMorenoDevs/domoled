import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // lg-app/ is one classic browser script with global declarations, so the root lint rules do not fit it; its tsconfig checks types.
  { ignores: ["dist/**", "dist-test/**", "node_modules/**", "lg-app/**"] },
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
