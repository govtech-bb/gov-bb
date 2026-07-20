import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression tripwire for the unguarded-admin-controller bug (#11 / #1406,
 * ADR 0061): apps/api's admin endpoints originally shipped with only a
 * Swagger `@ApiBearerAuth()` decorator and no code-level auth. `AdminTokenGuard`
 * fixed the known controllers, but it's applied per-controller via
 * `@UseGuards(AdminTokenGuard)` (or `@UseGuards(new AdminTokenGuard(...))`) —
 * an opt-in, not something enforced by the framework. Nothing stops the next
 * `admin/*` controller from being added without it, repeating the original bug.
 *
 * This spec scans the filesystem for `*.controller.ts` files (deliberately
 * NOT importing them, so it needs no Nest bootstrapping and catches a new
 * controller regardless of whether it's wired into a module yet), flags any
 * whose `@Controller(...)` path starts with `admin`, and fails if that file's
 * source doesn't reference `AdminTokenGuard`.
 *
 * If you're adding a genuinely, intentionally unauthenticated admin route,
 * don't weaken this spec — move it off the `admin/` path prefix instead.
 */

const SRC_ROOT = join(__dirname, "..", "..");

function findControllerFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...findControllerFiles(fullPath));
    } else if (
      entry.endsWith(".controller.ts") &&
      !entry.endsWith(".spec.ts")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

// Limitation: only matches a string-literal @Controller argument. An
// object-config form (`@Controller({ path: "admin/x" })`) or a template
// literal would slip past the scan — keep admin controllers on plain string
// paths.
function isAdminController(content: string): boolean {
  return /@Controller\(\s*["']admin(?:\/|["'])/.test(content);
}

// Requires AdminTokenGuard INSIDE a @UseGuards(...) decorator — a mere import
// or a "SECURITY: Authenticated by AdminTokenGuard" comment left behind after
// the decorator was removed must not count as guarded.
function hasAdminTokenGuard(content: string): boolean {
  return /@UseGuards\(\s*(?:new\s+)?AdminTokenGuard\b/.test(content);
}

describe("isAdminController", () => {
  it("matches a controller whose path starts with admin/", () => {
    expect(isAdminController('@Controller("admin/drafts")')).toBe(true);
  });

  it("matches a controller whose path is exactly admin", () => {
    expect(isAdminController('@Controller("admin")')).toBe(true);
  });

  it("matches the single-quote variant", () => {
    expect(isAdminController("@Controller('admin/form-definitions')")).toBe(
      true,
    );
  });

  it("does not match a non-admin controller", () => {
    expect(isAdminController('@Controller("forms")')).toBe(false);
  });

  it("does not match a controller whose path merely contains admin elsewhere", () => {
    expect(isAdminController('@Controller("form-admin-things")')).toBe(false);
  });
});

describe("hasAdminTokenGuard", () => {
  it("is true for a controller guarded via the class reference", () => {
    expect(
      hasAdminTokenGuard(
        '@UseGuards(AdminTokenGuard)\n@Controller("admin/drafts")',
      ),
    ).toBe(true);
  });

  it("is true for a controller guarded via an instance", () => {
    expect(
      hasAdminTokenGuard(
        '@UseGuards(new AdminTokenGuard("FOO_TOKEN"))\n@Controller("admin/drafts")',
      ),
    ).toBe(true);
  });

  it("is true when the @UseGuards call wraps onto multiple lines", () => {
    expect(
      hasAdminTokenGuard(
        '@UseGuards(\n  new AdminTokenGuard("FOO_TOKEN", "BAR_TOKEN"),\n)\n@Controller("admin/drafts")',
      ),
    ).toBe(true);
  });

  it("is false for an unguarded admin controller", () => {
    expect(hasAdminTokenGuard('@Controller("admin/drafts")')).toBe(false);
  });

  it("is false when AdminTokenGuard appears only in an import", () => {
    expect(
      hasAdminTokenGuard(
        'import { AdminTokenGuard } from "@/common/guards/admin-token.guard";\n@Controller("admin/drafts")',
      ),
    ).toBe(false);
  });

  it("is false when AdminTokenGuard appears only in a comment", () => {
    expect(
      hasAdminTokenGuard(
        '// SECURITY: Authenticated by AdminTokenGuard\n@Controller("admin/drafts")',
      ),
    ).toBe(false);
  });
});

describe("admin controller guard coverage", () => {
  const controllerFiles = findControllerFiles(SRC_ROOT);
  const adminControllerFiles = controllerFiles.filter((file) =>
    isAdminController(readFileSync(file, "utf-8")),
  );

  it("finds at least the known admin controllers", () => {
    // Guards the tripwire itself: if this drops below 2, either a controller
    // was deleted/renamed or directories moved in a way that broke the scan —
    // the scan finding fewer controllers than expected is itself a signal
    // this spec has silently stopped covering what it should.
    expect(adminControllerFiles.length).toBeGreaterThanOrEqual(2);
  });

  if (adminControllerFiles.length > 0) {
    it.each(adminControllerFiles)(
      "%s is authenticated by AdminTokenGuard",
      (file: string) => {
        const content = readFileSync(file, "utf-8");
        expect(hasAdminTokenGuard(content)).toBe(true);
      },
    );
  }
});
