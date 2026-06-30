// Pure HTML rendering for the analytics report. Takes the aggregated
// ReportModel and returns a single self-contained HTML document (inline CSS +
// JS, data embedded as JSON, zero external requests).
import type { ReportModel } from "./types";

/** Safely embed JSON inside a <script> tag (neutralise `</script>` and friends). */
function embedJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const STYLE = `
:root {
  --teal: #0b6b6b; --teal-10: #e6f2f2; --ink: #1a1a1a; --muted: #5a6a6a;
  --line: #d7e0e0; --bg: #f7fafa; --white: #fff; --warn: #b3541e;
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); background: var(--bg); }
header { background: var(--teal); color: var(--white); padding: 20px 24px; }
header h1 { margin: 0 0 4px; font-size: 20px; }
header .meta { font-size: 13px; opacity: .85; }
.controls { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.controls label { font-size: 13px; }
select { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.4); background: var(--white); color: var(--ink); }
main { max-width: 1100px; margin: 0 auto; padding: 24px; }
section { background: var(--white); border: 1px solid var(--line); border-radius: 10px; margin-bottom: 24px; overflow: hidden; }
section h2 { margin: 0; padding: 14px 18px; font-size: 16px; border-bottom: 1px solid var(--line); background: var(--teal-10); }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tbody tr.form-row { cursor: pointer; }
tbody tr.form-row:hover { background: var(--teal-10); }
tbody tr.form-row.active { background: var(--teal-10); }
.cat { color: var(--muted); font-size: 12px; }
.empty { padding: 18px; color: var(--muted); }
#detail { padding: 18px; border-top: 2px solid var(--teal); }
#detail h3 { margin: 0 0 4px; font-size: 16px; }
#detail .sub { color: var(--muted); font-size: 13px; margin-bottom: 14px; }
.funnel { display: flex; flex-direction: column; gap: 6px; max-width: 560px; }
.stage { display: grid; grid-template-columns: 90px 1fr 120px; align-items: center; gap: 10px; font-size: 13px; }
.bar { height: 22px; background: var(--teal); border-radius: 4px; min-width: 2px; }
.bar-wrap { background: var(--teal-10); border-radius: 4px; }
.drop { color: var(--warn); font-size: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.chip { background: var(--teal-10); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
.friction { display: flex; gap: 24px; margin: 14px 0; font-size: 14px; }
.friction b { display: block; font-size: 18px; }
.close { float: right; cursor: pointer; border: 1px solid var(--line); background: var(--white); border-radius: 6px; padding: 4px 10px; font-size: 13px; }
h4 { margin: 16px 0 6px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
`;

const CLIENT_JS = `
const fmtInt = (n) => n.toLocaleString();
const fmtPct = (n) => n.toFixed(1).replace(/\\.0$/, "") + "%";
const fmtDur = (s) => s == null ? "—" : (s >= 60 ? Math.floor(s/60) + "m " + (s%60) + "s" : s + "s");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

let activeForm = null;
function presetByKey(key) { return DATA.presets.find((p) => p.key === key); }

function renderPages(p) {
  if (!p.pages.length) return '<div class="empty">No page data for this range.</div>';
  const rows = p.pages.map((r) =>
    '<tr><td>' + esc(r.path) + '</td><td class="num">' + fmtInt(r.pageviews) + '</td><td class="num">' + fmtInt(r.visitors) + '</td></tr>'
  ).join("");
  return '<div class="scroll"><table><thead><tr><th>Path</th><th class="num">Pageviews</th><th class="num">Visitors</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderForms(p) {
  if (!p.forms.length) return '<div class="empty">No form data for this range.</div>';
  const rows = p.forms.map((r) =>
    '<tr class="form-row" data-form="' + esc(r.formId) + '">' +
      '<td>' + esc(r.title) + '<div class="cat">' + esc(r.category) + '</div></td>' +
      '<td class="num">' + fmtInt(r.starts) + '</td>' +
      '<td class="num">' + fmtPct(r.completionPct) + '</td>' +
      '<td class="num">' + r.avgFieldErrors + '</td>' +
      '<td class="num">' + fmtDur(r.avgDurationSeconds) + '</td>' +
    '</tr>'
  ).join("");
  return '<div class="scroll"><table><thead><tr><th>Form</th><th class="num">Starts</th><th class="num">Completion</th><th class="num">Avg field errors</th><th class="num">Avg time</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderDetail(p, formId) {
  const d = p.details[formId];
  const row = p.forms.find((f) => f.formId === formId);
  if (!d || !row) return "";
  const max = Math.max(1, ...d.funnel.map((s) => s.count));
  const funnel = d.funnel.map((s) =>
    '<div class="stage"><span>' + esc(s.label) + '</span>' +
    '<span class="bar-wrap"><span class="bar" style="width:' + (100 * s.count / max) + '%"></span></span>' +
    '<span class="num">' + fmtInt(s.count) + (s.dropoffPct ? ' <span class="drop">-' + fmtPct(s.dropoffPct) + '</span>' : '') + '</span></div>'
  ).join("");
  const fields = d.fieldErrors.length
    ? '<div class="chips">' + d.fieldErrors.map((f) => '<span class="chip">' + esc(f.field) + ' · ' + fmtInt(f.count) + '</span>').join("") + '</div>'
    : '<div class="empty">No field validation errors recorded.</div>';
  return '<button class="close" onclick="closeDetail()">Close ✕</button>' +
    '<h3>' + esc(row.title) + '</h3>' +
    '<div class="sub">' + esc(formId) + ' · ' + esc(row.category) + '</div>' +
    '<div class="friction">' +
      '<div>Step back<b>' + fmtInt(d.stepBack) + '</b></div>' +
      '<div>Step edit<b>' + fmtInt(d.stepEdit) + '</b></div>' +
      '<div>Reviewed<b>' + fmtInt(d.review) + '</b></div>' +
    '</div>' +
    '<h4>Funnel</h4><div class="funnel">' + funnel + '</div>' +
    '<h4>Most error-prone fields</h4>' + fields;
}

function render() {
  const key = document.getElementById("preset").value;
  const p = presetByKey(key);
  document.getElementById("pages-body").innerHTML = renderPages(p);
  document.getElementById("forms-body").innerHTML = renderForms(p);
  const detail = document.getElementById("detail");
  if (activeForm && p.details[activeForm]) {
    detail.hidden = false;
    detail.innerHTML = renderDetail(p, activeForm);
    const tr = document.querySelector('tr.form-row[data-form="' + activeForm + '"]');
    if (tr) tr.classList.add("active");
  } else {
    detail.hidden = true;
    activeForm = null;
  }
}

function closeDetail() { activeForm = null; render(); }

document.addEventListener("click", (e) => {
  const tr = e.target.closest("tr.form-row");
  if (!tr) return;
  activeForm = activeForm === tr.dataset.form ? null : tr.dataset.form;
  render();
});
document.getElementById("preset").addEventListener("change", () => { render(); });
render();
`;

export function renderReport(model: ReportModel): string {
  const options = model.presets
    .map((p) => `<option value="${p.key}">${p.label}</option>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Umami Analytics Report</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>Umami Analytics Report</h1>
  <div class="meta">Generated ${model.generatedAt} · ${model.timezone}</div>
  <div class="controls">
    <label for="preset">Date range</label>
    <select id="preset">${options}</select>
  </div>
</header>
<main>
  <section><h2>Top pages</h2><div id="pages-body"></div></section>
  <section>
    <h2>Top forms</h2>
    <div id="forms-body"></div>
    <div id="detail" hidden></div>
  </section>
</main>
<script>const DATA = ${embedJson(model)};</script>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}
