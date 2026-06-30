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
header { background: var(--teal); color: var(--white); padding: 16px 0; position: sticky; top: 0; z-index: 30; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
.header-inner { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
header h1 { margin: 0 0 4px; font-size: 20px; }
header .meta { font-size: 13px; opacity: .85; }
.controls { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.controls label { font-size: 13px; }
select { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.4); background: var(--white); color: var(--ink); }
main { max-width: 1100px; margin: 0 auto; padding: 24px; }
#search-body { padding: 4px 18px 20px; }
#srcpop { display: none; position: fixed; z-index: 60; background: var(--white); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.18); padding: 8px 11px; min-width: 210px; max-width: 320px; }
#srcpop .srctitle { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); margin-bottom: 4px; }
.srcrow { display: flex; justify-content: space-between; gap: 20px; padding: 3px 0; font-size: 13px; }
td.src[data-sources] { cursor: help; }
section { background: var(--white); border: 1px solid var(--line); border-radius: 10px; margin-bottom: 24px; overflow: hidden; }
section h2 { margin: 0; padding: 14px 18px; font-size: 16px; border-bottom: 1px solid var(--line); background: var(--teal-10); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.howto-btn { cursor: pointer; border: 1px solid var(--line); background: var(--white); color: var(--teal); border-radius: 999px; padding: 3px 11px; font-size: 12px; font-weight: 600; }
.howto-btn:hover { background: var(--teal); color: var(--white); }
[popover].howto { max-width: min(460px, 92vw); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; box-shadow: 0 16px 48px rgba(0,0,0,.22); font-size: 14px; line-height: 1.55; color: var(--ink); }
[popover].howto h3 { margin: 0 0 8px; font-size: 15px; }
[popover].howto p { margin: 0 0 8px; }
[popover].howto ul { margin: 0; padding-left: 18px; }
[popover].howto li { margin: 4px 0; }
[popover].howto code { background: var(--teal-10); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
[popover].howto::backdrop { background: rgba(0,0,0,.3); }
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
#overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); opacity: 0; pointer-events: none; transition: opacity .2s ease; z-index: 40; }
#overlay.open { opacity: 1; pointer-events: auto; }
#drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(580px, 94vw); background: var(--white); box-shadow: -8px 0 28px rgba(0,0,0,.18); transform: translateX(100%); transition: transform .25s ease; z-index: 50; overflow-y: auto; padding: 20px 22px; }
#drawer.open { transform: translateX(0); }
#drawer h3 { margin: 0 8px 4px 0; font-size: 18px; }
#drawer .sub { color: var(--muted); font-size: 13px; margin-bottom: 14px; }
.funnel { display: flex; flex-direction: column; gap: 6px; max-width: 560px; }
.stage { display: grid; grid-template-columns: 90px 1fr 120px; align-items: center; gap: 10px; font-size: 13px; }
.bar { height: 22px; background: var(--teal); border-radius: 4px; min-width: 2px; }
.bar-wrap { background: var(--teal-10); border-radius: 4px; }
.drop { color: var(--warn); font-size: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.chip { background: var(--teal-10); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
.friction, .stats { display: flex; flex-wrap: wrap; gap: 24px; margin: 14px 0; font-size: 14px; }
.friction b, .stats b { display: block; font-size: 18px; }
.stats { padding: 12px 14px; background: var(--teal-10); border-radius: 8px; }
.muted { color: var(--muted); font-weight: 400; font-size: 13px; }
table.mini { max-width: 600px; }
table.mini th, table.mini td { padding: 7px 12px; }
.banner { padding: 10px 14px; margin: 8px 0 0; background: #fdf3e7; border: 1px solid #f0d9bd; border-radius: 8px; color: var(--warn); font-size: 13px; }
.close { position: sticky; top: -20px; float: right; cursor: pointer; border: 1px solid var(--line); background: var(--white); border-radius: 6px; padding: 4px 10px; font-size: 13px; }
h4 { margin: 16px 0 6px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
`;

const CLIENT_JS = `
const fmtInt = (n) => n.toLocaleString();
const fmtPct = (n) => n.toFixed(1).replace(/\\.0$/, "") + "%";
const fmtDur = (s) => s == null ? "—" : (s >= 60 ? Math.floor(s/60) + "m " + (s%60) + "s" : s + "s");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

// Maps validation reason codes (Zod-style) to a plain-English explanation.
const REASONS = {
  required: "Required field left blank",
  invalid_format: "Invalid format (e.g. email, date, number)",
  invalid_type: "Wrong type of value",
  invalid_string: "Invalid text",
  invalid_enum_value: "Not one of the allowed options",
  too_small: "Too short / below the minimum",
  too_big: "Too long / above the maximum",
  not_multiple_of: "Not an allowed increment",
  pattern: "Doesn't match the required pattern",
  custom: "Failed a custom validation rule",
};
const reasonLabel = (code) => REASONS[code] || code;

let activeForm = null;
function presetByKey(key) { return DATA.presets.find((p) => p.key === key); }

function renderSource(sources) {
  if (!sources || !sources.length) return '<td class="muted">—</td>';
  const top = sources[0];
  const extra = sources.length > 1 ? ' <span class="muted">+' + (sources.length - 1) + '</span>' : '';
  // Carry the full list so the fixed popover can show every source on hover
  // (a data attribute escapes overflow clipping that a nested element can't).
  const data = sources.length > 1 ? ' data-sources="' + esc(JSON.stringify(sources)) + '"' : '';
  return '<td class="src"' + data + '>' + esc(top.referrer) +
    ' <span class="muted">(' + fmtInt(top.count) + ')</span>' + extra + '</td>';
}

function renderPages(p) {
  if (!p.pages.length) return '<div class="empty">No page data for this range.</div>';
  const rows = p.pages.map((r) =>
    '<tr><td>' + esc(r.path) + '</td><td class="num">' + fmtInt(r.pageviews) + '</td><td class="num">' + fmtInt(r.visitors) + '</td>' + renderSource(r.topSources) + '</tr>'
  ).join("");
  return '<div class="scroll"><table><thead><tr><th>Path</th><th class="num">Pageviews</th><th class="num">Visitors</th><th>Top source</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
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
  const totalFieldErrors = d.fieldErrors.reduce((a, f) => a + f.count, 0);
  const ofStarts = (n) => row.starts ? fmtPct(Math.round(n / row.starts * 1000) / 10) : "—";

  const stats =
    '<div class="stats">' +
      '<div>Starts<b>' + fmtInt(row.starts) + '</b></div>' +
      '<div>Completed<b>' + fmtInt(row.completes) + ' <span class="muted">(' + fmtPct(row.completionPct) + ')</span></b></div>' +
      '<div>Avg time to complete<b>' + fmtDur(row.avgDurationSeconds) + '</b></div>' +
      '<div>Field errors / start<b>' + row.avgFieldErrors + '</b></div>' +
      '<div>Total field errors<b>' + fmtInt(totalFieldErrors) + '</b></div>' +
    '</div>';

  const fields = d.fieldErrors.length
    ? '<div class="scroll"><table class="mini"><thead><tr><th>Field</th><th class="num">Errors</th><th class="num">% of starts</th><th class="num">Share</th></tr></thead><tbody>' +
      d.fieldErrors.map((f) =>
        '<tr><td>' + esc(f.field) + '</td><td class="num">' + fmtInt(f.count) + '</td><td class="num">' + ofStarts(f.count) + '</td><td class="num">' + fmtPct(totalFieldErrors ? Math.round(f.count / totalFieldErrors * 1000) / 10 : 0) + '</td></tr>'
      ).join("") + '</tbody></table></div>'
    : '<div class="empty">No field validation errors recorded.</div>';

  const totalReasons = d.errorTypes.reduce((a, t) => a + t.count, 0);
  const types = d.errorTypes && d.errorTypes.length
    ? '<div class="scroll"><table class="mini"><thead><tr><th>Why it failed</th><th>Reason code</th><th class="num">Occurrences</th><th class="num">Share</th></tr></thead><tbody>' +
      d.errorTypes.map((t) =>
        '<tr><td>' + esc(reasonLabel(t.field)) + '</td><td><code>' + esc(t.field) + '</code></td><td class="num">' + fmtInt(t.count) + '</td><td class="num">' + fmtPct(totalReasons ? Math.round(t.count / totalReasons * 1000) / 10 : 0) + '</td></tr>'
      ).join("") + '</tbody></table></div>'
    : '<div class="empty">No validation-error reasons recorded.</div>';

  return '<button class="close" onclick="closeDetail()">Close ✕</button>' +
    '<h3>' + esc(row.title) + '</h3>' +
    '<div class="sub">' + esc(formId) + ' · ' + esc(row.category) + '</div>' +
    stats +
    '<div class="friction">' +
      '<div>Step back<b>' + fmtInt(d.stepBack) + '</b></div>' +
      '<div>Step edit<b>' + fmtInt(d.stepEdit) + '</b></div>' +
      '<div>Reviewed<b>' + fmtInt(d.review) + '</b></div>' +
    '</div>' +
    '<h4>Funnel</h4><div class="funnel">' + funnel + '</div>' +
    '<h4>Field errors — which fields fail and how often</h4>' + fields +
    '<h4>Why fields fail — validation reasons</h4>' + types +
    '<p class="muted" style="margin-top:8px">Reasons are the validation type for the attempt (the event records the set of failing fields and the set of reasons, not a per-field message).</p>';
}

function queryTable(rows) {
  if (!rows.length) return '<div class="empty">No queries recorded.</div>';
  return '<div class="scroll"><table class="mini"><thead><tr><th>Query</th><th class="num">Searches</th></tr></thead><tbody>' +
    rows.map((q) => '<tr><td>' + esc(q.query) + '</td><td class="num">' + fmtInt(q.count) + '</td></tr>').join("") +
    '</tbody></table></div>';
}

function renderSearch(p) {
  const s = p.search;
  if (!s || (!s.submitTotal && !s.total)) return '<div class="empty">No search activity for this range.</div>';

  // 1) search-submit — every search-box submission.
  const sourceChips = s.submitBySource.length
    ? '<div class="chips">' + s.submitBySource.map((b) => '<span class="chip">' + esc(b.source) + ' · ' + fmtInt(b.count) + '</span>').join("") + '</div>'
    : '';
  const submitBlock =
    '<div class="stats"><div>Search submissions<b>' + fmtInt(s.submitTotal) + '</b></div></div>' +
    (sourceChips ? '<h4>By source</h4>' + sourceChips : '') +
    '<h4>Top search queries (submitted)</h4>' + queryTable(s.submitTopQueries);

  // 2) search — results-page event (search quality).
  const resultsBlock = s.total
    ? '<div class="stats">' +
        '<div>Searches with results page<b>' + fmtInt(s.total) + '</b></div>' +
        '<div>Returned no results<b>' + fmtInt(s.zeroResults) + ' <span class="muted">(' + fmtPct(s.zeroResultsPct) + ')</span></b></div>' +
      '</div>' +
      '<h4>Top queries (results page)</h4>' + queryTable(s.topQueries)
    : '<div class="empty">No results-page <code>search</code> events in this range (only submissions above).</div>';

  const note = '<div class="banner">Click-through rate is not shown: result clicks are not tracked yet. The no-results rate is the closest search-quality signal. Add a <code>search-result-click</code> event to enable true CTR.</div>';

  return '<h4>Search submissions (search-submit)</h4>' + submitBlock +
    '<h4 style="margin-top:22px">Results-page searches (search)</h4>' + resultsBlock + note;
}

function render() {
  const key = document.getElementById("preset").value;
  const p = presetByKey(key);
  document.getElementById("pages-body").innerHTML = renderPages(p);
  document.getElementById("forms-body").innerHTML = renderForms(p);
  document.getElementById("search-body").innerHTML = renderSearch(p);
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("overlay");
  if (activeForm && p.details[activeForm]) {
    drawer.innerHTML = renderDetail(p, activeForm);
    drawer.scrollTop = 0;
    drawer.classList.add("open");
    overlay.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    const tr = document.querySelector('tr.form-row[data-form="' + activeForm + '"]');
    if (tr) tr.classList.add("active");
  } else {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
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
document.getElementById("overlay").addEventListener("click", closeDetail);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
document.getElementById("preset").addEventListener("change", () => { render(); });

// Top-source hover popover: a single fixed element positioned at the cell, so
// it escapes the table's overflow clipping and lists every referrer.
const srcpop = document.getElementById("srcpop");
document.addEventListener("mouseover", (e) => {
  const td = e.target.closest("td.src[data-sources]");
  if (!td) return;
  const list = JSON.parse(td.dataset.sources);
  srcpop.innerHTML = '<div class="srctitle">All sources</div>' + list.map((s) =>
    '<div class="srcrow"><span>' + esc(s.referrer) + '</span><span class="muted">' + fmtInt(s.count) + '</span></div>'
  ).join("");
  const r = td.getBoundingClientRect();
  srcpop.style.display = "block";
  const w = srcpop.offsetWidth;
  srcpop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
  srcpop.style.top = (r.bottom + 4) + "px";
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest("td.src[data-sources]")) srcpop.style.display = "none";
});
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
  <div class="header-inner">
    <h1>Umami Analytics Report</h1>
    <div class="meta">Generated ${model.generatedAt} · ${model.timezone}</div>
    <div class="controls">
      <label for="preset">Date range</label>
      <select id="preset">${options}</select>
    </div>
  </div>
</header>
<main>
  <section>
    <h2>Top pages <button class="howto-btn" type="button" popovertarget="howto-pages">How it works</button></h2>
    <div id="pages-body"></div>
  </section>
  <section>
    <h2>Top forms <button class="howto-btn" type="button" popovertarget="howto-forms">How it works</button></h2>
    <div id="forms-body"></div>
  </section>
  <section>
    <h2>Search queries <button class="howto-btn" type="button" popovertarget="howto-search">How it works</button></h2>
    <div id="search-body"></div>
  </section>
</main>
<div id="srcpop"></div>
<div id="howto-pages" popover class="howto">
  <h3>Top pages — how it works</h3>
  <p>The most-visited landing pages over the selected range, from Umami <code>/metrics/expanded?type=url</code>, ranked by pageviews (top 10).</p>
  <ul>
    <li><b>Pageviews</b> — total page loads.</li>
    <li><b>Visitors</b> — unique visitors.</li>
    <li><b>Top source</b> — the leading referrers that drove traffic <em>to that page</em> (Umami referrer metric, filtered by <code>path</code>). <code>(direct)</code> = no referrer; <code>+N</code> means more sources (hover to see all).</li>
  </ul>
</div>
<div id="howto-forms" popover class="howto">
  <h3>Top forms — how it works</h3>
  <p>Per form over the range, ranked by starts (top 10). Counts are unique visitors who fired each form event.</p>
  <ul>
    <li><b>Starts</b> — visitors who began the form (<code>&lt;form&gt;:form-start</code>).</li>
    <li><b>Completion</b> — successful submits ÷ starts.</li>
    <li><b>Avg field errors</b> — total validation <code>errorCount</code> ÷ starts.</li>
    <li><b>Avg time</b> — mean of <code>duration_seconds</code> on successful submits (completers only; wall-clock incl. idle time; mean, so outlier-sensitive).</li>
  </ul>
  <p>Click a row for the step funnel, the fields that fail most, and <em>why</em> they fail (validation reasons such as required / invalid format / too short).</p>
</div>
<div id="howto-search" popover class="howto">
  <h3>Search queries — how it works</h3>
  <p>Two complementary signals:</p>
  <ul>
    <li><b>Search submissions</b> (<code>search-submit</code>) — every search-box submission, with the top queries and a breakdown by where the search ran (home / services / results). Empty submissions are excluded from the query list.</li>
    <li><b>Results-page searches</b> (<code>search</code>) — fired on the results page; gives the <b>no-results rate</b>. May be empty in ranges where only submissions fired.</li>
  </ul>
  <p>Click-through rate isn't available yet — result clicks aren't tracked.</p>
</div>
<div id="overlay"></div>
<aside id="drawer" aria-hidden="true"></aside>
<script>const DATA = ${embedJson(model)};</script>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}
