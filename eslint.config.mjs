import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

// NB: eslint-plugin-react (полный набор JSX-правил) пока несовместим с
// ESLint 10 — оставляем react-hooks и @next/next/* как минимально нужные.
// Когда eslint-plugin-react выпустит совместимую версию — вернём recommended.

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/generated/**",
      "**/.turbo/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...(config.languageOptions?.parserOptions ?? {}),
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  })),
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-misused-promises": ["error", { "checksVoidReturn": false }],
      "@typescript-eslint/no-floating-promises": "error"
    }
  },
  // Fastify-сервисы: handler'ы фреймворка обязаны быть async (контракт),
  // даже если тело синхронное. Иначе пришлось бы по всему коду писать
  // `// eslint-disable-next-line` — выключаем правило точечно по файлам.
  {
    files: [
      "apps/api/src/**/*.ts",
      "apps/jobs/src/**/*.ts",
      "apps/wa-worker/src/**/*.ts"
    ],
    rules: {
      "@typescript-eslint/require-await": "off"
    }
  },
  // React/Next правила — только для apps/web (избегаем ложных срабатываний
  // в backend-пакетах, где нет JSX).
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      // Слишком шумное правило в react-hooks v7: ругается на любой setState
      // внутри useEffect, даже на легитимный (например, синхронизация state
      // с pathname / search params на mount). Отключаем глобально.
      "react-hooks/set-state-in-effect": "off"
    }
  }
);
