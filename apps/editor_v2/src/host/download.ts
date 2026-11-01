export function download(text: string, name = "form-source.md") {
  const url = URL.createObjectURL(
    new Blob([text], {
      type: name.endsWith(".json") ? "application/json" : "text/markdown;charset=utf-8",
    }),
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
