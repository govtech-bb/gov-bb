// Client bundle budgets, checked in CI by `nx run landing:size` (#3139).
// Budgets are the gzip size at the time they were set, plus 10%, measured on
// the CI build (no VITE_* env), which can differ slightly from a deploy build.
//
// The entry chunk carries its own budget because a total would miss the
// regression it exists to catch: a static import of `src/utils/markdown`
// (e.g. in src/lib/api-v2-page.ts) moves ~340 KB of remark/rehype out of the
// lazy preview-start-page chunk and into the entry every page loads, so the
// entry grows by ~100 KB gzip while the total barely moves.
//
// If a budget fails, check what grew before raising it.
export default [
  {
    name: 'Client entry',
    path: '.amplify-hosting/static/assets/index-*.js',
    gzip: true,
    limit: '403 kB',
  },
  {
    name: 'All client JS',
    path: '.amplify-hosting/static/assets/*.js',
    gzip: true,
    limit: '713 kB',
  },
]
