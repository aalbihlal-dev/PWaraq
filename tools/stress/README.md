# `pnpm stress` — stress pipeline with (almost) no tokens

Scripts do all the work; a person (or a cheap model, `triage-prompt.md`) reads one page: `.stress-cache/stress-report.md`.

```
pnpm stress:quick                       # 10 % deterministic sample, a few minutes at most
pnpm stress                             # everything (unit, edit, ocr, write)
node tools/stress/run.mjs --no-deep     # skip the second readers (faster; MuPDF-only lines show as minor)
node tools/stress/run.mjs --e2e         # + the Playwright journeys (slow)
node tools/stress/run.mjs --update-baseline   # record this full run as tests/stress/baseline.json
pnpm test:stress                        # tests of the orchestrator itself (tiny fake suites, no corpus)
```
Other flags: `--sample 0.25`, `--suites edit,ocr`, `--jobs N` (default: all cores but 2), `--seed s`, `--resume` (continue the
unfinished run: finished shards are re-used, crashed ones re-run), `--strict` (any major is a breach), `--generate`
(rebuild the corpus: `tools/arabic/make-corpus.mjs`, `make-scans.mjs`), `--fetch` (public OCR sets: `tools/get-ocr-set.mjs`).

## Stages
1. **Corpus** — the fixtures already in the repo (`tests/fixtures/arabic`, `.../ocr`, `.../arabic-create`). `--generate` /
   `--fetch` rebuild or download them; downloads go to `.stress-cache/` only (git-ignored, it writes its own `.gitignore`).
2. **Shards** — one child process per corpus file / OCR page / unit-test file / manifest (the WASM heap never shrinks and a
   crash or hang cannot stop the run). A shard that crashes or exceeds its limit becomes a *major* case with its command
   line; the run goes on. Results are written per shard, atomically.
3. **Judges** (`suites.mjs`, numbers only): edit = engine error, new line missing, text not read back (by any reader, second readers on), `.notdef` boxes, neighbouring lines lost or moved, old text left, drawn line vs the browser's drawing of the same
   text (pdf.js / Edge), PDFium and qpdf open; minor = wrapped, edge/baseline moved, bold lost, file growth. OCR = chars right
   (< 80 % major), words right (< 90 % minor), placement. Write = `tools/arabic/check.mjs` statuses per reader (exact / NFKC /
   marks lost / reversed / wrong). Unit and e2e = pass or fail.
   The second readers (on by default; `--no-deep` skips them) take the edit lines MuPDF alone does not read back. They need Edge (Playwright) and `../waraq/dist/vendor` (pdf.js); PDFium/qpdf/PyMuPDF checks run only if
   `STRESS_PYTHON` names a Python that has `pypdfium2`, `pikepdf`, `pymupdf`.
4. **Compare** with `tests/stress/baseline.json` (committed, small: per-slice pass rate, the ids of known failures, the
   majors allowed; failing ids are 8-char hashes). Only failures that are *not* in the baseline are listed. Exit code **1** on a
   breach: a major that is not in the baseline, more majors than the baseline allows (**0** with `--strict` or without a
   baseline), OCR placement < 95 %, any slice more than 1 point under its baseline (full runs only: a sample draws whole files, its rates wobble). Limits can be overridden under `limits` in the baseline file.
5. **`--update-baseline`** writes the baseline (only from a full run). Ratchet: fix issues, update, and `majorAllowed` falls.

Outputs, all in `.stress-cache/`: `stress-report.md` (counts per slice; the 10 worst new failures per slice with a
reproduction line and a thumbnail path), `stress-results.jsonl` (every case), `runs/<id>/` (shard results, per-edit pictures).

## Adding a checker
Add an entry to `suites.mjs`: `shards()` returns `{ id, cmd: [exe, ...args], timeout }` for each unit of work and `judge(shard,
run)` turns what the command printed/wrote into cases `{ id, slice, status: pass|minor|major, why, repro, thumb }`. The
checkers keep their own command lines and exit codes, so they can change freely; only the small judge reads them.

## Nightly
`powershell -ExecutionPolicy Bypass -File tools\stress\schedule.ps1` registers (does not run) a Task Scheduler job "Waraq
stress": 02:00 daily, only when the PC is idle (10 min) and on mains, late start if the PC was off, 3 h limit. `-Remove`
unregisters it. Read `.stress-cache\stress-report.md` in the morning; paste it into `triage-prompt.md` only if there are new failures.
