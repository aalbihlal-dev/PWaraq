# Waraq 1.0 — notes for Claude (read first; keep this file short)

Arabic/English PDF studio. Owner: Abdullah (short messages, Arabic/English; wants action + screenshots, plain summaries).
Full context: `../HANDOVER-NEXT-CHAT.md` (status, rules, folder map) and `PLAN.md` (what is done / next). Read only
the parts you need.

## Rules
- Never publish/upload/push/buy without the owner's yes. Public repo `../PWaraq` (github.com/tshi-dev/PWaraq): update
  only when asked — `git -C ../PWaraq subtree pull --prefix=next ../waraq-next master`, scan, `git push`.
- Commit inside THIS repo only: `git -C "<waraq-next path>" commit` — the repo-local author is the owner (tshi-dev);
  never pass `-c user.name="Claude"`, no session links. Message ends `Co-Authored-By: Claude Fable 5.1
  <noreply@anthropic.com>` (Claude = contributor). Push only when tested and ready, after the owner's yes. The parent
  folder is an EMPTY git repo — never run git add/commit there (use `git -C`).
- Design: tokens only in `src/styles/tokens.css`; type 12/14/16/18/20/24/32/40, contrast ≥ 4.5, controls ≥ 36 px,
  8 px gaps, sentence case; app UI in Waraq colours (paper #fafbf8, green #15775d, mint #eaf3eb, ink #233c36);
  user documents (covers etc.) may use any colour. Strings EN+AR in `src/lib/i18n.svelte.ts` (check for duplicate keys).
- Drawings must stay 100 % crisp; whole-document engine jobs use `any: true` (idle or restarted worker).

## Code map
- `src/lib/engine/` — MuPDF WASM worker pool (`pool.ts`, `worker.ts`); pure, Node-testable: `assemble.ts` (build PDFs),
  `textpage.ts` (real Arabic text, ToUnicode), `designs.ts` (cover/section/paper pages), `tools.ts` (crop, numbers,
  watermark, compress, protect), `editpage.ts`, `sign.ts`, `ownfont.ts` (HarfBuzz).
- `src/components/` — `Workspace` (tasks), `Organize` + `PageGrid` (+ `CropPanel`), `Portfolio`, `PageEditor`,
  `Sign`, `DocTools` (Edit→Whole document, Convert, Protect), `Viewer`, `Thumbnails`. `src/lib/portfolio.ts` (data/build).

## Commands (run pnpm from PowerShell: `$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path`)
- `pnpm check` (0/0) · `pnpm test:unit` (engine, Node) · `npx playwright test` (Edge journeys; `PREVIEW=1` after
  `pnpm build` tests the build) · screenshots: `npx playwright test -c tools/dev/tour.config.ts`.
- Owner's preview: `../Waraq 1.0 preview.cmd`.

## Pitfalls (cost time before)
- Git Bash / heredocs eat backslashes (`\n`, `\\`): for code with escapes use the Edit tool, or Python with `chr(92)`.
- Playwright wipes `test-results/` on every run: copy screenshots to `../Archive-2026-10-12/screenshots/` right after.
- Svelte `$state` objects can't be posted to the worker: pass plain copies (`[...arr]`, `$state.snapshot`).
- `.cell` page bar and section buttons share names with other buttons: use exact names / scoped locators in tests.
- Keep the design audit (`tests/e2e/audit.spec.ts`) green for every new screen, English and Arabic.
- Other sessions may be editing this same folder: commit named files (`git commit -- <paths>`), never `-a`.
