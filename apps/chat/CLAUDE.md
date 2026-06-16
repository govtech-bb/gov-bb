# CLAUDE.md — apps/chat

The alpha.gov.bb assistant, on TanStack Start + TanStack AI. Read this before
changing anything in here.

## Don't vibecode — read the example first

These libraries (TanStack AI, Router/Start, Virtual) move fast, and the forms
contract is shared across the monorepo, so an API guessed from memory is how
subtle breakage gets in. The rule: **don't write code for a pattern you haven't
just read an example of**, and say which example/doc you followed.

Where to read — these are the authority for _how_; open them, don't recall them:

- **TanStack AI** — examples: https://github.com/TanStack/ai/tree/main/examples ·
  docs: https://github.com/TanStack/ai/tree/main/docs
  - `ts-react-chat` — the spine: streaming, tool execution, conversation state
  - `vanilla-chat` — the raw `@tanstack/ai-client` stream contract
  - `ts-react-search` — search / RAG-style UI
- **TanStack Virtual** (the virtualized message list) — example:
  https://github.com/TanStack/virtual/tree/main/examples/react/chat ·
  docs: https://github.com/TanStack/virtual/tree/main/docs
- **TanStack Start** — https://tanstack.com/start ·
  **Router** — https://tanstack.com/router

Then, before and after you write:

- **Verify against the installed version, not your memory.** Read the package's
  `.d.ts` in `node_modules` before calling an API.
