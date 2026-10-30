import { createRoot } from "react-dom/client";
import { PagePreview } from "../../src/pages/preview";
import { govbbPageEditor } from "../../src/presets/govbb-page";
import "../../index.css";
import "../../src/pages/page.css";

const source =
  ':::action{href="/apply"}\nApply now\n:::\n\n:::table[Fees]{numeric-columns="2"}\n| Service | Cost |\n| --- | --- |\n| Copy | 50 |\n:::';

const host = document.getElementById("app");

if (!host) throw new Error("Page preview fixture needs its mount point");

createRoot(host).render(<PagePreview source={source} definition={govbbPageEditor} />);
