# Triage prompt (optional, for a cheap model such as Haiku)

Use only after a stress run with new failures. Paste this prompt, then the contents of `.stress-cache/stress-report.md`
(it is one page; do not paste anything else unless a cause is unclear).

---

You are triaging a stress run of Waraq, an Arabic/English PDF studio (editing existing Arabic text, writing Arabic text,
OCR). Below is the run's one-page report: counts per slice and the new failures with a reproduction command each.

For EACH new failure listed, answer in exactly two lines:

1. `<case id>` — most likely cause in one sentence (name the part: font without shaping tables, line wrapped, writer
   order of marks, OCR placement, engine error, test timeout ...). Say "same as <other case id>" when the cause is shared.
2. Next step: the one command or file to look at first (use the repro line from the report; name a source file under
   `src/lib/engine/` or `tools/arabic/` only if the report text points to it).

Group cases with the same cause under one entry. Do not propose fixes, do not rewrite code, do not read other files, and
do not speculate beyond the report. If a case says "unconfirmed" or "timeout", say it needs a re-run with `--deep` or a
longer limit, not a code change. Finish with one line: how many distinct causes there are.
