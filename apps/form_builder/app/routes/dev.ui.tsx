import { createFileRoute, notFound } from "@tanstack/react-router";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "../component/ui/button";
import { Catalogue, categories } from "./-ui-catalogue";
import { useTheme } from "./content/-use-theme";
export const Route = createFileRoute("/dev/ui")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ title: "GovTech UI · Form builder" }] }),
  component: UiPreview,
});
function UiPreview() {
  const { theme, toggleTheme } = useTheme();
  return (
    <main
      data-ui-preview
      data-ui="govtech"
      data-mode={theme}
      className="min-h-dvh bg-ui-canvas font-sans text-base text-ui-default"
    >
      <header className="border-b border-ui-hairline bg-ui-base">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="text-xs text-ui-subtle">GovTech Barbados</p>
            <h1 className="mt-1 text-lg font-semibold">GovTech UI</h1>
          </div>
          <Button
            icon={theme === "light" ? MoonIcon : SunIcon}
            onClick={toggleTheme}
          >
            {theme === "light" ? "Dark appearance" : "Light appearance"}
          </Button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav
          aria-label="Component categories"
          className="flex flex-wrap content-start gap-1 lg:sticky lg:top-8 lg:h-fit lg:flex-col"
        >
          {categories.map((category) => (
            <a
              key={category}
              href={`#${category.toLowerCase().replaceAll(" ", "-")}`}
              className="rounded-md px-3 py-2 text-sm text-ui-subtle hover:bg-ui-tint hover:text-ui-default focus-visible:outline-2 focus-visible:outline-ui-brand"
            >
              {category}
            </a>
          ))}
        </nav>
        <Catalogue />
      </div>
    </main>
  );
}
