import { defineConfig, globalIgnores } from "eslint/config";
import nx from "@nx/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([globalIgnores(["**/*"]), {
    plugins: {
        "@nx": nx,
    },
}, {
    files: ["**/*.ts", "**/*.tsx"],
    extends: compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"),

    languageOptions: {
        parser: tsParser,
    },

    rules: {},
}]);