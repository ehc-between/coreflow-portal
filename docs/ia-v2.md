# IA v2: "Fiken for compliance"

Status: **binding** for the IA v2 rebuild (product owner decision 2026-11-22). Written by the
architect step of the overnight workflow; every decision below was taken without a human
awake and is recorded so it can be reviewed later (see section 11, decision log).

The spec for structure, wording, page anatomy and tone is the approved prototype
`docs/prototype/fiken-style-ia.html`. Where this document and the prototype disagree on
**wording or layout**, the prototype wins. Where they disagree on **routes, data or
ownership**, this document wins. `docs/ux-guide.md` still applies, in particular §2.7
(detail-page anatomy) for every record page; its §8 / §8.1 (old sidebar and shell v2) are
replaced by section 4 of this document (SHELL updates the guide).

Contents

1. Principles
2. The new IA at a glance (areas, dropdowns, routes)
3. Complete inventory and mapping (checklist used by the final verification)
4. Shell contract (top menu, Vis krav, inbox, account menu, Spør CoreFlow, mobile)
5. Page contracts per area
6. Backend: new endpoints and migrations
7. Redirects (old → new)
8. Gaps found and where they went
9. Work split, file ownership, merge rules
10. Verification checklist (final round)
11. Decision log
12. Final verification round (2026-11-23)

---

## 1. Principles

1. **Organise around what happens in the company, not around ISO clauses.** Nine areas, named
   in plain Norwegian: Oversikt · Meld fra · Årshjul · Bedriften · Folk · Kontakter · Håndbok ·
   Dokumenter · Rapporter.
2. **Standards stay in the background.** Requirement chips and requirement panels are hidden
   until the user switches on **Vis krav** (one global switch in the top bar). The expert view
   (`/standards/**`, SoA, gaps) always shows them and lives under Rapporter → "Standarder
   (ekspertvisning)".
3. **One obvious action per row / page.** Every to-do, deadline and duty has exactly one
   button that does the next thing.
4. **Nothing is lost.** Every route, register, settings page and feature that exists today has
   a home (section 3). A sub-item is hidden only when its module is disabled or the user lacks
   the permission. An area is hidden only when *none* of its sub-items is available (in
   practice never for an org with modules on).
5. **Record URLs do not change.** `/deviations/:id`, `/suppliers/:id`, `/documents/:id`,
   `/privacy/ropa/:id` … keep working exactly as today (notifications, e-mails, calendar
   feeds, backend `url` fields and the search index all point at them). IA v2 changes the
   **shell, the landing pages and the navigation**; it adds area overview pages and
   aggregation endpoints. Only landing pages that an area page replaces are redirected
   (section 7).
6. **Reuse first.** Existing endpoints and components are reused wherever possible; new
   backend code is only aggregation across modules (Saker, Årshjul, Kontakter, Håndbok) and
   the Meld fra proposal.
7. **Plain words.** nb copy follows the prototype verbatim where it exists; en at full key
   parity; no vendor/model names ("Forslag fra CoreFlow", "Spør CoreFlow").

---

## 2. The new IA at a glance

Top menu (left to right). Clicking the **label** opens the area overview; the **▾ button**
(also hover with a fine pointer) opens the dropdown, whose items go straight to sub-areas; the
last row is always "Se hele oversikten →" (the area overview).

| # | Area (nb / en) | Area route | Dropdown items (nb) → route |
|---|---|---|---|
| 1 | **Oversikt** / Overview | `/home` | *(no dropdown, like the prototype)* |
| 2 | **Meld fra** / Report | `/speak-up` | Meld fra → `/speak-up` · Alle saker → `/cases` · Mine saker → `/cases?tab=mine` · Tiltak → `/deviations/actions` · Varslinger → `/deviations/intake` (permission) |
| 3 | **Årshjul** / Year planner | `/annual-cycle` | Årshjulet → `/annual-cycle` · Revisjoner → `/audits` · Inspeksjoner og vernerunder → `/inspections` · Ledelsens gjennomgang → `/management-review` · Gjentakende oppgaver → `/tasks/recurring` |
| 4 | **Bedriften** / Company | `/company` | Interessenter → `/context/interested-parties` · Policyer → `/context/policies` · Roller og ansvar → `/context/responsibilities` · Mål og KPI-er → `/objectives` · Risikoer og muligheter → `/risk` · Lover og regler → `/obligations` · Omfang og kontekst → `/context/scopes` · Prosjekter → `/projects` · Fagområder → `/company/topics` |
| 5 | **Folk** / People | `/people` | Personer → `/people/employees` · Opplæring → `/training` · Kompetanse → `/people/competences` · Rekruttering → `/recruitment` · HMS → `/hse` · Tilgang → `/assets/access-reviews` |
| 6 | **Kontakter** / Contacts | `/contacts` | Kunder → `/contacts?tab=customers` · Leverandører → `/contacts?tab=suppliers` · Databehandlere → `/contacts?tab=processors` · Avtaler → `/contacts?tab=agreements` · Kundeundersøkelser → `/feedback` |
| 7 | **Håndbok** / Handbook | `/handbook` | Prosesskart → `/handbook` · *one row per process, core first in chain order, then management, then support* → `/handbook/:processId` · Alle prosedyrer → `/handbook?tab=procedures` |
| 8 | **Dokumenter** / Documents | `/documents` | Policyer → `/documents/all?kind=policy` · Planer → `/documents/all?kind=plan` · Maler → `/documents/templates` · Eksterne dokumenter → `/documents/external` · Arkiv → `/documents/archive` · Venter på deg → `/documents/read-confirm` |
| 9 | **Rapporter** / Reports | `/reports` | Til revisor → `/reports?to=auditor` · Til Datatilsynet → `/reports?to=authority` · Til styret → `/reports?to=board` · Til kunder og ansatte → `/reports?to=people` · Standarder (ekspertvisning) → `/standards` |

Top bar, right side: **Vis krav** switch · search icon (Ctrl/Cmd K, command palette) · **inbox**
(my tasks + unread messages + notifications) · **avatar / account menu** (settings, admin,
learning centre, language, theme, org switch, sign out). Floating **✦ Spør CoreFlow** button
bottom right opens the existing Ask panel (Ctrl/Cmd J keeps working).

Short descriptions under each dropdown item: copy them from the prototype `MENU` constant;
the new ones (Tiltak, Varslinger, Gjentakende oppgaver, Fagområder, Kundeundersøkelser, Alle
prosedyrer, Venter på deg) get a one-line description in the same tone (e.g. Fagområder:
"Personvern, IT, KI, miljø og beredskap").

### 2.1 Area membership of URLs (active highlighting and breadcrumbs)

The top-menu item is highlighted (`.on`) when the current URL starts with one of its
prefixes. Longest prefix wins. This table is the data in `layout/areas.ts` (`AREAS[].prefixes`).

| Area | URL prefixes |
|---|---|
| Oversikt | `/home`, `/dashboard`, `/my-work`, `/tasks`, `/review`, `/chat`, `/setup` |
| Meld fra | `/speak-up`, `/cases`, `/deviations`, `/privacy/breaches`, `/feedback/items` |
| Årshjul | `/annual-cycle`, `/audits`, `/inspections`, `/management-review`, `/tasks/recurring` |
| Bedriften | `/company`, `/context`, `/objectives`, `/risk`, `/obligations`, `/projects`, `/privacy` (except breaches/processors), `/ai-governance`, `/environment`, `/continuity`, `/assets` (except access-reviews) |
| Folk | `/people`, `/training`, `/recruitment`, `/hse`, `/assets/access-reviews` |
| Kontakter | `/contacts`, `/customers`, `/suppliers`, `/contracts`, `/privacy/processors`, `/feedback` (except items) |
| Håndbok | `/handbook`, `/processes` |
| Dokumenter | `/documents` |
| Rapporter | `/reports`, `/library`, `/registers`, `/standards` |
| *(none)* | `/settings/**`, `/account/**`, `/admin/**`, `/no-access` (account menu pages; no item highlighted) |

`/tasks/recurring` is listed under Årshjul (longer prefix than `/tasks`).

---

## 3. Complete inventory and mapping

Legend for **Change**: `keep` = route and page unchanged, reached from the new place;
`new` = new route/page; `hub` = the route now renders the new area overview (path reused);
`moved` = page moves to a new path, old path redirects (section 7); `redirect` = old landing
page replaced by an area page; `retire` = removed (with redirect if it had a URL).
**Owner** is the engineer who must make sure the item has its home (section 9).

This table **is** the final verification checklist: each row is ticked when the item is
reachable from its stated home in the running app with Vis krav off and on.

### 3.1 Public routes (outside the shell) — unchanged

| # | Current route | What | New home | Change | Owner |
|---|---|---|---|---|---|
| P1 | `/login` | Sign in | unchanged | keep | SHELL |
| P2 | `/invite/accept` | Accept invitation | unchanged | keep | SHELL |
| P3 | `/forgot-password`, `/reset-password` | Password reset | unchanged | keep | SHELL |
| P4 | `/survey/:token` | Public customer survey (M22) | unchanged | keep | KONTAKTER |
| P5 | `/verify/certificate/:code` | Public certificate check (M11) | unchanged | keep | HUBS |
| P6 | `/report/:token` | Public anonymous / whistleblowing form (M03) | unchanged; **note:** no new route may start with `report/` (it would be swallowed) | keep | MELD |

### 3.2 Workspace, shell and personal pages

| # | Current route / feature | What | New home | Change | Owner |
|---|---|---|---|---|---|
| W1 | `/` → `/dashboard` | Default landing | `/` → `/home` | redirect | SHELL |
| W2 | `/dashboard` (+ journey widgets, next actions, standard status) | Home dashboard | **Oversikt** `/home` | redirect | OVERSIKT |
| W3 | `/standards/journey/:framework` | Standard journey page (reached from home) | Rapporter › Standarder (ekspertvisning), linked from Oversikt "Hvor står dere?" | keep | RAPPORTER |
| W4 | Home workspace settings (`dashboard/settings/home-workspace-settings`, `GET/PUT /home/workspaces`) | Which home template each role gets | Account menu › Innstillinger (stays where it is rendered today); Oversikt uses the workspace to trim its content | keep | OVERSIKT |
| W5 | `/my-work` (tabs: overdue, this week, later, review, training …) | My work | Inbox › "Se alt" → `/my-work`; Oversikt "Dette bør du gjøre nå" | keep | SHELL (inbox) |
| W6 | `/review`, `/review/:id` | Needs your review | My work tab (already); inbox "Venter på deg" count | keep | SHELL |
| W7 | `/tasks`, `/tasks/new`, `/tasks/:id`, `/tasks/:id/edit` | All tasks, task detail | Inbox › "Alle oppgaver"; Oversikt to-do | keep | SHELL |
| W8 | `/tasks/recurring` | Recurring task series | Årshjul › Gjentakende oppgaver; series also appear as items in the year list | keep | ARSHJUL |
| W9 | `/chat` (+ `browse`) | Chat (DMs, groups, channels) | Inbox › Meldinger tab → `/chat`; unread count in the inbox badge | keep | SHELL |
| W10 | `ChatTopButton` (top bar) | Chat shortcut with unread badge | merged into the inbox button | retire | SHELL |
| W11 | `NotificationBell` (top bar) | Notifications | merged into the inbox (Varsler tab) | retire (as a separate button) | SHELL |
| W12 | `HelpMenu` "?" (shell v2) | Help, my lessons, ask the assistant | Account menu › "Hjelp og læring" group | retire (as a separate button) | SHELL |
| W13 | `CommandPaletteService` (Ctrl/Cmd K, "Finn eller spør" box) | Search + commands | Search icon button in the top bar + Ctrl/Cmd K | keep | SHELL |
| W14 | Ask panel (floating button, Ctrl/Cmd J) | Assistant | Floating **✦ Spør CoreFlow** button (text label from sm up, icon below) | keep | SHELL |
| W15 | Registrer dialog (`shared/registrer`, quick create, shell v2 "+ Registrer") | Quick create of 11 record types | Incident types → **Meld fra** page. Common types (risk, task, document, supplier) → "+ Ny …" buttons on area pages, Oversikt quick actions and the command palette open the same dialog pre-selected. The "+ Registrer" nav button is retired | keep (dialog) / retire (button) | MELD (incident types), SHELL (dialog host) |
| W16 | `OrgSwitcher` | Switch organisation | Account menu, top section "Bytt bedrift" (only with >1 org); current org name shown under the CoreFlow brand from md up | keep | SHELL |
| W17 | `SideNav` (old menu), `nav.ts` sections, collapse state, "Tilpass menyen" hidden items | Left sidebar | **Top menu** (`layout/top-menu`); `nav.ts` is reduced to the module metadata still used by other code (`MODULE_NAV_ITEMS`, `legacyNavKey`) or deleted | retire | SHELL |
| W18 | `SideNavV2`, `nav-v2.ts`, `coreflow.nav.v2` org flag, "Ny meny" toggle, "Vis alt", role workspaces trimming, pins (`ROLE_DEFAULT_PINS`, `/me/orgs/{org}/preferences` pins) | Shell v2 | Retired. Permissions and enabled modules decide visibility; no role trimming of areas. Pins are replaced by the top menu + dropdowns (decision D7). The org setting row "Meny" in Innstillinger is removed | retire | SHELL |
| W19 | `NavDrawerService`, hamburger, off-canvas drawer | Mobile nav | Horizontally scrolling top menu (section 4.6) | retire | SHELL |
| W20 | `/no-access` | Deep link to another org | unchanged | keep | SHELL |
| W21 | `/setup` | Organisation setup wizard | Account menu › Administrasjon › "Oppsett av bedriften"; Oversikt shows a setup card while setup is incomplete (`HomeOut.setup`) | keep | SHELL / OVERSIKT |
| W22 | `/account/password`, `/account/security`, `/account/sessions`, `/account/notifications` | My account | Account menu (unchanged entries) | keep | SHELL |
| W23 | `/account/learning`, `/account/learning/:scope/:lesson`, `/learning` → `/account/learning` | Learning centre | Account menu › Hjelp og læring › Læringssenter | keep | SHELL |
| W24 | Guidance level switch (account menu) | Guidance level | Account menu (unchanged) | keep | SHELL |
| W25 | Theme + language switch | Appearance / language | Account menu (all widths) | keep | SHELL |
| W26 | `/admin/organizations`, `/admin/organizations/:id` | Super-admin | Account menu › Administrasjon › "Alle organisasjoner" (superuser only) | keep | SHELL |
| W27 | `RegistrerComplete` toast after quick create | Success card | unchanged (Meld fra has its own success step) | keep | SHELL |
| W28 | Module placeholder (`module-placeholder`) | Stub for modules without UI | unchanged | keep | SHELL |

### 3.3 Settings (account menu › Innstillinger, `/settings/**`) — all kept

| # | Current route | What | New home | Change | Owner |
|---|---|---|---|---|---|
| S1 | `/settings` | Settings index | Account menu › Innstillinger | keep | SHELL |
| S2 | `/settings/profile` | Org profile (facts) | Innstillinger; also **Bedriften** header "Rediger profil" | keep | HUBS (link) |
| S3 | `/settings/members`, `/settings/invitations` | Members, invitations | Innstillinger; also Folk › Personer header link "Brukere og tilgang i CoreFlow" | keep | SHELL |
| S4 | `/settings/departments`, `/settings/departments/:deptId` | Departments | Innstillinger; Bedriften › Roller og ansvar card links "Avdelinger" | keep | HUBS (link) |
| S5 | `/settings/roles` | Roles and permissions | Innstillinger | keep | SHELL |
| S6 | `/settings/audit-log` | Audit log | Innstillinger | keep | SHELL |
| S7 | `/settings/chat` | Chat admin | Innstillinger | keep | SHELL |
| S8 | `/settings/security` | Security (MFA policy …) | Innstillinger | keep | SHELL |
| S9 | `/settings/deleted-documents` | Deleted documents | Innstillinger; Dokumenter › Arkiv footer link | keep | HUBS (link) |
| S10 | `/settings/attachment-deletions` | Attachment deletions | Innstillinger | keep | SHELL |
| S11 | `/settings/branding` | Branding of outputs | Innstillinger; Rapporter footer link "Utseende på rapporter" | keep | RAPPORTER (link) |
| S12 | `/settings/guidance`, `/settings/guidance/members/:userId` | Guidance settings | Innstillinger | keep | SHELL |
| S13 | `/settings/notifications` | Org notification settings | Innstillinger | keep | SHELL |
| S14 | `/settings/record-types/**` (list, new, `:id`, workflows) | Custom record types + workflows (F4) | Innstillinger | keep | SHELL |
| S15 | `/settings/terminology` | Terminology | Innstillinger | keep | SHELL |
| S16 | `/settings/modules` | Which modules are on | Innstillinger | keep | SHELL |
| S17 | `/settings/modules/<slug>/**` (documents types/templates/retention, deviations types/templates/intake, inspections templates + library, risk matrices + registers, management-review, contracts, environment, suppliers questionnaires, people, recruitment, feedback, ai-governance, privacy) | Per-module configuration (gear on module pages) | Innstillinger › Moduler; the gear on each module page keeps linking here | keep | SHELL |
| S18 | Settings "Meny" (nav v2 flag) | Shell v2 opt-in | removed | retire | SHELL |

### 3.4 Modules and registers

| # | Current route(s) | What | New home (area › dropdown item › page/tab) | Change | Owner |
|---|---|---|---|---|---|
| **Deviations (M03)** |||||
| M1 | `/deviations` (list) | All deviations | Meld fra › Alle saker `/cases?type=deviation`; the full deviation list moves to `/deviations/all` ("Avansert liste" link on Saker) | moved | MELD |
| M2 | `/deviations/new` | Full deviation form | Meld fra page, link "Bruk fullt skjema" | keep | MELD |
| M3 | `/deviations/:id`, `/:id/edit`, `/:id/print` | Deviation record | Saker row → record (unchanged URL) | keep | MELD |
| M4 | `/deviations/actions` | Corrective actions | Meld fra › Tiltak | keep | MELD |
| M5 | `/deviations/stats` | Deviation statistics | Saker page link "Statistikk"; Rapporter › Status og nøkkeltall card link | keep | MELD |
| M6 | `/deviations/intake`, `/deviations/intake/:id` | Anonymous / whistleblowing intake queue | Meld fra › Varslinger (only with intake permission); count on Saker | keep | MELD |
| **Feedback (M22)** |||||
| M7 | `/feedback` (overview), `/feedback/insights`, `/feedback/answers`, `/feedback/surveys/**` | Customer surveys, insights | Kontakter › Kundeundersøkelser | keep | KONTAKTER |
| M8 | `/feedback/items`, `/items/new`, `/items/:id(/edit)` | Complaints, praise, suggestions | Listed in **Saker** (complaints and ideas); record URLs unchanged; customer complaints also on the company card | keep | MELD (Saker), KONTAKTER (card) |
| **Privacy (M14)** |||||
| M9 | `/privacy/breaches/**` | Personal data breaches | Listed in **Saker**; Meld fra type "Personopplysninger på avveie"; Rapporter › Til Datatilsynet "Melding om brudd" | keep | MELD |
| M10 | `/privacy/processors/**` | Processors | Kontakter › Databehandlere (processor rows merged into companies) | keep | KONTAKTER |
| M11 | `/privacy` (overview) | Privacy overview | Bedriften › Fagområder › **Personvern** card → `/privacy` | keep | HUBS |
| M12 | `/privacy/ropa/**` | Records of processing (Art. 30) | Fagområder › Personvern; Rapporter › Til Datatilsynet "Protokoll over behandlingsaktiviteter"; company card "Personopplysninger de behandler" | keep | HUBS |
| M13 | `/privacy/dpias/**` | DPIAs | Fagområder › Personvern; reviews in Årshjul | keep | HUBS / ARSHJUL |
| M14 | `/privacy/data-subject-requests/**` | Data subject requests | Fagområder › Personvern; deadlines in Årshjul and inbox | keep | HUBS |
| M15 | `/privacy/transfers/**`, `/retention-schedules/**`, `/consents/**`, `/legal-basis-assessments/**` | Other privacy registers | Fagområder › Personvern | keep | HUBS |
| M16 | `/privacy/documents` | Privacy documents (notice etc.) | Fagområder › Personvern; Rapporter › Til kunder og ansatte "Personvernerklæring" | keep | HUBS |
| **Context (M01)** |||||
| M17 | `/context` (overview) | Context overview | **Bedriften** `/company` | redirect | HUBS |
| M18 | `/context/interested-parties/**` | Interested parties | Bedriften › Interessenter | keep | HUBS |
| M19 | `/context/policies/**` | Policy statements | Bedriften › Policyer | keep | HUBS |
| M20 | `/context/responsibilities/**`, `/context/responsibilities/matrix` | Roles and responsibilities, RACI | Bedriften › Roller og ansvar (matrix as a link on that page) | keep | HUBS |
| M21 | `/context/scopes/**`, `/context/analyses/**` | Scope, SWOT/context analysis | Bedriften › Omfang og kontekst (lands on scopes; analyses linked) | keep | HUBS |
| M22 | `/context/interview` | Four-question starter interview | Bedriften header action "Foreslå med intervju" when context is empty | keep | HUBS |
| **Objectives (M08)** |||||
| M23 | `/objectives/**`, `/objectives/kpis/**` | Objectives and KPIs | Bedriften › Mål og KPI-er | keep | HUBS |
| **Risk (M05)** |||||
| M24 | `/risk` (overview), `/risk/risks/**`, `/risk/treatments`, `/risk/opportunities/**` | Risks, treatments, opportunities | Bedriften › Risikoer og muligheter | keep | HUBS |
| M25 | `/risk/soa` → `/standards/soa`, `/risk/soa/:key`, `/standards/soa`, `/standards/:key/soa` | Statement of Applicability | Rapporter › Til revisor "Erklæring om anvendelighet (SoA)"; Standarder | keep | RAPPORTER |
| **Obligations (M02)** |||||
| M26 | `/obligations/**` | Legal and other requirements | Bedriften › Lover og regler | keep | HUBS |
| **Projects** |||||
| M27 | `/projects/**` | Projects | Bedriften › Prosjekter | keep | HUBS |
| **Management review (M10)** |||||
| M28 | `/management-review` → `reviews`, `reviews/**`, `reviews/:id/report`, `meetings/**` | Management review + meetings | Årshjul › Ledelsens gjennomgang; Rapporter › Til styret | keep | ARSHJUL |
| **Audits (M09)** |||||
| M29 | `/audits` (overview), `plans/**` (+ report, findings/new), `programmes/**`, `findings/**`, `certifications/**`, `auditors` | Internal / external audits | Årshjul › Revisjoner; Rapporter › Til revisor "Internrevisjonsrapport"; next external audit in Bedriften header | keep | ARSHJUL |
| **Inspections (M04)** |||||
| M30 | `/inspections`, `new`, `findings`, `schedules`, `:id`, `:id/run`, `:id/findings/:finding`, `:id/edit` | Inspections, schedules, mobile checklist run | Årshjul › Inspeksjoner og vernerunder | keep | ARSHJUL |
| **HSE (M21)** |||||
| M31 | `/hse` (overview), `sja/**`, `ppe/**`, `consultations/**`, `safety-rounds` | SJA, PPE, consultations, safety rounds | Folk › HMS; safety rounds also in Årshjul | keep | HUBS |
| **People (M15)** |||||
| M32 | `/people` → `employees` | People module landing | **Folk** hub `/people` | hub | HUBS |
| M33 | `/people/employees/**` (+ `competence-record`), `/people/checklists/**` | Employees, on/offboarding checklists | Folk › Personer (checklists as a link on Personer) | keep | HUBS |
| M34 | `/people/positions/**`, `/people/competences/**`, `/people/matrix` | Positions, competences, competence matrix | Folk › Kompetanse (lands on `/people/competences`; positions + matrix linked) | keep | HUBS |
| **Training (M11)** |||||
| M35 | `/training` (home), `mine`, `courses/**` (+ `learn`), `assignments/**`, `records/**` (+ certificate), `matrix`, `plan`, `people/:userId` | Training | Folk › Opplæring; expiries in Årshjul; my courses in inbox/My work | keep | HUBS |
| **Recruitment (M16)** |||||
| M36 | `/recruitment/**` (requisitions + pipeline, candidates, applications) | Recruitment | Folk › Rekruttering | keep | HUBS |
| **Assets (M13)** |||||
| M37 | `/assets` (list), `new`, `:id(/edit)`, `calibration`, `changes/**` | Assets, calibration, change management | Bedriften › Fagområder › **IT og utstyr** | keep | HUBS |
| M38 | `/assets/access-reviews/**` | Access reviews | Folk › Tilgang; also in Årshjul | keep | HUBS |
| **Continuity (M17)** |||||
| M39 | `/continuity` (overview), `bias/**`, `plans/**`, `exercises/**`, `ict-systems/**`, `contacts` | BIA, BCP, exercises, ICT systems, emergency contacts | Bedriften › Fagområder › **Beredskap og kontinuitet**; plans also listed in Dokumenter › Planer; exercises in Årshjul | keep | HUBS |
| **Environment (M18)** |||||
| M40 | `/environment` (overview), `aspects/**`, `emergency-plans/**`, `metrics/**`, `emissions` | Environmental aspects, plans, metrics, emissions | Bedriften › Fagområder › **Miljø** | keep | HUBS |
| **AI governance (M19)** |||||
| M41 | `/ai-governance` (overview), `systems/**` (+ classify, documentation), `assessments/**`, `literacy` | AI systems, assessments, AI literacy | Bedriften › Fagområder › **KI-systemer**; literacy also linked from Folk › Opplæring | keep | HUBS |
| **Customers (M20)** |||||
| M42 | `/customers` (list) | Customer register | Kontakter (tab Kunder shows companies with the Kunde role); full list kept at `/customers` ("Åpne kunderegisteret" link) | keep | KONTAKTER |
| M43 | `/customers/new`, `/customers/:id(/edit)` | Customer record | "+ Ny kontakt" → choose role; company card links to the record | keep | KONTAKTER |
| M44 | `/customers/matches` | Duplicate/match review | Kontakter page header "Mulige duplikater (N)" for writers | keep | KONTAKTER |
| **Suppliers (M06)** |||||
| M45 | `/suppliers` (list), `new`, `:id(/edit)`, `:id/evaluations/:eid` | Supplier register + evaluation | Kontakter (tab Leverandører); company card "Evalueringer"; re-evaluation due in Årshjul | keep | KONTAKTER |
| M46 | `/suppliers/evaluations` | All evaluations | Kontakter, tab Leverandører link "Alle evalueringer" | keep | KONTAKTER |
| **Contracts (M07)** |||||
| M47 | `/contracts` (list), `new`, `:id(/edit)` | Contracts | Kontakter › Avtaler tab; company card "Avtaler" | keep | KONTAKTER |
| M48 | `/contracts/deadlines` | Notice / renewal deadlines | Årshjul (items) + Avtaler tab link "Frister" | keep | KONTAKTER |
| **Processes (M12)** |||||
| M49 | `/processes` (list) | Process register | **Håndbok** `/handbook` (Prosesskart); full list kept as Håndbok tab "Alle prosesser" link → `/processes/all` | moved | HANDBOK |
| M50 | `/processes/:id`, `:id/edit`, `:id/map` (map editor), turtle, reviews | Process record | Håndbok process page header "Detaljer og redigering" → `/processes/:id` | keep | HANDBOK |
| M51 | `/processes/interaction-map` | Interaction map | Håndbok page link "Samspill mellom prosessene" | keep | HANDBOK |
| M52 | `/processes/new` | New process | Håndbok "+ Ny prosess" (secondary) | keep | HANDBOK |
| M53 | `/procedures` → `/processes` | Old alias | → `/handbook` | redirect | SHELL |
| **Documents (M01 docs / F8)** |||||
| M54 | `/documents` (list) | Document list | **Dokumenter** hub `/documents`; list moves to `/documents/all` | hub + moved | HUBS |
| M55 | `/documents/register` | Document register (controlled-docs view) | Dokumenter hub link "Dokumentregister" | keep | HUBS |
| M56 | `/documents/new`, `:id`, `:id/edit`, `:id/history` | Document record | unchanged; procedures opened from Håndbok use the same URLs | keep | HUBS |
| M57 | `/documents/external/**` | External documents | Dokumenter › Eksterne dokumenter | keep | HUBS |
| M58 | `/documents/read-confirm` | My read confirmations | Dokumenter › Venter på deg (+ approvals); Håndbok tab "Venter på deg" filtered to procedures | keep | HUBS |
| M59 | `/documents/campaigns/**` | Read campaigns | Dokumenter hub link "Lesekampanjer" (distribute permission) | keep | HUBS |
| M60 | Document templates (`/settings/modules/documents/templates`) | Templates | Dokumenter › Maler → new read view `/documents/templates` (list + "Bruk mal"); editing stays in settings | new | HUBS |
| M61 | Generated outputs (`/library/generated/:id`) | Locked, generated reports | Dokumenter › Arkiv → new `/documents/archive` (generated outputs list) and Rapporter › Arkiv | new | HUBS (page) / RAPPORTER (route move) |
| **Reports (M23) and library (U11)** |||||
| M62 | `/reports` (compliance overview) | Compliance status | **Rapporter** hub `/reports`; compliance overview moves to `/reports/status` ("Status og nøkkeltall") | hub + moved | RAPPORTER |
| M63 | `/reports/dashboards` | Custom dashboards config | Rapporter › Status og nøkkeltall link | keep | RAPPORTER |
| M64 | `/reports/calendar` (+ `.ics` export) | Compliance calendar | **Årshjul** `/annual-cycle` (ICS subscribe button there) | redirect | ARSHJUL |
| M65 | `/library` | Outputs by audience | Rapporter hub | redirect | RAPPORTER |
| M66 | `/library/saved` | Saved outputs | `/reports/saved` | moved | RAPPORTER |
| M67 | `/library/generated/:id` | Generated output | `/reports/generated/:id` | moved | RAPPORTER |
| M68 | `/library/registers` (and old `/reports/registers`) | Register exports | `/reports/exports` | moved | RAPPORTER |
| M69 | `/library/reports/**` (and old `/reports/definitions/**`) | Custom report definitions, schedules, runs | `/reports/custom/**` ("Egne rapporter") | moved | RAPPORTER |
| M70 | `/library/audit-packs/**` (and old `/reports/audit-packs/**`) | Audit packs | `/reports/audit-packs/**`; shown under Til revisor | moved | RAPPORTER |
| **Standards (expert view)** |||||
| M71 | `/standards`, `/standards/readiness`, `/standards/gaps/:key`, `/standards/:key` (workspace), legacy `:key/clauses(/:number)`, `/iso` → `/standards` | Standards workspace, readiness, gaps, requirement locations | Rapporter › Standarder (ekspertvisning). Requirement chips always visible here | keep | RAPPORTER |
| **Registers hub (U04)** |||||
| M72 | `/registers` | Every register by job area, counts | Rapporter hub footer "Alle registre (A–Å)"; command palette | keep | RAPPORTER |
| **Custom records (F4)** |||||
| M73 | Records of custom record types (opened from `/registers` and search) | Org-defined registers | Rapporter › Alle registre; record URLs unchanged | keep | RAPPORTER |

### 3.5 Backend modules (coreflow-core `app/modules/*`, `app/platform/*`)

Every backend module is reached through the portal homes above; listed here so nothing is
forgotten when aggregators are built.

| Backend | Home in IA v2 | Feeds aggregators |
|---|---|---|
| modules/ai_governance | Bedriften › Fagområder › KI-systemer | Årshjul (due provider), Rapporter (outputs) |
| modules/assets | Fagområder › IT og utstyr; Folk › Tilgang | Årshjul |
| modules/audits | Årshjul › Revisjoner | Årshjul, Rapporter, Bedriften header |
| modules/chat | Inbox | Inbox badge |
| modules/context | Bedriften | Årshjul, hub counts |
| modules/continuity | Fagområder › Beredskap | Årshjul, Dokumenter › Planer |
| modules/contracts | Kontakter › Avtaler | Kontakter, Årshjul |
| modules/customers | Kontakter › Kunder | Kontakter, Saker (where) |
| modules/deviations (+ services/deviation_service) | Meld fra / Saker | Saker, Årshjul, Håndbok status dots |
| modules/documents | Dokumenter, Håndbok (procedures) | Årshjul (reviews), Håndbok |
| modules/environment | Fagområder › Miljø | Årshjul |
| modules/feedback | Kontakter › Kundeundersøkelser; Saker | Saker, Kontakter |
| modules/hse | Folk › HMS | Årshjul |
| modules/inspections | Årshjul › Inspeksjoner | Årshjul |
| modules/management_review | Årshjul › Ledelsens gjennomgang | Årshjul, Rapporter |
| modules/objectives | Bedriften › Mål og KPI-er | Årshjul, Håndbok "Hvordan går det" |
| modules/obligations | Bedriften › Lover og regler | Årshjul |
| modules/people | Folk | Årshjul |
| modules/privacy | Fagområder › Personvern; breaches → Saker; processors → Kontakter | Saker, Kontakter, Årshjul |
| modules/processes | Håndbok | Håndbok |
| modules/projects | Bedriften › Prosjekter | Årshjul |
| modules/recruitment | Folk › Rekruttering | Årshjul |
| modules/reports | Rapporter, Årshjul (calendar source) | Årshjul |
| modules/risk | Bedriften › Risikoer | Årshjul, Kontakter card, Håndbok "Hva kan gå galt" |
| modules/suppliers | Kontakter › Leverandører | Kontakter, Årshjul |
| modules/training | Folk › Opplæring | Årshjul, Oversikt |
| platform/tasks | Inbox, Årshjul (recurrences) | Årshjul, Oversikt |
| platform/journeys (`/home`, `/next-actions`) | Oversikt | Oversikt |
| platform/quick_create | Meld fra, "+ Ny" | Meld fra |
| platform/outputs | Rapporter, Dokumenter › Arkiv | Rapporter |
| platform/locations (`/locations/counts`) | Hub card counts, Registre | Bedriften, Folk, Dokumenter hubs |
| platform/frameworks, services/standards_* | Rapporter › Standarder; Oversikt "Hvor står dere?" | Oversikt |
| platform/search | Command palette | — |
| platform/records (F4) | Innstillinger + Registre | — |
| platform/guidance, ux_metrics, realtime, events, kit (links, suggestions), starter_setup | cross-cutting, unchanged | — |

---

## 4. Shell contract (owner: SHELL)

### 4.1 Files

- `src/app/layout/areas.ts` — **the single source of the IA**: `AREAS: readonly AreaDef[]`.
- `src/app/layout/top-menu/top-menu.ts` (+ spec) — the menu row and dropdown.
- `src/app/layout/top-bar/top-bar.ts` — rewritten: brand, `<app-top-menu>`, right cluster.
- `src/app/layout/inbox/inbox-button.ts` (+ spec) — inbox button and panel.
- `src/app/layout/account-menu/account-menu.ts` — extended (settings, admin, help, org switch).
- `src/app/layout/main-layout/main-layout.{ts,html}` — no side nav, no drawer.
- `src/app/core/shell/requirements-visibility.service.ts` — Vis krav (code in 4.3).
- `src/app/shared/requirement-links/req-pills.ts` — `<app-req-pills>` (code in 4.3).
- `src/app/layout/legacy-redirects.ts` — all redirects of section 7 that live in app.routes.
- Deleted: `layout/side-nav/**`, `layout/side-nav-v2/**`, `layout/nav-v2.ts`,
  `layout/nav-drawer.service.ts`, `layout/help-menu/**`, the "Meny" settings row and the
  `shell.account.newMenu` / `showAll` UI. `core/shell/shell-preferences*` may stay for
  other preferences but `navV2`, `showAll` and `pins` are no longer read by the shell.
  `nav.ts` keeps only what other code imports (check with grep before deleting).

### 4.2 Area config (`layout/areas.ts`)

```ts
export interface AreaLink {
  readonly key: string;                 // stable id, e.g. 'cases'
  readonly path: string;                // router path, may include ?query (parsed with UrlTree)
  readonly labelKey: string;            // global i18n: nav.areas.<area>.items.<key>.label
  readonly hintKey: string;             // ... .hint (the grey line in the dropdown)
  readonly module?: string | readonly string[]; // hidden unless (any) module enabled
  readonly permission?: string | readonly string[]; // hidden unless ANY permission held
  readonly superuser?: boolean;
}
export interface AreaDef {
  readonly key: 'home' | 'speakUp' | 'annual' | 'company' | 'people' | 'contacts' | 'handbook' | 'documents' | 'reports';
  readonly path: string;                // the overview route
  readonly labelKey: string;            // nav.areas.<key>.label
  readonly prefixes: readonly string[]; // section 2.1
  readonly items: readonly AreaLink[];  // the dropdown (empty for Oversikt)
  /** Dynamic items appended after the static ones (Håndbok: one per process). */
  readonly dynamicItems?: 'processes';
}
```

Rules (implemented in a pure function `visibleAreas(areas, ctx)` with a unit test):

- An item is visible when its module(s) are enabled (`ModuleService`) **and** the user has
  one of its permissions **and** (if `superuser`) the user is a superuser. Module/permission
  keys mirror the guards of the target route (copy them from `nav.ts` today).
- An area is visible when **at least one** item is visible **or** its overview route is
  accessible (Oversikt, Meld fra, Årshjul, Bedriften, Folk, Kontakter, Håndbok, Dokumenter and
  Rapporter overview routes are **not** module-guarded; they render the sections the user can
  see and an empty-state otherwise). So an enabled area is never hidden.
- Håndbok dynamic items come from `GET /orgs/{org}/processes/handbook` (section 6.4), cached
  in a signal service (`features/handbook/data/handbook-store.ts`, owned by HANDBOK; SHELL
  calls `inject(HandbookStore).menuItems()` behind a lazy import so the shell bundle stays
  small). Until HANDBOK lands, SHELL renders only the static items.
- Active area: longest matching prefix of the current URL (section 2.1).

### 4.3 Vis krav (global)

`src/app/core/shell/requirements-visibility.service.ts` — create verbatim (any engineer who
needs it before SHELL merges may add the identical file; SHELL's copy wins on conflict):

```ts
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SelectedOrgService } from '../org/selected-org.service';

const KEY = 'coreflow.showReq.';
/** Pages where requirements are the point: always shown, the switch is ignored. */
const EXPERT_PREFIXES = ['/standards', '/settings/modules', '/reports/audit-packs'];

/**
 * "Vis krav" (IA v2 §4.3): requirement chips and panels are hidden by default and
 * shown when the user switches this on. Per user and org, remembered in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class RequirementsVisibilityService {
  private readonly org = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly _on = signal(false);
  private readonly _url = signal(this.router.url);
  /** The switch itself. */
  readonly on = this._on.asReadonly();
  /** On an expert page (standards workspace, SoA, audit packs). */
  readonly expert = computed(() => EXPERT_PREFIXES.some((p) => this._url().startsWith(p)));
  /** What components read: show requirement chips / panels now. */
  readonly show = computed(() => this._on() || this.expert());

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this._url.set(e.urlAfterRedirects));
    // Re-read the remembered value whenever the selected org changes.
    effect(() => {
      const orgId = this.org.currentOrgId();
      untracked(() => this._on.set(this.read(orgId)));
    });
  }

  toggle(): void {
    this.set(!this._on());
  }

  set(on: boolean): void {
    this._on.set(on);
    try {
      localStorage.setItem(KEY + (this.org.currentOrgId() ?? 'none'), on ? '1' : '0');
    } catch {
      /* private mode: in-memory only */
    }
  }

  private read(orgId: string | null): boolean {
    try {
      return localStorage.getItem(KEY + (orgId ?? 'none')) === '1';
    } catch {
      return false;
    }
  }
}
```

(Keep the public API `on`, `show`, `expert`, `toggle`, `set` unchanged.)

`src/app/shared/requirement-links/req-pills.ts` — the prototype's `req(...)`:

```ts
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';

/** Small grey requirement chips ("ISO 27001 A.5.24"), shown only with Vis krav on. */
@Component({
  selector: 'app-req-pills',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (vis.show() && refs().length) {
      <div class="mt-1.5 flex flex-wrap gap-1.5" data-testid="req-pills">
        @for (r of refs(); track r) {
          <span class="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11.5px] text-fg-muted">{{ r }}</span>
        }
      </div>
    }
  `,
})
export class ReqPills {
  protected readonly vis = inject(RequirementsVisibilityService);
  readonly refs = input<readonly string[]>([]);
}
```

Export it from `shared/requirement-links/index.ts`.

Components that must honour `show()` (render nothing when false), all owned by SHELL:

- `shared/requirement-links/*`: `requirement-chips`, `requirement-chip`, `coverage-chip`,
  `supports-requirements` (the "Krav" panel on detail pages, ux-guide §2.7), and
  `clause-picker` inside forms (hidden with a one-line hint "Slå på «Vis krav» for å koble
  til krav" when the field is empty; shown read-only when it already has values).
- `shared/requirement-locations/*`: `fulfils-requirements`, `location-hint`,
  `location-card`, `basis-summary`, `location-links`, `location-status-icon`.
- `ReqPills` (new).

Not affected (always visible): everything under `/standards/**`, SoA pages, gaps, readiness,
audit packs, and the requirement fields inside `/settings/modules/**`.

The switch: `role="switch"`, `aria-checked`, label "Vis krav" (sm and up; below sm the
switch alone with `aria-label` "Vis hvilke standardkrav ting oppfyller"); toast on toggle
"Viser hvilke krav hver ting oppfyller" / "Kravene er skjult igjen".

### 4.4 Inbox

One button (icon `inbox`, badge = overdue tasks + due-this-week tasks + unread chat
conversations + unread notifications; "9+" above 9). Panel (popover, full-width sheet below
sm) with three tabs:

- **Oppgaver** — top 6 items from `GET /orgs/{org}/my-work` (existing, `MyWorkOut`), each
  with its one action; footer "Se alt arbeid →" `/my-work`, "Alle oppgaver" `/tasks`.
- **Meldinger** — unread conversations from the existing chat unread service used by
  `ChatTopButton` (`shared/chat`); footer "Åpne chat →" `/chat`. Hidden when chat is off or
  `chat:use` is missing.
- **Varsler** — the list rendered today by `NotificationBell` (reuse its service/component
  body); "Merk alle som lest".

Default tab: the first with unread content.

### 4.5 Account menu (avatar)

Top: name, e-mail, current org; "Bytt bedrift" (org switcher, only >1 org).
Groups, in order:

1. **Meg**: Min profil og passord (`/account/password`), Sikkerhet (`/account/security`),
   Økter (`/account/sessions`), Mine varsler (`/account/notifications`).
2. **Utseende og språk**: theme, language, guidance level (as today).
3. **Hjelp og læring**: Læringssenter (`/account/learning`), Spør CoreFlow (opens panel),
   Hurtigtaster (Ctrl K / Ctrl J hint).
4. **Administrasjon** (only when the user holds any of `SETTINGS_NAV_ITEM.permission` or is
   superuser): Innstillinger (`/settings`), Moduler (`/settings/modules`), Oppsett av
   bedriften (`/setup`, `org:manage`), Alle organisasjoner (`/admin/organizations`,
   superuser).
5. Logg ut · Logg ut overalt.

### 4.6 Layout and mobile

- Top bar: sticky, `bg-surface`, border-bottom, inner max width 1240px, 16px side gutter
  (`max(16px, env(safe-area-inset-*))`). Brand (✦ CoreFlow) links to `/home`.
- Menu row: `flex`, `overflow-x: auto`, hidden scrollbar, items `flex: none`, works at every
  width. Below `lg` the menu moves to a **second row** under the brand/right cluster (full
  width, still horizontally scrollable) so the right cluster never collides. Scrolling the
  row or resizing closes an open dropdown. The active item scrolls into view on navigation.
- Dropdown: `position: fixed` under its item, clamped to the viewport (16px margin),
  `max-height: calc(100vh - 120px)`, scrollable; opens on ▾ click/tap/Enter/Space/ArrowDown,
  and on hover only when `(hover: hover) and (pointer: fine)` (180 ms close delay; moving
  into the panel keeps it open). Escape closes and returns focus to the ▾ button; arrow keys
  move between items; `aria-expanded`, `aria-controls`, `role="menu"` / `menuitem`.
  Outside click closes. The label link itself never opens the dropdown.
- Main content: no side nav; `main` scrolls; `pb-20` kept for the floating button. Page
  container for the new area pages: `max-w-[1240px] mx-auto px-4 sm:px-6 py-7`.
- Floating "✦ Spør CoreFlow": pill with text from sm, round icon below sm; bottom-right with
  safe-area insets; opens the existing `AskPanelService`.
- No horizontal page scroll at 360px; every area page must pass at 360, 768 and 1280px.

### 4.7 Global i18n (SHELL owns `src/assets/i18n/{en,nb}.json`)

SHELL adds `nav.areas.<areaKey>.label` and `nav.areas.<areaKey>.items.<itemKey>.{label,hint}`
for every item in section 2 (both languages), `nav.areas.seeAll` ("Se hele oversikten →"),
`shell.showRequirements.*`, `shell.inbox.*`, `shell.account.*`, `shell.ask.label`
("Spør CoreFlow"). Area engineers **never edit the global files**; they put their copy in their
own Transloco scope (section 9) loaded with `provideSharedScope('<scope>')` in
`viewProviders`. Route `title` keys for new area routes: SHELL adds `nav.areas.<key>.label`
and the area route files use them as `title`.

Old keys (`nav.sections.*`, `shell.nav.*`, `shell.registrer.*` for the nav button) are
removed only after grep shows no users; keep parity.

---

## 5. Page contracts per area

All area overview pages: page head = h1 + one-sentence intro (prototype wording) + at most one
primary action; cards use the prototype anatomy (`card`, `card-head` with h2 + link-button);
lists use one action per row; requirement refs via `<app-req-pills>`. Loading = skeletons,
errors = inline neutral message with retry; every section hides itself when its module is
off or permission missing.

### 5.1 Oversikt `/home` (OVERSIKT)

Data: `GET /orgs/{org}/home` (existing `HomeOut`: workspace, quick_actions, frameworks,
next_actions, my_work, journeys, setup); `GET /orgs/{org}/reports/calendar?start=now&end=+30d`
(existing) for "Snart frist" (first 3–5, or ARSHJUL's `GET /annual-cycle?from=…&months=1` once
available — use the calendar endpoint to stay independent).

Sections:

1. Greeting "God morgen / God dag / God kveld, {fornavn}" (05–10 / 10–17 / 17–05 local) and a
   summary sentence: "Du har {n} ting å gjøre denne uken." + the most urgent next action's
   title when it is high priority ("Det viktigste er …"). Zero → "Alt er i rute denne uken."
2. Quick actions (4 tiles, prototype): Meld fra (`/speak-up`), Legg til leverandør (opens
   Registrer dialog type `supplier`, or `/suppliers/new`), Ny policy (`/documents/new?type=policy`
   with form-suggest), Lag rapport (`/reports`). A tile whose permission is missing is
   replaced by the next from `HomeOut.quick_actions`.
3. **Dette bør du gjøre nå** — `next_actions` (max 5) merged with overdue items from
   `my_work`; each row: severity dot (priority → bad/warn/info), bold title, grey "why" line,
   req pills (optional `requirement_refs` on `NextActionOut`, see 6.1), one button (label from
   the action kind: "Vurder nå", "Les og godkjenn", "Send påminnelse", "Se forslaget" …,
   fallback "Åpne"). Counter "n av m". Dismiss stays available via the row's overflow.
4. **Snart frist** — 3 rows date tile + title + grey line; link "Hele årshjulet" → `/annual-cycle`.
5. **Hvor står dere?** — one row per enabled framework from `HomeOut.frameworks`: friendly
   name + grey standard code, percentage, bar (green ≥80, amber 50–79, red <50); footnote
   from the prototype. Row links to `/standards/journey/:framework`.
6. Setup card while `setup` is incomplete (existing component).

Old `/dashboard` widgets that are not in the prototype (custom dashboard widgets, journeys
list) move to Rapporter › Status og nøkkeltall (`/reports/status`) — RAPPORTER keeps
`/reports/dashboards`; OVERSIKT removes them from the landing page. No permission guard on
`/home`; employees see the same page with their own data.

### 5.2 Meld fra `/speak-up` and Saker `/cases` (MELD)

**Meld fra** — three steps (prototype `meldStep`): "1 · Hva har skjedd?" → "2 · Sjekk
forslaget" → "3 · Ferdig".

1. Chips (one pressed): Noe gikk galt (`deviation`) · Noen ble skadet eller nesten skadet
   (`near_miss`, kind injury/near_miss decided by the proposal) · Personopplysninger på avveie
   (`data_breach`) · Sikkerhetshendelse (`security_incident`) · En kunde klaget (`complaint`) ·
   Jeg har en idé (`improvement`). Only types the user may create are shown (quick-create
   `GET /quick-create/types` `available`). Textarea "Hva har skjedd?", "Legg ved bilde"
   (attachment after create), link "Se alle saker (n åpne) →". Button "Lag forslag".
2. AI note "✦ Forslag fra CoreFlow. Laget ut fra det du skrev … Endre det som ikke stemmer."
   Fields: Hva slags hendelse (type select), Hvor alvorlig (Høy/Middels/Lav), Hvem er berørt
   (entity refs: customer, supplier, process, asset, person), Ansvarlig (user), Hva er gjort
   allerede (textarea), Frist (pill with the legal deadline when one applies, e.g. GDPR 72 h)
   + req pills. Buttons "Meld fra" (primary), "Tilbake". When AI is off (503) or fails, show
   the same fields empty with defaults from the chip and the note "Fyll ut selv – forslag er
   ikke tilgjengelig nå".
3. Success: ✓ "Takk, det er meldt fra", "{code} er opprettet, og {owner} har fått beskjed.
   Dette skjer videre:" + ordered next steps from the API + buttons "Til oversikten",
   "Meld noe annet".

Endpoints: `POST /speak-up/propose`, `POST /speak-up` (6.2). Link "Bruk fullt skjema" opens
the module form for the chosen type.

**Saker** `/cases` — page head "Saker" + intro + primary "Meld fra". Tabs Åpne (n) · Mine (n)
· Lukket (n) (`?tab=open|mine|closed`, default open). Filter chips by type
(`?type=deviation|near_miss|security_incident|data_breach|complaint|improvement|feedback|intake`)
and search. Table: Sak (bold title + grey "CODE · type label · reporter"), Hvor i bedriften
(process / department / customer label), Status (pill), Frist (pill when <7 days or overdue,
else muted date). Row click → record URL. Secondary links: Tiltak, Statistikk, Varslinger
(permission), Avansert liste (`/deviations/all`). Endpoint `GET /cases` (6.2).

MELD route changes: `deviations.routes.ts` '' → redirect `/cases?type=deviation` (keep query);
the list component moves to path `all`.

### 5.3 Årshjul `/annual-cycle` (ARSHJUL)

Page head "Årshjul" + intro + primary "Foreslå årshjul for {next year}" (from November; else
"Foreslå årshjul"). Secondary: "Abonner i kalenderen" (existing `calendar.ics`), filter by
area (Alle, Meld fra, Bedriften, Folk, Kontakter, Håndbok, Dokumenter) and "Bare mine".

1. **12-month strip** (current month first, `now` highlighted; 6 columns below 700px): per
   month up to 6 dots coloured by status (bad = overdue, warn = due soon/not planned, info =
   planned, plain = recurring). Clicking a month scrolls to its list section.
2. **Year list** grouped by month (h3 "November"): row = bold title, grey line "{area} ·
   {module label}" or "Hvert år · Ansvarlig: {name}", req pills, status pill (Forfalt,
   "{n} dager", Planlagt, "{n} % klart", Ikke planlagt), one action button (from the API:
   "Send påminnelse", "Åpne leverandør", "Minn på", "Se grunnlaget", "Start", "Godkjenn
   forslaget", "Planlegg"). Overdue items appear in the current month.
3. "Foreslå årshjul" → `POST /annual-cycle/propose` → review dialog listing proposed duties
   (checkbox each, owner, month, recurrence) → `POST /annual-cycle/accept` creates them
   (recurring tasks, draft audit plan, draft management review, exercise) → toast "Forslag
   til nytt årshjul er laget – se gjennom og godkjenn" / "… lagt i årshjulet".

Dropdown sub-pages (Revisjoner, Inspeksjoner og vernerunder, Ledelsens gjennomgang,
Gjentakende oppgaver) are the existing module pages. `/reports/calendar` redirects here
(section 9.3: RAPPORTER makes that one-line change, ARSHJUL does not edit the file). Endpoint
`GET /annual-cycle` (6.3).

### 5.4 Bedriften `/company` (HUBS)

1. Card "Bedriften på én side": eyebrow, h1 org name, line "Org.nr. … · {bransje} · {n}
   ansatte · {steder}" from the org profile facts (`/settings/profile` API used by
   `org-modules/profile/org-profile`), button "Rediger profil" → `/settings/profile`.
   Key-value row: Standarder (enabled frameworks), Daglig leder (profile fact / top management
   responsibility), Neste ekstern revisjon (audits certifications: earliest upcoming external
   audit date; hidden when audits off), Trenger oppmerksomhet (count of next actions whose
   module belongs to Bedriften, pill warn).
2. Hub "Alt om bedriften" (intro from prototype) — cards with count (from
   `GET /locations/counts`, by location key), name, grey description: Interessenter, Policyer,
   Roller og ansvar, Mål og KPI-er, Risikoer og muligheter, Lover og regler, Omfang og
   kontekst, Prosjekter, **Prosesser** (→ `/handbook`, as the prototype does). A card whose
   module is off is not shown.
3. Section **Fagområder** (gap fix, D3) — cards: Personvern (`/privacy`), IT og utstyr
   (`/assets`), KI-systemer (`/ai-governance`), Miljø (`/environment`), Beredskap og
   kontinuitet (`/continuity`); each with a count and a status sentence. `/company/topics`
   renders the same section alone (dropdown target).
4. Empty org: "Foreslå med intervju" → `/context/interview`.

### 5.5 Folk `/people` (HUBS)

Hub "Folk" (prototype intro) with cards + counts: Personer (`/people/employees`), Opplæring
(`/training`), Kompetanse (`/people/competences`), Rekruttering (`/recruitment`), HMS
(`/hse`), Tilgangsgjennomgang (`/assets/access-reviews`). Below: "Dette trenger
oppmerksomhet" — up to 5 next actions/calendar items from the people, training, recruitment,
hse modules (e.g. "3 ansatte mangler brannvernopplæring" + "Send påminnelse"). Links: "Brukere
i CoreFlow" (`/settings/members`, permission), "Sjekklister for start og slutt"
(`/people/checklists`), "KI-kompetanse" (`/ai-governance/literacy`).

Routing (HUBS edits `app.routes.ts`? **No** — SHELL wires it, section 9): `/people` becomes
`{ path: 'people', children: [ { path: '', pathMatch: 'full', title, loadComponent: FolkHub },
{ path: '', canActivate: [moduleGuard('people'), permissionGuard('people:read')],
loadChildren: people.routes } ] }`. HUBS removes the `'' → employees` redirect in
`people.routes.ts`.

### 5.6 Dokumenter `/documents` (HUBS)

Page head "Dokumenter" + intro (prototype; link to Håndbok) + "Last opp" + primary "+ Nytt
dokument" (`/documents/new`, form-suggest). Hub tiles with counts: Policyer, Planer, Maler,
Eksterne dokumenter, Arkiv, Venter på deg. Then the table (Dokument / Type / Status / Neste
gjennomgang) = documents list `GET /documents?handbook=false` (non-procedure types, see 6.4)
first 20, link "Alle dokumenter" → `/documents/all`. Links: Dokumentregister
(`/documents/register`), Lesekampanjer (`/documents/campaigns`, permission).

- Policyer = document types with key `policy` (+ link "Policyerklæringer i Bedriften").
- Planer = types `plan` + continuity plans + environment emergency plans (counts summed; the
  tile opens `/documents/all?kind=plan` with a side note linking the two module registers).
- Maler = `/documents/templates` (new read-only list of document templates, reuse the
  templates API of `documents-config`; "Bruk mal" → `/documents/new?template=:id`).
- Eksterne = `/documents/external`.
- Arkiv = `/documents/archive` (new: generated outputs list, reuse `library/generated-list`
  component and `GET /generated-outputs`), footer link "Slettede dokumenter" (settings).
- Venter på deg = `/documents/read-confirm` + approvals waiting for me.

Routing: SHELL wires `/documents` like `/people` (hub at '' unguarded, module children
guarded). HUBS changes `documents.routes.ts`: list '' → `all`, adds `templates`, `archive`.
`?kind=` filters the list by document type key (`kind=plan` also matches type keys starting
with `plan`).

### 5.7 Kontakter `/contacts` and company card `/contacts/:key` (KONTAKTER)

Page head "Kontakter" + intro (prototype) + primary "+ Ny kontakt" (menu: Kunde, Leverandør,
Databehandler, Avtale). Tabs: Alle (n) · Kunder (n) · Leverandører (n) · Databehandlere (n) ·
Avtaler (n) (`?tab=`). Table for companies: Navn (bold + "Org.nr. … · by"), Rolle (chips),
Status (pill), Neste (pill or muted text). Avtaler tab: contracts table (Avtale, Motpart, Type,
Fornyes / oppsigelsesfrist, Status) from the existing contracts list API. Each tab has a
footer link to the full module register (`/customers`, `/suppliers`, `/privacy/processors`,
`/contracts`, `/contracts/deadlines`, `/suppliers/evaluations`). Header link "Mulige
duplikater (n)" → `/customers/matches` for writers.

Company card `/contacts/:key` (prototype `leverandor`): breadcrumb Kontakter › name; h1;
role chips + status pill; status sentence (bold fragments); actions "Start evaluering"
(supplier role) / "Rediger" (menu per role record). Cards (2-col grid, 1-col <760px):
Avtaler (contracts incl. DPA, notice pills) · Personopplysninger de behandler (ROPA entries,
country) · Risiko (linked risks with level pills) · Evalueringer og hendelser (supplier
evaluations, deviations/complaints/feedback, breaches) · Kunde (for the customer role: open
complaints, projects, satisfaction) — each with req pills and "Legg til". Footer links "Åpne
i kunderegisteret / leverandørregisteret / databehandlerregisteret". Endpoints 6.5.

Old landing redirects: none (module lists stay; decision D5).

### 5.8 Håndbok `/handbook` and process page `/handbook/:id` (HANDBOK)

Page head "Håndbok" + intro (prototype) + "Foreslå prosesskart" (AI, existing process
`ai.py` generation where possible; else hidden) + primary "+ Ny prosedyre"
(`/documents/new?type=procedure`). Tabs: Prosesskart · Alle prosedyrer (n) · Venter på deg (n).

**Prosesskart**: band "Ledelse · styrer retningen" (management processes) → link text "↓
styrer og følger opp" → core band "Kjerneprosesser · det dere lever av" with the chain:
end-box "Kunden har et behov" → arrow → process boxes in `chain_order` → arrow → end-box
"Fornøyd kunde" (vertical with rotated arrows below 820px) → "↑ støtter" → band
"Støtteprosesser · gjør leveransen mulig". Process box: title, status dot + "{n} prosedyrer ·
{owner first name}". Footnote explaining dots (prototype). Empty state: "Dere har ikke laget
prosesskartet ennå" + "Foreslå prosesskart" + "+ Ny prosess". Links: "Samspill mellom
prosessene" (`/processes/interaction-map`), "Alle prosesser" (`/processes/all`), "Rekkefølge"
(writers: drag/arrow buttons to set chain order, `PUT /processes/handbook/order`).

**Alle prosedyrer**: documents in handbook types grouped by process (via linking rule 6.4),
"Uten prosess" group last. **Venter på deg**: my read confirmations + approvals for handbook
documents.

**Process page**: breadcrumb Håndbok › Prosesskart › name; h1; status line "{Kjerneprosess |
Ledelsesprosess | Støtteprosess} · Eier: {name} · {n} prosedyrer" + pill "{n} åpent avvik";
actions "+ Ny prosedyre" (primary, pre-linked to the process), "Spør om prosessen" (opens Ask
with the process as context), "Detaljer og redigering" (`/processes/:id`). h2 "Slik gjør vi
det": flow = "← Fra: {prev}" (or "← Kunden har et behov" for the first core process) →
steps ("Trinn n", bold label, role, "¶ {procedure}" link) → "Til: {next} →" (or "Fornøyd
kunde →"). Steps come from the process map (6.4); when the map is empty show "Ingen trinn ennå"
+ "Lag trinnene" → `/processes/:id/map`. Cards: Prosedyrer og skjemaer (version, approved
month, read %, pill "Bør oppdateres" when review overdue) · Hvem gjør hva (owner + step
roles) · Hva kan gå galt (linked risks + `process.risks`) · Hvordan går det (process KPIs with
target, "Saker siste 12 måneder" open/closed linking `/cases?process=:id`) — each with req
pills.

### 5.9 Rapporter `/reports` (RAPPORTER)

Page head "Rapporter" + intro (prototype) + button "Standarder (ekspertvisning)" →
`/standards`. Four group cards (2-col, 1-col <860px), from `GET /orgs/{org}/outputs`
(existing; `audience`, `readiness.missing`):

| Group (nb) | `audience` values | `?to=` |
|---|---|---|
| Til revisor | `auditor` (+ audit packs list, SoA) | `auditor` |
| Til Datatilsynet | `authority` | `authority` |
| Til styret | `board` | `board` |
| Til kunder og ansatte | `customers`, `employees` | `people` |

An output with several audiences appears in each matching group. Row: bold title, grey meta
(description / last generated), status pill: `Klar` (ok, missing = 0), `Mangler {n}` (warn),
`Utkast` / `Ny` where the output says so; one button: "Last ned" when ready (existing
generate/download flow, format menu if several), else "Se hva som mangler" (readiness
checks with links to where to fill in). `?to=` scrolls to / filters that group.

Below the groups: links row "Status og nøkkeltall" (`/reports/status`), "Egne rapporter"
(`/reports/custom`), "Lagrede" (`/reports/saved`), "Arkiv" (`/reports/generated` list =
same component as Dokumenter › Arkiv), "Eksport av registre" (`/reports/exports`), "Alle
registre (A–Å)" (`/registers`), "Utseende på rapporter" (`/settings/branding`).

Routing (RAPPORTER owns `features/reports/reports.routes.ts`, `features/library/**`): the
hub at '' (no module guard — wired by SHELL like `/people`), module children: `status`
(compliance overview, reports module), `dashboards`; library children re-hosted: `saved`,
`generated/:id`, `exports` (was library/registers), `custom`, `custom/new`, `custom/:id`,
`custom/:id/edit`, `audit-packs`, `audit-packs/:id`. Delete `REPORTS_REDIRECTS` (they point
to /library and would loop) and replace with the redirects in section 7.

---

## 6. Backend: new endpoints and migrations (coreflow-core)

All new endpoints are under `/api/v1/orgs/{org_id}/…`, check org membership, apply each
source module's read permission, module gate and record visibility (reuse the existing
`restrict_to_viewable` helpers and `registry.resolve_entities`), and are covered by targeted
tests (`cf-test.ps1 -Quick <paths>`). New platform packages follow the `platform/quick_create`
pattern (manifest + routes, auto-discovered). Language via `lang` query / Accept-Language like
`platform/journeys`.

### 6.1 Oversikt (OVERSIKT, optional)

- Add `requirement_refs: list[str] = []` to `NextActionOut` (`platform/journeys/schemas.py`)
  filled where the action knows its clause (display labels like "GDPR art. 33"). Optional;
  ship only if cheap. No new endpoint.

### 6.2 Meld fra / Saker (MELD) — `app/platform/speak_up/`

`POST /orgs/{org_id}/speak-up/propose`

```json
// in
{ "text": "string (1..5000)", "type_hint": "deviation|near_miss|security_incident|data_breach|complaint|improvement|null", "lang": "nb|en|null" }
// out 200
{
  "type": "data_breach", "kind": "string|null",
  "title": "string", "description": "string",
  "severity": "low|medium|high",
  "affected": [{ "entity_type": "customer", "id": "uuid", "label": "Nordic Steel Components AS" }],
  "owner": { "user_id": "uuid", "name": "Sofie Johansen", "reason": "personvernansvarlig" } ,
  "due_at": "2026-11-27T14:10:00Z|null",
  "deadline": { "key": "gdpr72h", "params": { "hours_left": 46 } } ,
  "immediate_actions": "string|null",
  "requirement_refs": ["GDPR art. 33", "ISO 27001 A.5.24"],
  "rationale": "string"
}
```

503 `ai_unavailable` when AI is off; 502 `propose_failed`. Uses the structured-output helper
used by `app/ai/form_suggest.py`; owner chosen from responsibilities (context RACI) / module
owner roles; affected from search (`platform/search`) over customers, suppliers, processes,
assets. No vendor names in any user-facing string.

`POST /orgs/{org_id}/speak-up`

```json
// in
{ "type": "...", "kind": null, "title": "...", "description": "...", "severity": "high",
  "owner_user_id": "uuid|null", "due_at": "iso|null", "affected": [{ "entity_type": "...", "id": "uuid" }],
  "immediate_actions": "string|null", "occurred_at": "iso|null" }
// out 201
{ "entity_type": "data_breach", "id": "uuid", "code": "BRUDD-0007", "url": "/privacy/breaches/<id>",
  "owner_name": "Sofie Johansen",
  "next_steps": [{ "key": "assessAuthority", "params": { "owner": "Sofie", "deadline": "..." }, "url": "/reports?to=authority" }] }
```

Creates through `platform/quick_create/service.py` (same authorisation and module gate),
then sets the extra fields through the target module's service; affected entities become
kit entity links. Next steps are rule-based per type (breach: assess notification within
72 h + draft notice; injury: HSE follow-up; complaint: inform customer; idea: evaluated by
owner).

`GET /orgs/{org_id}/cases?tab=open|mine|closed&type=&process_id=&q=&limit=50&offset=0`

```json
{
  "items": [{
    "entity_type": "deviation", "id": "uuid", "code": "AVV-0031", "title": "...",
    "type": "complaint", "type_label": "Reklamasjon",
    "reporter_name": "Erik", "owner_name": "…",
    "where": { "kind": "process|department|customer|none", "label": "Produksjon og leveranse", "url": "/handbook/<id>" },
    "status": "in_progress", "status_label": "Tiltak pågår", "tone": "bad|warn|info|ok|plain",
    "due_at": "iso|null", "url": "/deviations/<id>", "module": "deviations"
  }],
  "counts": { "open": 5, "mine": 2, "closed": 31 },
  "total": 5
}
```

Sources: deviations (all categories; type from deviation type key / quick-create kind),
privacy breaches, feedback items of kind complaint/suggestion, intake reports (only with the
intake permission). "mine" = owner or reporter is the caller. "where": first linked process
(kit links), else department, else customer. Sorted: overdue first, then due date, then
newest.

### 6.3 Årshjul (ARSHJUL) — `app/platform/annual_cycle/`

`GET /orgs/{org_id}/annual-cycle?from=2026-11&months=12&area=&mine=false`

```json
{
  "months": [{ "month": "2026-11", "counts": { "overdue": 1, "soon": 1, "planned": 2, "not_planned": 0 } }],
  "items": [{
    "id": "deviation:uuid | recurrence:uuid:2027-01 | gap:internal_audit:iso27001",
    "source": "due|recurrence|gap",
    "entity_type": "contract", "entity_id": "uuid|null",
    "title": "Oppsigelsesfrist: Fjord Cloud Hosting AS",
    "subtitle": "Kontakter · Avtale fornyes 27. november",
    "area": "contacts", "module": "contracts",
    "month": "2026-11", "due_at": "iso",
    "recurrence_label": "Hvert år|null", "owner_name": "Erik Larsen|null",
    "status": "overdue|soon|planned|not_planned|progress",
    "status_label": "5 dager", "progress_pct": null,
    "action": { "kind": "open|remind|start|approve|plan", "label_key": "annual.actions.open", "url": "/suppliers/<id>", "method": "GET|POST", "endpoint": null },
    "requirement_refs": ["ISO 27001 A.5.20"]
  }],
  "truncated": false
}
```

Sources: (a) `modules/reports/sources.calendar_items` (every `HOOK_DUE_PROVIDERS` provider:
ai_governance, assets, audits, context, continuity, contracts, documents, environment,
feedback, hse, inspections, management_review, objectives, obligations, people, privacy,
projects, recruitment, risk, suppliers, training, records, tasks + built-in deviations,
actions, document reviews) over the window; (b) task recurrences (`platform/tasks`
`task-recurrences`) expanded into occurrences in the window that are not yet materialised;
(c) **duty catalogue gaps** — rule-based expected duties that have no planned item in the
next 12 months: internal audit per enabled framework (audits), management review (yearly),
risk review (half-yearly, risk register last reviewed), BCP exercise (continuity, yearly),
supplier re-evaluation (suppliers with evaluation older than their interval), DPIA review
(privacy), policy/document review (documents without next_review_at), training expiry
(training), access review (assets, half-yearly), safety round (hse), inspection schedules
(inspections), objectives follow-up, obligations compliance evaluation. ARSHJUL verifies for
each catalogue entry which due provider already covers it and only adds a gap item when
nothing is planned. Area mapping uses section 2.1 (module → area).

`POST /orgs/{org_id}/annual-cycle/propose` `{ "year": 2027 }` → `{ "items": [{ "key", "title",
"module", "month", "recurrence": "yearly|half_yearly|quarterly|monthly", "owner_user_id",
"rationale" }] }` (rule-based from the catalogue + org profile; AI wording optional).
`POST /orgs/{org_id}/annual-cycle/accept` `{ "items": [...] }` → creates task recurrences
(and draft audit plan / management review where those modules expose a create service) →
`{ "created": [{ "entity_type", "id", "url" }] }`.

Migration **cf231_annual_cycle** — only if a table is needed (e.g. dismissed gap items per
org: `annual_cycle_dismissal(org_id, gap_key, until)`); otherwise ship a no-op migration with
that id to keep the chain (section 6.6).

### 6.4 Håndbok (HANDBOK) — `app/modules/processes/` + `app/modules/documents/`

Migration **cf230_handbook** (down_revision = current head, verified 2026-11-22 as
`cf220_org_profile_facts`; re-check with the head script before writing):

- `process.chain_order INTEGER NULL` — position in its band (core: the value chain order;
  management/support: display order). Backfill: per org and category, ordered by `seq`.
- `document_type.handbook BOOLEAN NOT NULL DEFAULT false` — "shows in Håndbok as a work
  procedure". Backfill true for type keys in (`procedure`, `instruction`, `work_instruction`,
  `checklist`, `routine`, `form`). Editable in Innstillinger › Moduler › Dokumenter ›
  Dokumenttyper ("Vises i Håndboka").

Procedure ↔ process link rule (no new table): a document belongs to a process when it is the
process's `description_document_id`, a node `document_id` in `process.map`, or kit-linked to
the process. "Prosedyrer" counts handbook-type documents only.

Endpoints:

- `GET /orgs/{org_id}/processes/handbook` →
  ```json
  { "management": [Box], "core": [Box], "support": [Box] }
  // Box
  { "id": "uuid", "code": "P-03", "title": "Produksjon og leveranse", "category": "core",
    "chain_order": 3, "status": "active", "owner": { "user_id": "uuid", "name": "Erik Larsen" },
    "procedure_count": 6, "dot": "ok|warn|bad", "dot_reason": "open_case|review_overdue|review_soon|null",
    "open_cases": 1 }
  ```
  Only `active` (and `draft` for writers, marked) processes; `dot` = bad when an open
  deviation is linked or a procedure's review is overdue, warn when a review is due within
  30 days or the process review is due, else ok.
- `PUT /orgs/{org_id}/processes/handbook/order` `{ "category": "core", "ids": ["uuid", …] }`
  (manage permission) → 204.
- `GET /orgs/{org_id}/processes/{id}/handbook` →
  ```json
  { "process": Box, "kind": "core|management|support",
    "prev": { "id": "uuid", "title": "…" } , "next": null,
    "is_first_core": false, "is_last_core": false,
    "steps": [{ "n": 1, "label": "Klargjør produksjon", "role": "Produksjonsleder",
      "document": { "id": "uuid", "title": "Arbeidsinstruks: oppstart", "code": "INS-004", "version": 3, "status": "approved", "approved_at": "iso", "read_pct": 92, "review_overdue": false } }],
    "procedures": [DocRef], "roles": [{ "label": "…", "role": "…" }],
    "risks": [{ "id": "uuid|null", "title": "…", "level": "low|medium|high", "url": "…|null" }],
    "performance": { "kpis": [{ "name": "Leveranser uten avvik", "value": 94, "target": 98, "unit": "%" }],
      "cases_12m": { "open": 1, "closed": 4 } } }
  ```
  Steps: nodes of `process.map` of type task/subprocess/decision in walk order from the start
  node along edges (ties by x position), role = lane label, document from node
  `document_id`. prev/next only for core processes by `chain_order`.
- `GET /orgs/{org_id}/documents?handbook=true|false` — new filter on the existing list
  (joins `document_type.handbook`).
- `document_type` read/write schemas gain `handbook`.

### 6.5 Kontakter (KONTAKTER) — `app/platform/contacts/`

`GET /orgs/{org_id}/contacts?role=all|customer|supplier|processor&q=&limit=50&offset=0`

```json
{
  "items": [{
    "key": "no-923456781 | customer-<uuid> | supplier-<uuid> | processor-<uuid>",
    "name": "Fjord Cloud Hosting AS", "org_number": "923456781", "place": "Oslo", "country": "NO",
    "roles": ["supplier", "processor"],
    "refs": { "customer_id": null, "supplier_ids": ["uuid"], "processor_ids": ["uuid"], "contract_ids": ["uuid"] },
    "status": { "key": "approved|active|missing_dpa|blocked|prospect", "tone": "ok|warn|bad|plain" },
    "next": { "key": "noticeIn|openComplaints|signDpa|renewsIn", "params": { "days": 5 }, "tone": "warn", "due_at": "iso|null" }
  }],
  "counts": { "all": 18, "customer": 9, "supplier": 11, "processor": 4, "agreements": 15 },
  "total": 18
}
```

Grouping key: normalised Norwegian org number (`modules/customers/names.normalise_org_number`)
from `customer.org_number`, `supplier.registration_number` (when it normalises to 9 digits),
`contract.org_number`; explicit links merge too (`processor.supplier_id`,
`contract.supplier_id`, `contract.customer_id`). Records without a number or link stay their
own company (`<kind>-<uuid>`). Name: customer name, else supplier, else processor. Each role
only when its module is on and the caller may read it.

`GET /orgs/{org_id}/contacts/{key}` →

```json
{ "key": "…", "name": "…", "org_number": "…", "roles": ["supplier","processor"],
  "status": { "key": "approved", "tone": "ok" },
  "sentence": { "key": "contacts.sentence.supplierRenewal", "params": { "purpose": "Drifter kundeportalen vår", "renews": "2026-11-27" } },
  "agreements": [{ "id": "uuid", "title": "Driftsavtale", "kind": "contract|dpa", "renews_at": "date|null", "notice_days": 30, "status": "signed|draft|expired", "tone": "warn", "url": "/contracts/<id>" }],
  "personal_data": [{ "id": "uuid", "title": "Kundenes kontaktinformasjon", "location": "Norge (EØS)", "url": "/privacy/ropa/<id>" }],
  "risks": [{ "id": "uuid", "title": "Nedetid i kundeportalen", "level": "medium", "url": "/risk/risks/<id>" }],
  "evaluations": [{ "id": "uuid", "title": "Evaluering 2025", "result": "approved", "next_due": "date", "url": "…" }],
  "incidents": [{ "entity_type": "deviation|feedback_item|data_breach", "id": "uuid", "title": "…", "status": "closed", "closed_at": "iso|null", "url": "…" }],
  "customer": { "open_complaints": 2, "projects": 1, "satisfaction": 4.2 } ,
  "links": { "customer": "/customers/<id>|null", "supplier": "/suppliers/<id>|null", "processor": "/privacy/processors/<id>|null" },
  "requirement_refs": { "agreements": ["ISO 27001 A.5.20","GDPR art. 28"], "personal_data": ["GDPR art. 30"], "risks": ["ISO 27001 A.5.19"], "evaluations": ["ISO 9001 8.4"] } }
```

Reuse `modules/customers/overview.py` for the customer section and the supplier
`agreements` / `evaluations` endpoints' services. 404 when the key resolves to nothing the
caller can read. Migration **cf232_contacts** only if needed (e.g. a manual merge table
`contact_merge(org_id, key_a, key_b)`); otherwise a no-op migration with that id.

### 6.6 Migration chain (fixed ids, so parallel branches do not create multiple heads)

```
cf220_org_profile_facts (head today)
  └─ cf230_handbook        (HANDBOK)   down_revision = "cf220_org_profile_facts"
      └─ cf231_annual_cycle (ARSHJUL)  down_revision = "cf230_handbook"
          └─ cf232_contacts (KONTAKTER) down_revision = "cf231_annual_cycle"
```

Each of the three engineers ships their file with exactly this `revision` / `down_revision`,
a **no-op** (`pass` upgrade/downgrade, docstring "reserved by IA v2") when they need no
schema change. Before writing, each re-runs the head check; if main gained another migration
after cf220, HANDBOK sets cf230's down_revision to that head and tells the integrator (the
other two are unaffected). Tests that need the chain run with all three present.

### 6.7 Rapporter, Bedriften, Folk, Dokumenter

No new endpoints. Rapporter uses `GET /outputs`; hubs use `GET /locations/counts`,
`GET /home` next actions (filter by module) and existing module lists.

---

## 7. Redirects (old → new)

Query strings are preserved (use the `moved()` helper from `library-redirects.ts`, moved to
`layout/legacy-redirects.ts`). Record URLs are never redirected.

| Old | New | Where implemented | Owner |
|---|---|---|---|
| `/` | `/home` | app.routes | SHELL |
| `/dashboard` | `/home` | app.routes | SHELL |
| `/procedures` | `/handbook` | app.routes | SHELL |
| `/iso` | `/standards` | app.routes (exists) | SHELL |
| `/learning` | `/account/learning` | app.routes (exists) | SHELL |
| `/context` (exact) | `/company` | context.routes | HUBS |
| `/processes` (exact) | `/handbook` (list moves to `/processes/all`) | processes.routes | HANDBOK |
| `/deviations` (exact) | `/cases?type=deviation` (list moves to `/deviations/all`) | deviations.routes | MELD |
| `/reports/calendar` | `/annual-cycle` | reports.routes | RAPPORTER (see 9.3) |
| `/library` | `/reports` | library.routes | RAPPORTER |
| `/library/saved` | `/reports/saved` | library.routes | RAPPORTER |
| `/library/generated/:id` | `/reports/generated/:id` | library.routes | RAPPORTER |
| `/library/registers`, `/reports/registers` | `/reports/exports` | library.routes / legacy-redirects | RAPPORTER |
| `/library/reports`, `/reports/definitions` | `/reports/custom` | same | RAPPORTER |
| `/library/reports/new`, `/reports/definitions/new` | `/reports/custom/new` | same | RAPPORTER |
| `/library/reports/:id(/edit)`, `/reports/definitions/:id(/edit)` | `/reports/custom/:id(/edit)` | same | RAPPORTER |
| `/library/audit-packs(/:id)` | `/reports/audit-packs(/:id)` (real route) | same | RAPPORTER |
| `/reports` compliance overview | now `/reports/status` (old `/reports` shows the hub) | reports.routes | RAPPORTER |

`library.routes.ts` keeps a tiny redirect-only route set so `/library/**` keeps working;
SHELL keeps the `library` entry in app.routes pointing at it.

Backend `url` fields that point at a landing page (e.g. `/dashboard`, `/library/...`) keep
working through these redirects; engineers update the ones they own when convenient.

---

## 8. Gaps found and where they went

Things that exist today and have no slot in the prototype, decided "the prototype way":

| Gap | Decision |
|---|---|
| Privacy registers other than breaches/processors/ROPA (DPIA, DSR, transfers, retention, consents, LBA, privacy documents) | **Bedriften › Fagområder › Personvern** (new section + dropdown item `/company/topics`); ROPA also in Rapporter › Til Datatilsynet; DSR deadlines in Årshjul/inbox |
| AI governance (systems, assessments, literacy) | Fagområder › KI-systemer; literacy linked from Folk › Opplæring |
| Environment (aspects, emergency plans, metrics, emissions) | Fagområder › Miljø |
| Continuity (BIA, BCP, exercises, ICT, contacts) | Fagområder › Beredskap og kontinuitet; plans in Dokumenter › Planer; exercises in Årshjul |
| Assets, calibration, change management | Fagområder › IT og utstyr; access reviews in Folk › Tilgang |
| Customer surveys / insights | Kontakter › Kundeundersøkelser (5th dropdown item) |
| Corrective actions, deviation statistics, whistleblowing intake queue | Meld fra dropdown: Tiltak, Varslinger; Statistikk as a Saker link |
| Recurring task series | Årshjul › Gjentakende oppgaver (+ occurrences in the year list) |
| Chat, my work, tasks, review queue, notifications | **Inbox** (tabs Oppgaver / Meldinger / Varsler) |
| Help menu, learning centre, org switcher, setup wizard, admin | Account menu groups |
| Command palette / search | Search icon + Ctrl/Cmd K in the top bar |
| Registrer quick create | Meld fra (incident types) + "+ Ny …" buttons (other types) |
| Shell v2 pins, "Vis alt", role-trimmed menu | Retired (D7) |
| Compliance overview, custom dashboards, journey widgets | Rapporter › Status og nøkkeltall (`/reports/status`) |
| Custom reports, saved, audit packs, register exports, registers hub, custom record registers | Rapporter link row + Til revisor (audit packs) |
| Generated outputs archive | Dokumenter › Arkiv and Rapporter › Arkiv (same component) |
| Document templates (only in settings today) | Dokumenter › Maler read view `/documents/templates` |
| Read campaigns, document register view | Dokumenter hub links |
| Process interaction map, process list, map editor, turtle, reviews | Håndbok links + process page "Detaljer og redigering" |
| Departments | Settings; linked from Bedriften › Roller og ansvar |
| Customer duplicate matching | Kontakter header link for writers |
| Contract deadlines page | Årshjul items + Avtaler tab link |
| SoA, gaps, readiness, journeys, requirement locations | Rapporter › Standarder (ekspertvisning); SoA also under Til revisor |
| ICS calendar export | Årshjul "Abonner i kalenderen" |
| Home workspace settings per role | stays in settings (affects what Oversikt shows) |

---

## 9. Work split (8 parallel engineers)

Each engineer works in its own worktree/branch from `main` in the repo(s) it needs, runs
only targeted tests + lint + typecheck/build for its files, and never edits files owned by
another engineer. Portal Transloco scopes are new folders under `src/assets/i18n/<scope>/`
with `en.json` + `nb.json` at full parity, provided with `provideSharedScope('<scope>')` in
`viewProviders` (route-level `provideTranslocoScope` is fine for lazy route trees).

### 9.1 Ownership table

| Engineer | Portal files (exclusive) | Core files (exclusive) | i18n scope | Migration |
|---|---|---|---|---|
| **SHELL** | `src/app/app.routes.ts`; `src/app/layout/**` (incl. new `areas.ts`, `top-menu/`, `inbox/`, `legacy-redirects.ts`; delete side-nav, side-nav-v2, nav-v2, nav-drawer, help-menu); `src/app/core/shell/**` (incl. `requirements-visibility.service.ts`); `src/app/shared/requirement-links/**`, `src/app/shared/requirement-locations/**` (Vis krav honouring + `req-pills.ts`); `src/app/features/org-settings/**` (remove "Meny" row only); `src/assets/i18n/en.json`, `nb.json`, `src/assets/i18n/shell/**`; `docs/ux-guide.md` §8; stub files listed in 9.2 | none (nav_v2 backend flag left in place, unused) | global + `shell` | — |
| **OVERSIKT** | `src/app/features/home/**` (new Oversikt page, route file `home.routes.ts`), `src/app/features/dashboard/**` (trim/reuse components) | `app/platform/journeys/**` (optional `requirement_refs`) | `home` (existing) | — |
| **MELD** | `src/app/features/speak-up/**` (Meld fra), `src/app/features/cases/**` (Saker), `src/app/features/deviations/deviations.routes.ts` (list → `all`, '' redirect) | `app/platform/speak_up/**` (new), read-only use of quick_create, deviations, privacy, feedback services | `speakup` | — |
| **ARSHJUL** | `src/app/features/annual-cycle/**` (does **not** edit `reports.routes.ts`, see 9.3) | `app/platform/annual_cycle/**` (new); read-only use of `modules/reports/sources.py`, `platform/tasks` | `annual` | `cf231_annual_cycle` |
| **HUBS** | `src/app/features/company/**` (Bedriften + `/company/topics`), `src/app/features/people-hub/**` (Folk hub component), `src/app/features/documents-hub/**` (Dokumenter hub, templates view, archive view), `features/people/people.routes.ts` ('' redirect removal), `features/documents/documents.routes.ts` (list → `all`, `templates`, `archive`), `features/context/context.routes.ts` ('' → `/company`) | none | `hubs` | — |
| **KONTAKTER** | `src/app/features/contacts/**` (list + company card) | `app/platform/contacts/**` (new) | `contacts` | `cf232_contacts` |
| **HANDBOK** | `src/app/features/handbook/**` (map, process page, procedures tab, `data/handbook-store.ts`), `features/processes/processes.routes.ts` ('' → `/handbook`, list → `all`), document-type "Vises i Håndboka" checkbox in `features/documents/config/**` (document types form only) | `app/modules/processes/**`, `app/modules/documents/` list filter + document_type schema/model; `alembic/versions/cf230_handbook.py` | `handbook` | `cf230_handbook` |
| **RAPPORTER** | `src/app/features/reports/**` (hub, `status`, routes), `src/app/features/library/**` (re-hosting + redirects), `src/app/features/registers/**` (links only) | none expected (`platform/outputs` read-only); if an output needs a field, `app/platform/outputs/**` | `reports` (existing), `outputs` (existing) | — |

Overlap notes:

- `features/documents/documents.routes.ts` belongs to HUBS; HANDBOK only touches the
  document-type config form and must not edit the routes file. Håndbok "+ Ny prosedyre" links
  to `/documents/new?type=procedure`; if the document form does not read `type`, the link
  opens the plain form (accepted; nobody edits the document form for this). Same for
  Oversikt "Ny policy" (`?type=policy`).
- Nobody but SHELL edits `app.routes.ts`, global i18n, `layout/**`, or the requirement
  components.
- Area engineers may **read** any file and reuse any component; they must not change shared
  components' public APIs. If a shared component needs a change, add a small wrapper inside
  the feature folder instead.

### 9.2 app.routes.ts contract (SHELL writes it; area engineers deliver these files)

SHELL wires these routes (all inside the authenticated shell, before the module routes) and,
so its branch builds alone, creates **stub** files with the exact paths below exporting
`export default [{ path: '', loadComponent: () => import('../module-placeholder/…') }] satisfies Routes;`
(or any trivial component). Area engineers create the same files for real.

| Route | File (default export `Routes`) | Guard | Title key | Owner of file |
|---|---|---|---|---|
| `home` | `features/home/home.routes.ts` | none | `nav.areas.home.label` | OVERSIKT |
| `speak-up` | `features/speak-up/speak-up.routes.ts` | none (page hides types the user can't create) | `nav.areas.speakUp.label` | MELD |
| `cases` | `features/cases/cases.routes.ts` | none | `nav.areas.speakUp.items.cases.label` | MELD |
| `annual-cycle` | `features/annual-cycle/annual-cycle.routes.ts` | none | `nav.areas.annual.label` | ARSHJUL |
| `company` | `features/company/company.routes.ts` (`''`, `topics`) | none | `nav.areas.company.label` | HUBS |
| `people` (hub at `''`) | `features/people-hub/people-hub.routes.ts`, then module children `features/people/people.routes.ts` guarded | hub none; children module+perm | `nav.areas.people.label` | HUBS |
| `contacts` | `features/contacts/contacts.routes.ts` (`''`, `:key`) | none | `nav.areas.contacts.label` | KONTAKTER |
| `handbook` | `features/handbook/handbook.routes.ts` (`''`, `:id`) | moduleGuard('processes') + `processes:read`, redirect fallback `/documents` | `nav.areas.handbook.label` | HANDBOK |
| `documents` (hub at `''`) | `features/documents-hub/documents-hub.routes.ts`, then module children `features/documents/documents.routes.ts` guarded | hub none; children module+perm | `nav.areas.documents.label` | HUBS |
| `reports` (hub at `''`) | `features/reports/reports-hub.routes.ts`, then module children `features/reports/reports.routes.ts` guarded | hub none; children module+perm | `nav.areas.reports.label` | RAPPORTER |

Pattern for hub + module children:

```ts
{
  path: 'people',
  title: 'nav.areas.people.label',
  children: [
    { path: '', pathMatch: 'full', loadChildren: () => import('./features/people-hub/people-hub.routes') },
    { path: '', canActivate: [moduleGuard('people'), permissionGuard('people:read')],
      loadChildren: () => import('./features/people/people.routes') },
  ],
},
```

Merge rules:

1. For the stub files in the table above, the **area engineer's version wins** over SHELL's
   stub on an add/add conflict.
2. For `app.routes.ts`, global i18n, `layout/**`, `core/shell/**`, `shared/requirement-*`:
   **SHELL's version wins**. If an area engineer created
   `requirements-visibility.service.ts` or `req-pills.ts` verbatim from 4.3 to compile early,
   drop theirs.
3. Recommended merge order (integrator): SHELL → RAPPORTER → HANDBOK (cf230) → ARSHJUL
   (cf231) → KONTAKTER (cf232) → HUBS → MELD → OVERSIKT; then the final verification round.

### 9.3 The one shared feature file

`features/reports/reports.routes.ts` is RAPPORTER's. The `calendar` child must become a
redirect to `/annual-cycle`: **RAPPORTER makes that change** (one line) as part of its route
rewrite; ARSHJUL does not edit the file.

### 9.4 Definition of done per engineer

- Lint clean, typecheck/build OK, targeted specs for new code (pure functions + one component
  spec per page), backend `cf-test.ps1 -Quick` on the new package/tests.
- nb copy matches the prototype where it exists; en at parity; no vendor/model names.
- Works at 360 / 768 / 1280px without horizontal scroll; dark mode via existing tokens.
- Requirement refs only via `<app-req-pills>` or the existing requirement components.
- Every row of section 3 assigned to the engineer is reachable as stated.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## 10. Verification checklist (final round)

1. Section 3: every row (P1–P6, W1–W28, S1–S18, M1–M73) reachable from its stated home.
2. Section 7: every redirect lands on the right page with the query string kept; no loops
   (`/reports/registers`, `/library/**` especially).
3. Top menu: 9 areas in order; label → overview; ▾ / hover → dropdown with "Se hele
   oversikten →"; keyboard (Tab, Enter, ArrowDown, Escape) and screen-reader attributes;
   dropdown works at 360px; active area highlighting for a sample URL of every prefix in 2.1.
4. Module off → its dropdown items disappear, the area stays (except when all its items are
   gone and its overview is empty — not possible for overview routes, which are unguarded).
   Missing permission → item hidden; deep link → existing guard redirect.
5. Vis krav: off by default; chips hidden on area pages and record pages; on → chips shown;
   remembered per org after reload; always shown on `/standards/**`.
6. Inbox badge equals tasks due + unread chat + unread notifications; each tab works; chat
   tab hidden when chat is off.
7. Account menu: every entry of 4.5 works; admin group only with permissions; superuser
   item only for superusers.
8. Oversikt, Meld fra (AI on and off), Saker tabs, Årshjul (strip, list, propose/accept),
   Bedriften, Folk, Dokumenter, Kontakter (list + card for a company with two roles),
   Håndbok (map, process page prev/next, procedures tab), Rapporter (groups, Klar / Mangler,
   download) against the sandbox demo org.
9. `npm run lint`, `npm test`, `npm run build`, `npm run format`; backend full test run and
   `alembic upgrade head` on a fresh DB with cf230–cf232 in one chain.
10. i18n parity check (existing spec) for global and every new scope.

---

## 11. Decision log

| # | Decision | Why |
|---|---|---|
| D1 | Record URLs never change; only landing pages are redirected. | Links in e-mails, notifications, ICS feeds, search and backend `url` fields keep working; much smaller change. |
| D2 | English URL slugs for new areas (`/home`, `/speak-up`, `/cases`, `/annual-cycle`, `/company`, `/contacts`, `/handbook`), reuse of `/people`, `/documents`, `/reports` as area hubs. | Codebase convention is English slugs; `/report/...` is taken by the public whistleblowing form; reusing the three module roots keeps their sub-URLs intact. |
| D3 | Topic modules without a prototype slot (privacy registers, IT/assets, AI, environment, continuity) go to **Bedriften › Fagområder**, one dropdown item + one section, not five new top-level items. | Keeps 9 areas and short dropdowns ("as easy to understand as this"); these are the company's management areas. |
| D4 | Hubs reuse `GET /locations/counts` for card counts; no hub-summary endpoint. | Already returns live counts for every register. |
| D5 | Kontakter is an aggregated company view; customer/supplier/contract module lists stay at their URLs as "full register" pages, linked from each tab. | Avoids rebuilding rich list features; nothing lost. |
| D6 | One inbox replaces bell + chat button; help menu folds into the account menu. | Prototype top bar has only Vis krav + avatar; the brief asks for an inbox. |
| D7 | Shell v2 (flag, pins, "Vis alt", role trimming) is retired; server pins are left unused. | The top menu with dropdowns replaces both menus; role trimming conflicts with "never hide an enabled area". |
| D8 | Vis krav is per user per org in localStorage, default off; expert pages always show requirements. | Per-viewer convenience; no backend change; matches the prototype default. |
| D9 | Håndbok vs Dokumenter split by a `document_type.handbook` flag (cf230), backfilled from type keys. | Org-controllable, explicit, cheap; "Dokumenter = everything that isn't a work procedure". |
| D10 | Process steps derive from the existing process map (lanes = roles, nodes = steps, node `document_id` = procedure); only `chain_order` is new. | The data already exists; prev/next needs an order. |
| D11 | Årshjul builds on the existing calendar due-provider aggregation + task recurrences + a duty-catalogue gap check. | All 21 modules already register due providers. |
| D12 | Rapporter groups by the output platform's `audience` (customers + employees merged into "Til kunder og ansatte"). | The output catalogue already carries audience and readiness. |
| D13 | Fixed migration chain cf230 → cf231 → cf232 with no-op placeholders. | Parallel branches must not create multiple alembic heads. |
| D14 | Registrer dialog kept for non-incident quick creates; its nav button retired. | Meld fra covers incidents; "+ Ny" buttons still need the quick form. |
| D15 | Area overview routes are not module-guarded; Håndbok is (it is entirely the processes module) with fallback to `/documents`. | Areas must never vanish while enabled; Håndbok without processes has nothing to show. |

---

## 12. Final verification round (2026-11-23)

Run on origin/main (portal `3fef3ba1`, core `2ea38f1`) plus the `fix/ia-final` fixes, against
the dev env (demo org "CoreFlow Demo AS", Kari, admin). Crawler and raw results:
`cf-test/ia-v2/final/` (`coverage.js`, `cov-*.json`). Read-only: every non-GET API call was
blocked.

| Check (section 10) | Result |
|---|---|
| 1. Inventory (§3) | 177 URLs for every static row of P/W/S/M plus 17 record pages opened through their lists: all open on their stated home. Redirects that look like moves are earlier, intended decisions: `/context/policies` → `/documents/all?type=policy` (U16, one policy concept), `/review` → `/my-work?tab=review`, `/feedback/items` → `/feedback`, `/training` → `/training/courses`, `/management-review` → `/reviews`, `/settings/modules/<m>` → its first tab. `/hse/**` lands on Oversikt in the demo org because the HSE module is off there (module guard, correct); Folk › HMS is then hidden as specified in 10.4. |
| 2. Redirects (§7) | 22 old URLs, all land on the right page with the query string kept, no loops. |
| 3. Top menu | 9 areas in order; label → overview, ▾ → every dropdown item (49 incl. one row per process in Håndbok) and "Se hele oversikten →" open the right page. Below 1180 px the row becomes the "Meny" button + panel (all areas and their items; Håndbok process rows load on open); at 360 px every area and one item per area open, no horizontal page scroll. |
| 6. Inbox | Badge 7 = 1 task + 6 notifications (no unread chat); tabs Oppgaver / Meldinger / Varsler work; "Se alt" → `/my-work`, "Åpne meldinger" → `/chat`. |
| 7. Account menu | Every link opens (passord, totrinn, enheter, varsler, læringssenter, innstillinger, moduler, oppsett); theme, language, guidance level, Spør CoreFlow, logg ut present. "Alle organisasjoner" is superuser-only (Kari is not). |
| Public routes (P1–P6) | All open without login. |
| 9. Build | portal: lint clean, 400 files / 3984 tests, production build OK (initial bundle 3.6 kB over the 900 kB warning budget, not an error). core: ruff, format, mypy (989 files), alembic upgrade head (cf230 → cf232 chain), pytest 2482 passed. |
| 10. i18n | en/nb 23 828 keys each, parity 0 problems; 0 keys used in code and missing (the earlier "207/223 missing" were non-keys, see below). |

Fixed in this round: Dokumenter › Planer after Policyer kept showing policies (the list did
not follow a query-only change); suppliers list DPA badge was not projected into the row's
badge slot (NG8011); stale backend test `test_people_pickers_list_real_members_only`
(written before operator access, cf196). The i18n audit tool
(`cf-test/tools/i18n-audit.mjs`) now counts only literals used as translation keys (piped to
`transloco`, passed to `translate()`, or given to an i18n `*Key` input); before, it flagged
AI capability ids (`assist="risk.suggest_controls"`), register ids
(`locationKey="suppliers.register"`), flow-action ids, realtime event names, template
expressions and doc-comment examples.

Not done (noted for later): section 10.5 (Vis krav per page) and 10.8 (writing flows: Meld
fra with AI on/off, Årshjul propose/accept, report downloads) need mutations and were not
exercised by the read-only crawl; their unit tests pass.
