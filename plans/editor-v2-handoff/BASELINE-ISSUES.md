# Verification findings

## Formula popup containment at 320px — open

- `scripts/browser/native-formula.mjs` passed during the full step-3 checkpoint, but later repeats fail at 320px on both the empty/loading candidate **and clean `39c2178b`**. This is not evidence of a regression caused by empty/loading.
- Differential test: archived the entire candidate as `scratch/empty-loading-reviewed.patch`, reversed only that patch in the isolated integration checkout (clean index/worktree at `39c2178b`), restarted Vite, reran the suite, restored the exact patch, restarted and repeated. Both runs fail identically. Original user work was never touched.
- Failure: Reference a field / Close group controls have y=856.390625 and height24 in an 844px viewport. The absolute formula popup starts at y=640.390625 and is 252px tall. A diagnostic 400ms wait leaves coordinates unchanged, ruling out a simple placement/animation wait.
- Logs: `scratch/formula-baseline-repeat.log`, `formula-candidate-restart.log`, `formula-layout-probe.log`; diagnostic screenshot `formula-layout.png`. The instrumented probe is scratch-only and keeps the original assertion.
- Do not weaken the browser assertion or call the full Wave-1 browser checkpoint green while this remains unresolved. The upcoming `popups` item includes this hand-built formula popup; diagnosis/repair must preserve keyboard editing, exact undo and no-data-loss guarantees.
