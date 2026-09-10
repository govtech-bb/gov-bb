import { useEffect, useState } from "react";
import { File01Icon } from "hugeicons-react";

// Weak keys release the cached first page when the conversation releases its File.
const pages = new WeakMap<File, Promise<Blob>>();
function pdfThumbnail(file: File) {
  let page = pages.get(file);
  if (!page) {
    page = (async () => {
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const task = pdfjs.getDocument({
        data: await file.arrayBuffer(),
      });
      try {
        const pdf = await task.promise;
        const first = await pdf.getPage(1);
        const base = first.getViewport({ scale: 1 });
        const viewport = first.getViewport({
          scale: 160 / Math.max(base.width, base.height),
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await first.render({ canvas, viewport }).promise;
        return await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Unable to render PDF preview"));
          }, "image/png");
        });
      } finally {
        await task.destroy();
      }
    })();
    pages.set(file, page);
  }
  return page;
}

export function FileThumbnail({
  file,
  name,
  type,
}: {
  file?: File;
  name: string;
  type?: string;
}) {
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setPreview("");
    setLoading(false);
    if (!file) return;
    if (["image/png", "image/jpeg"].includes(file.type)) {
      const type = file.type === "image/png" ? "image/png" : "image/jpeg";
      const url = URL.createObjectURL(new Blob([file], { type }));
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    if (file.type !== "application/pdf") return;
    let active = true;
    let url: string | undefined;
    setLoading(true);
    void pdfThumbnail(file)
      .then(
        (blob) => {
          if (!active) return;
          url = URL.createObjectURL(blob);
          setPreview(url);
        },
        () => {},
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  const extension =
    type === "application/pdf"
      ? "PDF"
      : type === "image/png"
        ? "PNG"
        : type === "image/jpeg"
          ? "JPG"
          : name.split(".").at(-1)?.toUpperCase();
  return (
    <span className="flex block-12.5 inline-11.5 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[5px] border border-ui-line bg-ui-base text-[9px] font-[650] text-ui-default [&_img]:block-full [&_img]:inline-full [&_img]:object-cover">
      {preview ? (
        <img
          src={preview}
          alt={`Preview of ${name}`}
          onError={() => setPreview("")}
        />
      ) : loading ? (
        <span
          className="block-3 inline-3 rounded-full border-[1.5px] border-ui-line border-t-ui-default motion-safe:animate-[spin_900ms_linear_infinite]"
          role="status"
          aria-label={`Loading preview of ${name}`}
        />
      ) : (
        <>
          <File01Icon size={21} aria-hidden="true" />

          <span>{extension}</span>
        </>
      )}
    </span>
  );
}
