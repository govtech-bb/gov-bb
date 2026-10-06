# Page Markdown regression fixtures

These 16 files retain the original bytes and SHA-256 hashes of selected GovBB pages captured on 5 October 2026. `manifest.json` pins three visual regression pages and all 13 source-only cases. Do not regenerate these originals to make a test pass.

The source-only pages contain HTML comments, specialist components or raw HTML. Tests explicitly identify those files and verify that their original source is preserved.

The birth-certificate entry and start pages cover multi-block numbered instructions and implicit Start-link destinations. The pension entry page covers tables. Additional inline test fixtures cover the supported notice, details and action-group directives.

The same test suite also reads every Markdown page directly from `apps/landing/src/content` in this GovBB workspace. That integration check verifies current content through import, export and metadata edits without keeping a second full copy. Changes to the landing content are test inputs for Nx; the retained fixtures provide fixed regression cases independently of those edits.
