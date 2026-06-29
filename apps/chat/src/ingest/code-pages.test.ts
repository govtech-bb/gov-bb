import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText } from "./code-pages";

test("htmlToText: main only, ATX headings, tags stripped, entities decoded", () => {
  const html =
    `<header>SITE NAV</header>` +
    `<main id="main">` +
    `<h1>Title</h1>` +
    `<p>Hello <strong>world</strong> &amp; <a href="/x">a link</a>.</p>` +
    `<h2>A section</h2>` +
    `<ul><li>one</li><li>two</li></ul>` +
    `<script>tracker();</script>` +
    `</main>` +
    `<footer>SITE FOOTER</footer>`;
  const text = htmlToText(html);

  assert.ok(!text.includes("SITE NAV"), "drops content outside <main>");
  assert.ok(!text.includes("SITE FOOTER"), "drops the footer");
  assert.ok(!text.includes("tracker"), "drops <script>");
  assert.ok(text.includes("## A section"), "keeps h2 as an ATX heading");
  assert.ok(text.includes("Hello world"), "strips inline tags");
  assert.ok(text.includes("a link"), "keeps link text");
  assert.ok(!text.includes("&amp;") && text.includes("&"), "decodes entities");
  assert.ok(text.includes("one") && text.includes("two"), "keeps list items");
});
