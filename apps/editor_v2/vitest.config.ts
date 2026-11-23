import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

/**
 * Rewrites `import { A, B } from "<pkg>"` into one import per name, from the module that holds it.
 *
 * Vitest doesn't tree-shake, and each test file gets fresh modules, so a package index that
 * re-exports everything is evaluated in full by every file: about 0.9s for @phosphor-icons/react
 * and 0.5s for date-fns, in each of ~220 files (#3764). The app's build tree-shakes these, so only
 * tests need it. Runs after esbuild, so type-only names are already gone.
 */
function importPerName(pkg: string, moduleOf: (name: string) => string): Plugin {
  const statement = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${pkg}";?`, "g");

  return {
    name: `import-per-name:${pkg}`,
    transform(code, id) {
      if (id.includes("/node_modules/") || !code.includes(`"${pkg}"`)) return;

      return code.replace(statement, (_, names: string) =>
        names
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const [name = part, alias = name] = part.split(/\s+as\s+/);

            return `import { ${name} as ${alias} } from "${moduleOf(name)}";`;
          })
          .join("\n"),
      );
    },
  };
}

export default defineConfig({
  resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom", "@govtech-bb/react"] },
  plugins: [
    react(),
    importPerName("@phosphor-icons/react", (name) =>
      name === "IconContext"
        ? "@phosphor-icons/react/dist/lib/context"
        : `@phosphor-icons/react/dist/csr/${name}`,
    ),
    importPerName("date-fns", (name) => `date-fns/${name}`),
  ],
  test: {
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
      "scripts/*.test.ts",
      "docs/examples/*.test.ts",
    ],
    testTimeout: 30_000,
  },
});
