// oxlint JS plugin: flags raw Tailwind palette, `dark:` and arbitrary-color
// classes in string literals and template text, so the form builder's UI kit
// sticks to GovTech semantic color tokens. Enabled for the paths listed in the
// root .oxlintrc.json.
const primitiveColorClasses =
  /(?:bg|text|border(?:-[trblxy])?|ring(?:-offset)?|outline|divide|fill|stroke|decoration|from|via|to|shadow)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+)\b|\bdark:|(?:bg|text|border|ring|fill|stroke)-\[(?:#|rgba?\(|hsla?\(|oklch\(|oklab\()/;

const message =
  "Use GovTech semantic color tokens instead of raw color or dark-mode classes.";

export default {
  meta: { name: "govtech" },
  rules: {
    "semantic-colors": {
      create(context) {
        return {
          Literal(node) {
            if (
              typeof node.value === "string" &&
              primitiveColorClasses.test(node.value)
            ) {
              context.report({ node, message });
            }
          },
          TemplateElement(node) {
            if (primitiveColorClasses.test(node.value.raw)) {
              context.report({ node, message });
            }
          },
        };
      },
    },
  },
};
