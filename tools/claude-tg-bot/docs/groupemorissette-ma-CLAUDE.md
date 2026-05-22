# CLAUDE.md — Groupe Morissette M&A pipeline

> Copy this file to the root of your M&A working repo on the iMac
> (e.g. `~/code/groupemorissette-ma/CLAUDE.md`). Claude Code reads `CLAUDE.md`
> automatically when it operates in that directory, so anything in here is
> standing context for every chat — no need to re-explain on each turn.
>
> Fill in the **TODO** sections from the iMac. They are placeholders.

## Mission

I'm running an off-thesis acquisition search under the **Groupe Morissette**
banner. Your job is to help me build and maintain a pipeline of potential
acquisition targets, qualify them, and produce the artifacts I need to engage
sellers and finance deals (models, teasers, decks).

## Acquisition criteria (TODO — fill in)

- **Industries**: TODO (e.g. specialty trade contractors, building services,
  industrial supply, ...)
- **Geography**: TODO (e.g. Greater Montréal, all of Québec, Eastern Canada)
- **Revenue band**: TODO (e.g. CAD $2M – $20M)
- **EBITDA band**: TODO (e.g. CAD $300k – $3M, 10%+ margin)
- **Owner situation**: TODO (e.g. retirement / succession, no clear heir,
  founder 55+)
- **Hard pass**: TODO (e.g. unionized workforce above X%, environmental
  liabilities, asbestos, single-customer concentration > 40%)

## Data sources I use

- **Registraire des entreprises du Québec (REQ)** — public search at
  https://www.registreentreprises.gouv.qc.ca . Useful for incorporation date,
  shareholders, addresses, status. Free.
- **Régie du bâtiment du Québec (RBQ)** — licensee directory. Useful for
  trade contractors. Free.
- **Reprenariat Québec** — I have a paid account; credentials are in
  `.env` as `REPRENARIAT_QC_EMAIL` / `REPRENARIAT_QC_PASSWORD`. Use Playwright
  to log in when needed.
- **LinkedIn / Sales Navigator** — manual, no scraping (ToS).
- **CEDQ, BDC reports, Statistique Québec** — for industry sizing.
- Local Québec business news (Les Affaires, La Presse Affaires) — for triggers
  (succession announcements, family-business profiles).

## Output conventions

When I ask you to produce artifacts, save them to my outbox so they reach me
on Telegram — the bot tells you the exact path on each turn.

- **Pipeline data**: append to `pipeline/targets.csv` in this repo. Columns:
  `target_name, neq, industry, region, est_revenue, est_ebitda, owner_age,
  source, first_seen, status, next_action, notes`. Status is one of
  `lead / qualified / contacted / passed / dead / under_loi / closed`.
- **Target one-pagers**: `pipeline/onepagers/<NEQ>-<slug>.md`.
- **Financial models**: `models/<target>-model.xlsx` using `openpyxl`.
  3-statement + DCF + LBO sensitivities.
- **Decks**: `decks/<target>-teaser.pptx` using `python-pptx`. Match the
  template in `decks/_template.pptx` (create it if missing).
- **Snapshots from scheduled scrapes**: `data/snapshots/<source>-<YYYY-MM-DD>.csv`
  so we can diff week-over-week.

## House style

- Always cite source URLs inline when stating a fact about a target.
- Flag uncertainty explicitly: don't fabricate revenue/EBITDA — mark as
  estimate with a method note ("Heuristic: ~$X per FTE × N FTE on LinkedIn").
- For French-language sources, work in French and translate key takeaways
  to English in the same reply.
- For numbers: CAD unless stated otherwise, no thousands separators in CSVs,
  ISO dates.
- Don't push to `main` — always work on a branch. Never push without me
  asking.

## What good looks like

A weekly delta from the scrapers should be:

1. **N new entities** that match criteria — short list with source link
2. **Top 3 most interesting**, each with a 5-line qualification:
   why they fit, what's the trigger, what's the next step
3. **Anything aging in the pipeline** (no movement > 30 days) flagged

A target one-pager should fit on one screen and answer: what they do, size
estimate, owner situation, why now, how to approach.
