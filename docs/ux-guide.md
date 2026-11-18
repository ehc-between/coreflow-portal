# CoreFlow UX guide

The single reference for how a CoreFlow page is built and how it speaks. Every area
item (A01-A26) follows it. Source decisions: `docs/polish-plan.md` §2.4 and §3,
`cf-test/polish-audit/design.md` §6.

Contents

1. Principles
2. Page anatomy (list, detail, form, overview, settings)
3. Shared components (`src/app/shared/ui`)
4. Design tokens
5. Tone map (status and severity colours)
6. Writing guide (10 rules)
7. Glossary (nb)
8. Navigation and information architecture
9. Mobile and accessibility rules
10. Before / after examples
11. Area checklist (short form)

---

## 1. Principles

- **One page anatomy.** Every page is built from the same parts in the same order, so a
  user who knows one module knows all of them.
- **Plain language first.** CoreFlow is used by beginners and by auditors. Write for the
  beginner; the expert reads faster when the words are plain too.
- **Evidence and teaching look different.** A real link from a record to a requirement is
  an outlined chip with a status icon (`app-requirement-chip`, P1). Teaching ("why it
  matters") is a text link inside the explanation. Never pills that look alike.
- **Green means done.** Low risk is not an achievement (neutral, not green). Low coverage is
  a to-do (never red).
- **Nothing raw reaches the user.** No enum values, internal refs, field keys, `**markdown**`
  or English catalogue titles in the nb UI.

## 2. Page anatomy

Page padding is `px-4 sm:px-8`, `pt-6 sm:pt-7`, `pb-12`, max width 1180 px. Sections are
`gap-6`; cards are `p-5`.

### 2.1 Every module page

```
app-page-header      breadcrumbs (Module › Sub-area › Record)
                     h1 (= nav label on module roots: modules.names.<key>)
                     one-line description
                     actions, right: [secondary] (≤ 2) · [primary] (1) · "Mer ⋯" [overflow] · ⚙ settingsLink
app-module-nav       sub-pages as underline tabs, directly under the header
app-help-strip       intro + Omvisning + Leksjon · N min + Forklar denne siden (one row)
…page content…
```

- The h1 of a module root is `modules.names.<key>` in the global files. The nav uses the
  same key, and so does the first breadcrumb. Never write the module name anywhere else.
- At most **one primary** action, **two secondary** actions, the rest in "Mer ⋯".
  **Delete is only in the overflow menu**, as `appMenuItem [danger]="true"`, and always asks
  with `app-confirm-dialog`.
- `app-page-header` also sets the browser tab: "`<h1>` · CoreFlow".
- Learning lives **only** in `app-help-strip`. No other tour, lesson or "teach me" buttons
  on the page. Why-it-matters goes **below** the list (`[below]` slot), collapsed for
  non-beginners.

### 2.2 List page

Use `app-record-list-page`:

```
app-page-header  (titleKey, descriptionKey, breadcrumbs, settingsLink; [primary] [secondary] [overflow])
[nav]            app-module-nav
[help]           app-help-strip
[kpis]           ≤ 6 app-kpi-tile
toolbar          search · [filters] (≤ 3 visible) · "Flere filtre" ([more-filters]) · saved views
list             app-record-row-header + app-record-row … (or a table with the same columns)
[empty]          app-teaching-empty with the same CTA words as the primary button
[below]          app-why-it-matters
```

- `app-record-row` columns: **code** (mono, `text-meta`) · **title** + subtitle ·
  **[coverage]** (`app-coverage-chip`, P1) · **[badges]** (status first, then severity) ·
  **owner** · **date** (`dateKind`: due / updated / created / next / date; `overdue` turns it
  amber and adds "Forfalt").
- Column headers (`app-record-row-header`) show from 1024 px. Below 640 px the row stacks.
- Wrap the rows in an element with `role="list"`; the whole row is clickable.
- Filters beyond three go into `[more-filters]`; pass `moreFiltersActive` so the button
  says "Flere filtre (2)".
- While loading: `app-loading-state [rows]="5"`. On error: `app-error-state (retry)`.
  An empty filter result (not an empty register): `app-empty-state` with
  `ui.empty.noResults` and "Fjern filtrene".

### 2.3 Detail page

Use `app-record-detail-layout`:

```
app-page-header   breadcrumbs; h1 = record title ([title]); [meta] = code · type · status badge
                  [primary] [secondary] [overflow] (Delete here); settingsLink
[nav] [help]
tabs              Detaljer · Relatert (count) · Aktivitet · Kommentarer · Vedlegg (count) · …
                  counts = { related: n, attachments: n }
details tab       app-field-list > app-field-item … (label above value; empty → "Ikke satt")
aside             1 [aside-requirements]  Krav dette dokumenterer (requirementsPanel → default panel)
                  2 [aside-connections]   Koblinger (P4 fills the default)
                  3 [aside]               module summary ("Kort oppsummert")
                  4 [aside-learn]         one link list, never full lessons
```

- Meta line: `<span class="font-mono">RSK-0001</span> · Type · <app-status-badge …>`.
- Pages that still render their own h1 in `[header]` keep working; set `title` and move
  the h1 out when the area is polished.

### 2.4 Form page

- Max width **760 px**, one column below 768 px.
- `app-form-field` for **every** control (no raw `<label>`). `app-field-help` sits inline
  after the label, never above it.
- A field that is evidence for a requirement shows "Dokumenterer: ISO 9001 · 8.4.1"
  (guidance `fields.<field>.requirements`, P1).
- "Lagre" bottom-right (sticky on mobile), "Avbryt" secondary to its left.
- The form title uses the same words as the button that opened it ("Ny risiko" → "Ny risiko").
- Errors say what to fix: "Kunne ikke lagre. Fyll ut tittel."

### 2.5 Overview pages

- Numbers in `app-kpi-tile`. Cards with "Se alle →" in the card header.
- Coverage is an accent bar and a % value, never red.
- One answer per level: Oversikt = summary and next steps; Standarder og krav = detail and
  gaps; Rapporter = exports and audit packs.

### 2.6 Settings

- `/settings` is a hub of cards: Organisasjonsprofil, Medlemmer og roller, Moduler, Varsler,
  Terminologi, Veiledning, Registertyper og arbeidsflyter, Slettede elementer,
  Oppsettsveiviser. Below it, one card per enabled module that has configuration pages
  (`MODULE_SETTINGS_CARDS` in `features/org-settings/settings-links/settings-links.ts`).
- Every module with configuration pages sets `settingsLink` on its page header (the gear),
  and adds its pages to `MODULE_SETTINGS_CARDS`.
- `/account` stays personal (password, notifications, learning).

## 3. Shared components (`src/app/shared/ui`, exported from `index.ts`)

| Component                                                                                                                                  | Use                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `app-page-header`                                                                                                                          | h1, breadcrumbs, description, actions, gear, document title                  |
| `app-module-nav [items]`                                                                                                                   | sub-navigation (replaces the per-module `*-nav` / `*-tabs`)                  |
| `app-help-strip [scope] [page] [tour] [lesson]`                                                                                            | the only learning entry on a page                                            |
| `app-record-row` / `app-record-row-header`                                                                                                 | list rows with fixed slots                                                   |
| `app-field-list` / `app-field-item`                                                                                                        | read-only fields on detail pages                                             |
| `app-overflow-menu` + `appMenuItem`                                                                                                        | "Mer ⋯" (keyboard: arrows, Home/End, Escape, focus return)                   |
| `app-status-badge [meaning] [value]`                                                                                                       | every status / severity badge                                                |
| `toneFor(meaning, value)`                                                                                                                  | the colour when you need it outside a badge (dots, bars)                     |
| `app-empty-state`                                                                                                                          | plain empty (no results, empty panel). Empty registers: `app-teaching-empty` |
| `app-loading-state [rows]`                                                                                                                 | skeleton rows                                                                |
| `app-error-state (retry)`                                                                                                                  | neutral error with "Prøv igjen"                                              |
| `TitleService`                                                                                                                             | page title; route titles are i18n keys (`CoreflowTitleStrategy`)             |
| `app-button`, `app-badge`, `app-card`, `app-form-field`, `app-kpi-tile`, `app-confirm-dialog`, `app-slide-over`, `app-switch`, `app-pager` | unchanged building blocks                                                    |

Strings for these components live in the **global** files under `ui.*` and `common.*`.

## 4. Design tokens

Defined in `src/tailwind.css` (`@theme`) on top of the CSS variables in `src/styles.scss`.

| Token                            | Value                                 | Use                                                          |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `text-page`                      | 24 px (26 px from 640 px)             | h1                                                           |
| `text-section`                   | 17 px                                 | h2                                                           |
| `text-card`                      | 15 px                                 | h3, card titles                                              |
| `text-body`                      | 14 px                                 | running text                                                 |
| `text-ui`                        | 13 px                                 | controls, table cells, nav                                   |
| `text-meta`                      | 12 px                                 | labels, meta lines, dates                                    |
| `text-micro`                     | 11 px                                 | badges and counters only                                     |
| `rounded-card`                   | 14 px                                 | cards, dialogs, menus                                        |
| `rounded-tile`                   | 10 px                                 | buttons, inputs, tiles, rows                                 |
| `rounded-full`                   | –                                     | badges, chips, avatars                                       |
| `text-fg-subtle`                 | #6b7383                               | small meta text (≥ 4.5:1 on white and `bg`)                  |
| `text-fg-placeholder`            | #8b94a4                               | placeholders and disabled text only                          |
| `text-{pass,warn,fail,info}-ink` | #0b6e41 · #8a5a00 · #b02a2a · #2559b8 | small coloured text on the soft backgrounds (badges, toasts) |

**Rule:** no arbitrary `text-[..px]` or `rounded-[..]` in a module. (Widths, grids and
shadows may still use arbitrary values.) Check with
`grep -rnE "text-\[[0-9.]+px\]|rounded-\[[0-9.]+px\]" src/app/features/<path>`.

## 5. Tone map

A module maps its enum to a **meaning** and calls `toneFor(meaning, value)` or uses
`app-status-badge`. Local `*Tone()` functions are deleted.

| Meaning      | Values → tone                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `severity`   | critical, prohibited, unacceptable, very_high, severe, major, high → **fail** · medium, moderate, limited, minor, elevated → **warn** · low, minimal, very_low, negligible, none → **neutral** · observation, opportunity → **info**                                                                                                                                                                                                                                                   |
| `lifecycle`  | draft → **neutral** · new, planned, scheduled, open, submitted, reported, received → **info** · in_progress, ongoing, active, under_review, in_review, pending, pending_approval → **accent** · overdue, blocked, on_hold, due, expiring → **warn** · done, completed, approved, closed, effective, published, resolved, implemented, verified, passed → **pass** · cancelled, archived, obsolete, withdrawn, superseded, retired, expired → **neutral** · rejected, failed → **fail** |
| `compliance` | compliant, met, implemented, covered → **pass** · partial, partially_compliant, partially_implemented, in_progress → **warn** · non_compliant, not_met, not_implemented, gap → **fail** · not_assessed, not_applicable, unknown → **neutral**                                                                                                                                                                                                                                          |
| `progress`   | a % value: 100 → **pass**, 1-99 → **accent**, 0 → **neutral**; words use the lifecycle map, and **fail becomes warn**                                                                                                                                                                                                                                                                                                                                                                  |

Unknown values are **neutral**. Labels come from `common.status.<value>` (or
`common.severity.<value>` for severity); pass `labelKey` for a module's own wording. A value
without any translation is shown humanised ("Under review"), never raw.

Overdue always has text as well as colour ("Forfalt"), so colour is never the only signal.

## 6. Writing guide (10 rules)

1. **Plain Bokmål first.** Explain an ISO term once (wrap it in `<app-term>` on first use),
   then use it the same way everywhere. Sentences under 20 words. No anglicisms
   ("dashbord" → "oversikt", "gap" → "mangler").
   In guidance intros (`assets/guidance/<lang>/*.json`) mark every jargon word and
   abbreviation as a term token, `[[key|ordet slik det står]]` (`[[key|ord|=]]` when the
   word is a modifier, as in "IKT-tjenester"). `<app-guidance-text>` renders it as
   `<app-term>`, and beginners see the glossary's `beginner` form with it, plain words first
   where the sentence allows ("grensen for hva dere godtar (risikoappetitten)"). The jargon
   guard (`core/guidance/jargon-guard.spec.ts`, list in `src/testing/jargon-terms.json`)
   fails on an unmarked term. Beginners see requirement titles, not bare clause numbers
   (number on hover). The record history tab is "Historikk".
2. **"du" to the user, "organisasjonen" for the company.** Use "dere" only when quoting a
   standard. ("Standardene organisasjonen følger", not "Rammeverkene dere har valgt".)
3. **One concept, one word** (glossary below). Module objects use the org's terminology
   overrides (`{{ term.deviation }}`).
4. **Buttons: verb + object.** "Ny risiko", "Start inspeksjonen", "Lag sammendrag". The
   primary action has the same words in the list header, the empty-state CTA and the form
   title.
5. **Statuses** are adjectives or participles: "Godkjent", "Pågår", "Forfalt". Severity is
   "Lav / Middels / Høy / Kritisk" everywhere (never "Moderat").
6. **Never show raw values.** No enum values, internal refs (`28.r2`), field keys,
   `**markdown**` or English catalogue titles in nb. A requirement is "ISO 9001 · 8.4.1".
7. **Learning labels:** "Omvisning" (tour), "Leksjon · 5 min" (lesson), "Forklar denne siden"
   (assistant). Nothing else ("Lær meg", "Minikurs", "Ta omvisningen" are gone).
8. **Errors say what happened and what to do:** "Kunne ikke lagre. Sjekk at tittel er fylt
   ut." "Noe gikk galt" only for server errors. Toasts clear when the user moves on.
9. **Dates and numbers** only through `localDay` (date fields: "20. okt. 2026"), `localDate`
   (date-times, default format, no seconds: "20. okt. 2026, 11:00"), `relativeTime` (recent
   activity) and `localNumber`. `localDate: 'medium'` no longer shows seconds.
10. **No vendor or model names.** "KI" in nb, "AI" in en.

**Empty values:** "Ikke satt" for an unset field (`common.empty.notSet`), "Ingen" for an empty
collection (`common.empty.none`), "—" only in dense tables (`common.empty.dash`). Never
"Tom", "N/A", "Ikke angitt" or "Ikke oppgitt".

## 7. Glossary (nb, binding)

| Concept (en)                                    | nb (UI)                                                | Never                                  |
| ----------------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| standard / regulation (ISO, GDPR, NIS2, AI Act) | standard                                               | rammeverk                              |
| the organisation's management system            | styringssystem                                         | –                                      |
| requirement                                     | krav                                                   | kravpunkt                              |
| clause / article number                         | punkt (ISO) · artikkel (EU)                            | klausul, seksjon                       |
| control (ISO 27001 Annex A)                     | kontroll                                               | tiltak (in this sense)                 |
| evidence                                        | dokumentasjon                                          | bevis, evidens                         |
| "supports requirements" panel                   | Krav dette dokumenterer                                | Støtter krav                           |
| readiness score                                 | kravdekning                                            | modenhet, beredskap                    |
| gap                                             | mangler / hull ("3 krav mangler dokumentasjon")        | gap                                    |
| Harmonised Structure clause                     | felles ISO-krav                                        | ISO HS, HS                             |
| nonconformity / deviation record                | avvik                                                  | –                                      |
| incident (real-world event)                     | hendelse                                               | –                                      |
| system event / activity                         | aktivitet / varseltype                                 | hendelse                               |
| audit / inspection finding                      | funn ("Funn: mindre avvik")                            | –                                      |
| corrective action / action                      | korrigerende tiltak / tiltak                           | handling                               |
| task                                            | oppgave                                                | –                                      |
| risk owner / treatment                          | risikoeier / risikobehandling                          | –                                      |
| Statement of Applicability                      | anvendelseserklæring (SoA)                             | –                                      |
| interested party                                | interessent                                            | –                                      |
| objective / KPI                                 | mål / nøkkeltall (KPI)                                 | –                                      |
| management review                               | ledelsens gjennomgang                                  | –                                      |
| competence / awareness                          | kompetanse / bevissthet                                | –                                      |
| supplier evaluation                             | leverandørvurdering                                    | –                                      |
| processing record (ROPA)                        | behandlingsprotokoll (one entry: behandlingsaktivitet) | ROPA alone                             |
| DPIA                                            | personvernkonsekvensvurdering (DPIA)                   | –                                      |
| data subject request                            | henvendelse fra registrert                             | DSR alone                              |
| personal-data breach                            | personvernbrudd                                        | brudd alone                            |
| processor / DPA                                 | databehandler / databehandleravtale                    | –                                      |
| AI / AI system                                  | KI / KI-system                                         | AI (in nb)                             |
| AI Act provider / deployer                      | tilbyder / idriftsetter                                | ibruktaker, leverandør (in this sense) |
| business impact analysis                        | konsekvensanalyse (BIA)                                | –                                      |
| SJA / PPE                                       | sikker jobbanalyse (SJA) / personlig verneutstyr (PVU) | –                                      |
| environmental aspect                            | miljøaspekt                                            | –                                      |
| compliance obligation                           | lovkrav og forpliktelser (record: forpliktelse)        | samsvarskrav                           |
| dashboard                                       | oversikt                                               | dashbord                               |
| My work                                         | Mitt arbeid                                            | –                                      |
| tour / lesson / explain                         | omvisning / leksjon / forklar denne siden              | Lær meg, Minikurs, Ta omvisningen      |
| draft / approved / overdue                      | utkast / godkjent / forfalt                            | –                                      |
| severity levels                                 | lav / middels / høy / kritisk                          | moderat                                |
| unset value / empty list                        | Ikke satt / Ingen                                      | Tom, N/A, Ikke angitt                  |

The nav label for obligations is "Lover og forskrifter", and so is its h1. A record is a
"forpliktelse".

## 8. Navigation and information architecture

```
Hjem:            Oversikt · Mitt arbeid
Krav og styring: Standarder og krav · Lover og forskrifter · Kontekst og ledelse · Mål og KPI-er ·
                 Risiko og muligheter · Ledelsens gjennomgang
Daglig drift:    Prosesser · Dokumenter · Prosjekter · Leverandører · Kontrakter ·
                 Eiendeler og endringer · Kontinuitet og beredskap
Oppfølging:      Avvik · Inspeksjoner · Revisjoner · Kundetilbakemeldinger · Rapporter
Fagområder:      Personvern · KI-styring · Miljø · HMS
Mennesker:       Personer · Rekruttering · Opplæring
(bottom)         Læringssenter · Innstillinger · Tilpass menyen
```

- Defined in `src/app/layout/nav.ts`. Labels are `modules.names.<key>` (global files).
- Sections collapse; the state is remembered per org (`coreflow.nav.collapsed.<orgId>`). A
  collapsed section opens while one of its pages is open.
- "Tilpass menyen" hides items per org (`coreflow.nav.hidden.<orgId>`). Hidden items are
  still found through search.
- "Trenger din gjennomgang" is no longer a nav item; it becomes a tab in Mitt arbeid (P5).
  `/review` still works.
- Every module icon is distinct.

### 8.1 Shell v2 (U03, behind the per-org flag `coreflow.nav.v2`)

```
[+ Registrer] · Hjem · Mitt arbeid · Standarder · Registre · Dokumenter og rapporter · (Festet ≤ 5) · Innstillinger
Top bar: Finn eller spør (Ctrl K) · ? Hjelp og læring (Mine leksjoner, Spør assistenten) · bell · account menu
```

- Defined in `src/app/layout/nav-v2.ts` (labels in the `shell` scope); `nav.ts` stays the
  data source for the old menu and for Registre (`/registers`, grouped by job area).
- Off by default. An admin turns it on in Innstillinger → Meny (`nav_v2` in org settings);
  each member can switch back, or opt in early, in the account menu (`/me/orgs/{org}/preferences`).
- Role decides what shows: an employee (only the `member` role) gets Registrer, Hjem, Mitt
  arbeid and Dokumenter og rapporter; "Vis alt" in the account menu shows the rest.
  Permissions and enabled modules always apply.
- Pins: the user's own (stored on the server), else role defaults (DPO: Behandlingsprotokoll,
  Personvernbrudd; HMS: SJA, Avvik; …). Pin and unpin on Registre.
- Theme and language live in the account menu at every width.

## 9. Mobile and accessibility rules

- Works at **375 px**: no horizontal scroll (`scrollWidth ≤ innerWidth`), the list is in the
  first screen, tap targets ≥ 24 px (prefer 36-40 px), dialogs fit.
- Below `lg` (1024 px) the side nav is a drawer (hamburger, focus trap, Escape, closes on
  navigation). Below `md` the search is an icon, and theme and language are in the account
  menu.
- `app-help-strip` starts collapsed on phones.
- A skip link ("Hopp til innholdet") is the first focusable element. `<main>` is
  `#main-content`.
- Every input has a label (`app-form-field`), icon-only buttons have `aria-label`, Escape
  closes dialogs and menus and focus returns to the trigger, focus order follows the layout.
- Contrast: use tokens only. Small text is `text-fg-muted` or `text-fg-subtle`; coloured
  small text is `*-ink`.
- The page `<title>` is set by `app-page-header` (or the route `title` key).
- `html lang` follows the UI language. "⌘K" on Apple platforms, "Ctrl K" elsewhere.

## 10. Before / after examples

These show the **frame** only. The module content of the deviations list belongs to A03 and
of the documents detail to A24.

### 10.1 List: deviations

Before (`features/deviations/deviations-list.ts`): own h1 and description, header link buttons
("Mottatte rapporter / Tiltak / Statistikk / Administrer typer") as sub-navigation, 11 filters
in three rows, a tour button under why-it-matters, local `severityTone()` / `statusTone()`.

After:

```html
<app-record-list-page
  titleKey="modules.names.deviations"
  descriptionKey="deviations.list.description"
  scope="deviations"
  settingsLink="/deviations/types"
  [query]="q()"
  [filters]="filterValues()"
  [moreFiltersActive]="moreActive()"
  [empty]="rows().length === 0"
  (search)="q.set($event)"
  (viewApplied)="applyView($event)"
>
  <app-button primary (click)="create()">{{ 'deviations.list.new' | transloco }}</app-button>
  <app-button secondary variant="secondary" (click)="export()">…</app-button>

  <app-module-nav
    nav
    labelKey="modules.names.deviations"
    [items]="[
    { labelKey: 'deviations.nav.all', link: '/deviations', exact: true },
    { labelKey: 'deviations.nav.actions', link: '/deviations/actions' },
    { labelKey: 'deviations.nav.intake', link: '/deviations/intake' },
    { labelKey: 'deviations.nav.statistics', link: '/deviations/statistics' },
  ]"
  />
  <app-help-strip help scope="deviations" page="list" tour="list" lesson="deviation-basics" />

  <select filters …status…></select>
  <select filters …severity…></select>
  <select filters …type…></select>
  <div more-filters>…the other eight filters…</div>

  <div role="list">
    <app-record-row-header dateKind="due" />
    @for (d of rows(); track d.id) {
    <app-record-row
      [code]="d.code"
      [title]="d.title"
      [subtitle]="d.type_name"
      [link]="['/deviations', d.id]"
      [owner]="d.owner_name"
      [date]="d.due_date"
      dateKind="due"
      [overdue]="d.overdue"
    >
      <app-status-badge badges meaning="lifecycle" [value]="d.status" />
      <app-status-badge badges meaning="severity" [value]="d.severity" />
      <app-coverage-chip coverage … />
    </app-record-row>
    }
  </div>

  <app-teaching-empty empty … />
  <app-why-it-matters below … />
</app-record-list-page>
```

### 10.2 Detail: documents

Before (`features/documents/document-detail.ts`): no `record-detail-layout`, no tabs, revision
history in the aside, an uppercase micro-label grid, raw `{{ doc.type }}` ("procedure").

After:

```html
<app-record-detail-layout
  entityType="document"
  [entityId]="doc.id"
  [title]="doc.title"
  [breadcrumbs]="[
    { labelKey: 'modules.names.documents', link: '/documents' },
    { label: doc.title },
  ]"
  settingsLink="/documents/types"
  [tabs]="['details', 'related', 'activity', 'comments', 'attachments', 'revisions']"
  [counts]="{ related: relatedCount(), attachments: attachmentCount() }"
  [requirementsPanel]="true"
  [canEdit]="canEdit()"
>
  <ng-container ngProjectAs="[meta]">
    <span class="font-mono">{{ doc.code }}</span> · <span>{{ typeLabel(doc.type) }}</span> ·
    <app-status-badge meaning="lifecycle" [value]="doc.status" />
  </ng-container>
  <app-button primary (click)="edit()">{{ 'documents.detail.edit' | transloco }}</app-button>
  <app-button secondary variant="secondary" (click)="submit()">…</app-button>
  <button appMenuItem overflow (click)="archive()">…</button>
  <button appMenuItem overflow [danger]="true" (click)="confirmDelete.set(true)">…</button>

  <app-field-list>
    <app-field-item labelKey="documents.fields.owner" [value]="doc.owner_name" />
    <app-field-item labelKey="documents.fields.reviewDate" [value]="doc.review_date | localDay" />
    <app-field-item labelKey="documents.fields.revision" [value]="doc.revision" />
  </app-field-list>

  <div aside>…Kort oppsummert…</div>
  <div aside-learn>…links…</div>
</app-record-detail-layout>
```

### 10.3 Form

Before: about 900 px wide, raw `<label>`s, "?" above the label, Save top-right.

After:

```html
<form class="mx-auto max-w-[760px]" (ngSubmit)="save()">
  <app-page-header
    titleKey="risk.form.newTitle"
    [breadcrumbs]="[{ labelKey: 'modules.names.risk', link: '/risk' }, { labelKey: 'risk.form.newTitle' }]"
  />
  <app-form-field inputId="title" [label]="'risk.fields.title' | transloco" [error]="titleError()">
    <input id="title" formControlName="title" />
  </app-form-field>
  …
  <div class="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-bg py-3 sm:static">
    <app-button variant="secondary" (click)="cancel()"
      >{{ 'common.cancel' | transloco }}</app-button
    >
    <app-button type="submit">{{ 'common.save' | transloco }}</app-button>
  </div>
</form>
```

## 11. Area checklist (short form)

The binding checklist is `docs/polish-plan.md` §3.4-3.5. In short:

- [ ] `app-page-header` on every page; module root h1 = `modules.names.<key>`.
- [ ] `app-module-nav` replaces the module's own sub-nav (delete the old component).
- [ ] ≤ 1 primary, ≤ 2 secondary, overflow; Delete only in overflow with a confirm dialog.
- [ ] Lists on `app-record-list-page` + `app-record-row`; details on
      `app-record-detail-layout` + `app-field-list`; forms ≤ 760 px with `app-form-field`.
- [ ] `app-status-badge` / `toneFor` everywhere; `grep -n "Tone(" features/<path>` is empty.
- [ ] Learning only in `app-help-strip`; why-it-matters below the list.
- [ ] Tokens only (no `text-[..px]`, `rounded-[..]`).
- [ ] `settingsLink` gear + the module's card in `MODULE_SETTINGS_CARDS`.
- [ ] Copy follows §6 and §7; en/nb parity; loading, error and empty states; 375 px works.
