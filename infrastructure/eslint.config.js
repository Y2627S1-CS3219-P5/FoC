// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import cdkPlugin from "eslint-plugin-awscdk";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: ["cdk.out/**", "dist/**", "node_modules/**", "artifacts/**"],
  },
  {
    files: ["bin/**/*.ts", "lib/**/*.ts", "scripts/**/*.ts", "test/**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      cdkPlugin.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["test/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
]);
