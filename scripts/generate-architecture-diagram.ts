// Generates the Mermaid architecture diagram in README.md.
//
// The diagram answers two questions:
//   1. Which app calls which other app at runtime?
//   2. Which external services (AWS, Postgres, EzPay, Umami) does each app hit?
//
// Shared workspace packages are deliberately hidden — they were noise on the
// previous rendering. Runtime app→app edges are inferred from URL-shaped env
// vars in each app's `.env.example` (see URL_VAR_TO_APP). External services
// are inferred from the workspace dep graph (walked transitively through
// packages/*) for SDK-detectable services, and from env var names for the rest.
//
// Deterministic — same repo state produces the same diagram, byte-for-byte.
// Offline-safe (filesystem only). Run with `pnpm generate:architecture-diagram`.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const README = join(ROOT, "README.md");
const START_MARKER = "<!-- ARCHITECTURE_DIAGRAM_START -->";
const END_MARKER = "<!-- ARCHITECTURE_DIAGRAM_END -->";

type ExternalService = {
  id: string;
  label: string;
  group: "aws" | "data" | "third_party";
};

// Runtime dep name → external service. Applied to each workspace's own
// `dependencies` AND to any dep it picks up transitively via a workspace
// package (e.g. `chat` uses AWS Secrets Manager via `@govtech-bb/aws-secrets`).
const DEP_TO_SERVICE: Record<string, ExternalService> = {
  "@aws-sdk/client-s3": { id: "aws_s3", label: "S3", group: "aws" },
  "@aws-sdk/client-sesv2": { id: "aws_ses", label: "SES", group: "aws" },
  "@aws-sdk/client-sqs": { id: "aws_sqs", label: "SQS", group: "aws" },
  "@aws-sdk/client-bedrock-runtime": {
    id: "aws_bedrock",
    label: "Bedrock",
    group: "aws",
  },
  "@aws-sdk/client-textract": {
    id: "aws_textract",
    label: "Textract",
    group: "aws",
  },
  "@aws-sdk/client-secrets-manager": {
    id: "aws_secrets_mgr",
    label: "Secrets Manager",
    group: "aws",
  },
  typeorm: { id: "postgres", label: "PostgreSQL", group: "data" },
  "drizzle-orm": { id: "postgres", label: "PostgreSQL", group: "data" },
};

// Env-var-name → external service. Used when the SDK isn't a reliable signal
// (payments, analytics) but the app still declares a runtime dep via config.
const ENV_VAR_TO_SERVICE: Record<string, ExternalService> = {
  EZPAY_BASE_URL: { id: "ezpay", label: "EzPay", group: "third_party" },
  VITE_UMAMI_WEBSITE_ID: {
    id: "umami",
    label: "Umami",
    group: "third_party",
  },
};

// Env-var-name → target app (by short package name, minus the `@govtech-bb/`
// prefix). When an app declares one of these vars in its `.env.example` we
// record an edge from that app to the target. Reverse-direction vars (e.g.
// origin allowlists like VITE_START_PAGE_EDITOR_ORIGIN, where the target
// embeds the caller) are deliberately omitted — they misrepresent traffic.
const URL_VAR_TO_APP: Record<string, string> = {
  VITE_API_URL: "api",
  VITE_FORMS_API_URL: "api",
  API_BASE_URL: "api",
  FEATURE_FLAGGING_API_URL: "api",
  RAG_URL: "api",
  BUILDER_API_URL: "form-builder-api",
  VITE_FORMS_URL: "forms",
  VITE_LANDING_URL: "landing",
  LANDING_URL: "landing",
  VITE_CHAT_URL: "chat",
};

type AppTier = "frontend" | "backend";

type Workspace = {
  name: string; // full @govtech-bb/name
  short: string; // name minus @govtech-bb/
  kind: "app" | "package";
  tier: AppTier | null; // only set for apps
  deps: string[]; // dep names from package.json (any registry)
  envVars: Set<string>; // env var names from .env.example (commented or not)
};

// A workspace app is a "frontend" if it depends on `react` in its own
// dependencies (all six SPA/SSR apps do); otherwise it's a "backend"
// (NestJS `api`, Express `form-builder-api`). react's absence is the
// cleanest deterministic signal — every frontend needs it, no backend does.
const classifyApp = (deps: string[]): AppTier =>
  deps.includes("react") ? "frontend" : "backend";

async function readWorkspace(
  kind: "app" | "package",
  dirName: string,
  entryName: string,
): Promise<Workspace | null> {
  const pkgPath = join(ROOT, dirName, entryName, "package.json");
  let raw: string;
  try {
    raw = await readFile(pkgPath, "utf8");
  } catch {
    return null;
  }
  const pkg = JSON.parse(raw) as {
    name?: string;
    dependencies?: Record<string, string>;
  };
  if (!pkg.name) return null;
  const deps = Object.keys(pkg.dependencies ?? {});
  const envVars = new Set<string>();
  if (kind === "app") {
    try {
      const envText = await readFile(
        join(ROOT, dirName, entryName, ".env.example"),
        "utf8",
      );
      for (const line of envText.split("\n")) {
        const m = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
        if (m) envVars.add(m[1]);
      }
    } catch {
      // no .env.example — leave envVars empty
    }
  }
  return {
    name: pkg.name,
    short: pkg.name.replace(/^@govtech-bb\//, ""),
    kind,
    tier: kind === "app" ? classifyApp(deps) : null,
    deps,
    envVars,
  };
}

async function readAllWorkspaces(
  kind: "app" | "package",
  dirName: string,
): Promise<Workspace[]> {
  const entries = await readdir(join(ROOT, dirName), { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map((e) => readWorkspace(kind, dirName, e.name)),
  );
  return results
    .filter((w): w is Workspace => w !== null)
    .sort((a, b) => a.short.localeCompare(b.short));
}

// Walk workspace deps transitively from `app` and collect every non-workspace
// dep encountered — that's the effective runtime dep set for the app.
function collectEffectiveDeps(
  app: Workspace,
  byName: Map<string, Workspace>,
): Set<string> {
  const seen = new Set<string>();
  const externalDeps = new Set<string>();
  const stack: Workspace[] = [app];
  while (stack.length > 0) {
    const ws = stack.pop()!;
    if (seen.has(ws.name)) continue;
    seen.add(ws.name);
    for (const dep of ws.deps) {
      const workspaceDep = byName.get(dep);
      if (workspaceDep) stack.push(workspaceDep);
      else externalDeps.add(dep);
    }
  }
  return externalDeps;
}

const toId = (s: string): string => s.replace(/[^A-Za-z0-9]/g, "_");

function renderDiagram(apps: Workspace[], packages: Workspace[]): string {
  const byName = new Map<string, Workspace>();
  for (const w of [...apps, ...packages]) byName.set(w.name, w);
  const appByShort = new Map(apps.map((a) => [a.short, a]));

  type AppEdges = {
    services: Set<string>; // ExternalService.id
    apps: Set<string>; // target app short name
  };
  const edges = new Map<string, AppEdges>();
  const usedServices = new Map<string, ExternalService>();

  for (const app of apps) {
    const services = new Set<string>();
    const targetApps = new Set<string>();

    const effectiveDeps = collectEffectiveDeps(app, byName);
    for (const dep of effectiveDeps) {
      const svc = DEP_TO_SERVICE[dep];
      if (svc) {
        services.add(svc.id);
        usedServices.set(svc.id, svc);
      }
    }
    for (const envVar of app.envVars) {
      const svc = ENV_VAR_TO_SERVICE[envVar];
      if (svc) {
        services.add(svc.id);
        usedServices.set(svc.id, svc);
      }
      const target = URL_VAR_TO_APP[envVar];
      if (target && target !== app.short && appByShort.has(target)) {
        targetApps.add(target);
      }
    }
    edges.set(app.short, { services, apps: targetApps });
  }

  const groupOrder: ExternalService["group"][] = ["aws", "data", "third_party"];
  const groupLabels: Record<ExternalService["group"], string> = {
    aws: "AWS",
    data: "Data stores",
    third_party: "Third-party",
  };
  const servicesByGroup = new Map<
    ExternalService["group"],
    ExternalService[]
  >();
  for (const svc of usedServices.values()) {
    const list = servicesByGroup.get(svc.group) ?? [];
    list.push(svc);
    servicesByGroup.set(svc.group, list);
  }
  for (const list of servicesByGroup.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  const lines: string[] = [];
  lines.push("```mermaid");
  lines.push("---");
  lines.push("config:");
  lines.push("  layout: elk");
  lines.push("---");
  lines.push("%% Auto-generated by scripts/generate-architecture-diagram.ts.");
  lines.push("%% Run `pnpm generate:architecture-diagram` to regenerate.");
  lines.push("flowchart TB");

  const frontends = apps.filter((a) => a.tier === "frontend");
  const backends = apps.filter((a) => a.tier === "backend");
  lines.push("  subgraph frontends_group [Frontends]");
  lines.push("    direction LR");
  for (const a of frontends) lines.push(`    ${toId(a.short)}["${a.short}"]`);
  lines.push("  end");
  lines.push("  subgraph backends_group [Backends]");
  lines.push("    direction LR");
  for (const a of backends) lines.push(`    ${toId(a.short)}["${a.short}"]`);
  lines.push("  end");

  const hasAnyServices = groupOrder.some(
    (g) => (servicesByGroup.get(g)?.length ?? 0) > 0,
  );
  if (hasAnyServices) {
    lines.push("  subgraph externals_group [External services]");
    lines.push("    direction LR");
    for (const group of groupOrder) {
      const list = servicesByGroup.get(group);
      if (!list || list.length === 0) continue;
      lines.push(`    subgraph ${group}_group [${groupLabels[group]}]`);
      // TB inside each nested group so the three groups become narrow
      // columns; the outer externals_group is LR so the columns sit
      // side-by-side and the whole external services row reads landscape.
      lines.push("      direction TB");
      for (const svc of list) lines.push(`      ${svc.id}["${svc.label}"]`);
      lines.push("    end");
    }
    lines.push("  end");
  }

  lines.push("");
  for (const app of apps) {
    const from = toId(app.short);
    const e = edges.get(app.short)!;
    for (const target of [...e.apps].sort()) {
      lines.push(`  ${from} --> ${toId(target)}`);
    }
  }
  lines.push("");
  for (const app of apps) {
    const from = toId(app.short);
    const e = edges.get(app.short)!;
    for (const svcId of [...e.services].sort()) {
      lines.push(`  ${from} -.-> ${svcId}`);
    }
  }

  lines.push("");
  lines.push("  classDef frontend fill:#eaf0ff,stroke:#0b5cff,color:#0b3fb5;");
  lines.push("  classDef backend fill:#efe7ff,stroke:#6a3fd6,color:#3a1f8a;");
  lines.push("  classDef aws fill:#fff4e5,stroke:#c07a00,color:#5c3800;");
  lines.push("  classDef data fill:#e6f4ea,stroke:#137333,color:#0d5223;");
  lines.push("  classDef tp fill:#fce8f4,stroke:#b8156b,color:#6b0e42;");
  const frontendIds = frontends.map((a) => toId(a.short)).join(",");
  const backendIds = backends.map((a) => toId(a.short)).join(",");
  if (frontendIds) lines.push(`  class ${frontendIds} frontend;`);
  if (backendIds) lines.push(`  class ${backendIds} backend;`);
  for (const group of groupOrder) {
    const list = servicesByGroup.get(group);
    if (!list || list.length === 0) continue;
    const ids = list.map((s) => s.id).join(",");
    const cls = group === "third_party" ? "tp" : group;
    lines.push(`  class ${ids} ${cls};`);
  }

  // Tint each tier's container with a pale wash in the tier's hue so the
  // groupings read at a glance without competing with the nodes themselves.
  if (frontends.length > 0) {
    lines.push(
      "  style frontends_group fill:#f0f5ff,stroke:#0b5cff,color:#0b3fb5;",
    );
  }
  if (backends.length > 0) {
    lines.push(
      "  style backends_group fill:#f4eeff,stroke:#6a3fd6,color:#3a1f8a;",
    );
  }
  if (hasAnyServices) {
    lines.push(
      "  style externals_group fill:#f7f7f2,stroke:#5b6470,color:#1a1a1a;",
    );
    const groupStyles: Record<ExternalService["group"], string> = {
      aws: "fill:#fff9ef,stroke:#c07a00,color:#5c3800",
      data: "fill:#eef6f0,stroke:#137333,color:#0d5223",
      third_party: "fill:#fdeff5,stroke:#b8156b,color:#6b0e42",
    };
    for (const group of groupOrder) {
      const list = servicesByGroup.get(group);
      if (!list || list.length === 0) continue;
      lines.push(`  style ${group}_group ${groupStyles[group]};`);
    }
  }

  lines.push("```");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const [apps, packages] = await Promise.all([
    readAllWorkspaces("app", "apps"),
    readAllWorkspaces("package", "packages"),
  ]);

  const diagram = renderDiagram(apps, packages);

  const readme = await readFile(README, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(
      `README.md is missing the ${START_MARKER} / ${END_MARKER} markers.`,
    );
  }
  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);
  const next = `${before}\n\n${diagram}\n\n${after}`;
  if (next === readme) {
    console.log("Architecture diagram already up to date.");
    return;
  }
  await writeFile(README, next, "utf8");
  console.log(
    `Updated architecture diagram in README.md (${apps.length} apps).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
