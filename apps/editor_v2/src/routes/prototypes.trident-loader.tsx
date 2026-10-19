import { createFileRoute } from "@tanstack/react-router";
import { Loader } from "../ui/loader";

export const Route = createFileRoute("/prototypes/trident-loader")({
  head: () => ({ meta: [{ title: "Loader · Design preview · GovBB" }] }),
  component: LoaderPreview,
});

/** The trident loader large, at the sizes it's meant for, and on the brand surfaces. */
function LoaderPreview() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-16 p-12">
      <Loader size={224} />
      <div className="flex items-end gap-12">
        {[32, 48, 64, 96].map((size) => (
          <Loader key={size} size={size} />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-6">
        <div className="grid h-56 w-80 place-items-center rounded-lg bg-brand text-white">
          <Loader size={120} />
        </div>
        <div className="grid h-56 w-80 place-items-center rounded-lg bg-gold">
          <Loader size={120} />
        </div>
        <div className="grid h-56 w-80 place-items-center rounded-lg bg-brand-dark text-gold">
          <Loader size={120} />
        </div>
      </div>
    </main>
  );
}
