// Native scopes keep the two applications' existing CSS intact. Root declarations
// belong to each scope; no copied type scale, prefixed utilities or global public CSS.
function previewScopedCss(css: string, site: boolean) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);

  const roots = new Set([
    ":root",
    ":host",
    "html",
    ":where(html)",
    ...(site ? ["body", ":where(body)"] : []),
  ]);

  const rehomeRoots = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule)
        rule.selectorText = rule.selectorText
          .split(",")
          .map((part) =>
            roots.has(part.trim())
              ? part.trim().startsWith(":where(")
                ? ":where(:scope)"
                : ":scope"
              : part,
          )
          .join(",");

      if (rule instanceof CSSGroupingRule || rule instanceof CSSStyleRule)
        rehomeRoots(rule.cssRules);
    }
  };

  rehomeRoots(sheet.cssRules);

  const scope = site
    ? "([data-cms-site-preview]) to ([data-cms-editor-controls])"
    : "(:root, [data-cms-editor-controls]) to ([data-cms-site-preview])";

  return `@scope ${scope} {\n${Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n")}\n}`;
}

/** Fetch only trusted application CSS; activation and disposal are synchronous. */
export async function loadSitePreviewStyles(base: URL, signal: AbortSignal) {
  if (!("CSSScopeRule" in window))
    throw new Error(
      "Site preview needs a browser with CSS scope support. You can still use the writer.",
    );
  const original = document.querySelector<HTMLLinkElement | HTMLStyleElement>("#cms-stylesheet");

  if (!original?.sheet) throw new Error("The CMS stylesheet is not available for site preview.");
  // Vite's fetch response is a JS module unless the request is for a stylesheet.
  // The loaded CSSOM is already compiled, same-origin and current (including HMR).
  const editorCss = Array.from(original.sheet.cssRules, (rule) => rule.cssText).join("\n");

  const getCss = async (url: string) => {
    const response = await fetch(url, { signal, credentials: "omit" });

    if (!response.ok) throw new Error("Site preview styles could not be loaded.");

    return response.text();
  };

  const siteCss = await getCss(new URL("styles.css", base).href);
  const css = previewScopedCss(editorCss, false) + previewScopedCss(siteCss, true);

  return () => {
    const media = original.media;
    const style = document.createElement("style");
    style.dataset.cmsPreviewStyles = "";
    style.textContent = css;
    document.head.append(style);
    original.media = "not all";

    return () => {
      original.media = media;
      style.remove();
    };
  };
}
