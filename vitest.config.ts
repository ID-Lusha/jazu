import { defineConfig } from "vitest/config";

// Корневой vitest-конфиг для всех пакетов monorepo.
// Каждый пакет, который хочет иметь тесты, объявляет в своём package.json:
//   "test": "vitest run"
//   "test:watch": "vitest"
// и пишет тесты рядом с кодом: `src/**/*.test.ts`.
//
// Глобальной БД / Redis для unit-тестов мы НЕ используем — всё через моки.
// Если когда-то понадобятся integration-тесты с реальной БД — заведём
// отдельный `vitest.integration.config.ts` и testcontainers.

export default defineConfig({
  test: {
    // Юнит-тесты — рядом с кодом, в src/**.
    include: ["**/src/**/*.{test,spec}.ts", "**/src/**/*.{test,spec}.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/generated/**"],
    environment: "node",
    // Изолируем модули между файлами, чтобы случайные глобальные state'ы
    // (типа initSentry с initialized=true) не текли между тестами.
    isolate: true,
    // По умолчанию 5s — для нашей логики хватает с запасом.
    testTimeout: 5_000,
    // Покрытие включается по требованию: `pnpm test -- --coverage`.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["**/src/**/*.ts", "**/src/**/*.tsx"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/generated/**",
        "**/dist/**"
      ]
    }
  }
});
