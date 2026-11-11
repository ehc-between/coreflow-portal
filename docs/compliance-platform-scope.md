# CoreFlow: complete compliance platform scope

Status: approved for the overnight build on 2026-11-11. Tracking: GitHub issues in `ehc-between/coreflow-core` and `ehc-between/coreflow-portal`, Project #5.

## 1. Vision

CoreFlow should be the best compliance and management system for any organisation, from a five-person consultancy to a multi-site manufacturer. It covers:

| Framework | What it covers |
|---|---|
| ISO 9001:2015/2026 | Quality management |
| ISO/IEC 27001:2022 (+ Annex A) | Information security management |
| ISO 14001:2015 | Environmental management |
| ISO/IEC 42001:2023 | AI management system |
| ISO 45001:2018 | Occupational health and safety |
| GDPR | Privacy and data protection |
| EU AI Act (Reg. 2024/1689) | AI systems placed on the market or used in the EU |
| NIS2 (optional profile) | Cybersecurity risk management for essential and important entities |

Design principles:

1. **Modular and configurable.** An organisation turns on only the frameworks and modules it needs. Terminology, record types, fields, workflows, risk matrices and notification rules are all configurable per organisation.
2. **One system of record.** Every record (document, risk, deviation, audit finding, training, contract …) can be linked to any other record and to the standard clauses it satisfies. One piece of evidence can satisfy clauses in several standards, using the shared ISO Harmonised Structure (clauses 4–10).
3. **The assistant is part of every function.** "Ask CoreFlow" is available on every page. It knows what the user is looking at, can find anything the user may read, explains concepts, drafts content, and acts through tools that respect permissions and are audit-logged. It never decides on its own: a human confirms every change.
4. **Teaching by design.** A per-user *Learning mode* (beginner ↔ experienced, with an org default) adds explanations, "why this matters" notes with clause references, guided steps, examples and micro-lessons. Experienced users get a compact UI.
5. **Audit-grade.** Everything is org-scoped, RBAC-gated, soft-deleted, audit-logged, revision-controlled where the standards require controlled information, and exportable for auditors.
6. **Neutral language.** No vendor or model names in the UI.

## 2. What exists today (baseline)

- Auth, organisations, members, departments, invitations, RBAC roles and permissions, superuser admin.
- Audit log, soft delete, attachments (with frozen evidence), in-app and email notifications with preferences and reminder scans.
- **Documents**: visibility and access grants, proposals, comments, full-text search, document-control workflow (draft → review → approval, segregation of duties, periodic review), soft delete, Word export.
- **Deviations**: org-defined deviation types with a JSON field schema (an AI type designer exists), codes, severity, a status workflow with closure rules, actions (corrective/preventive, verification, effectiveness), access control and event kinds.
- **Standards**: an ISO 9001:2026 and ISO/IEC 27001:2022 catalogue (clause structure and own summaries, plus licensed text uploaded by the customer), applicability and SoA justification, evidence links, AI mapping of documents to requirements, AI help per requirement.
- **AI**: Ask panel (SSE streaming, tools for documents and deviations), edit runtime, AI run audit table.
- **Portal**: dashboard, my-work, review, documents, deviations, standards, settings, account, a command palette, placeholders for inspections/risk/audits/people/projects/procedures/training/reports.

## 3. Cross-cutting definition of done (every module)

A module is done only when **all** of these hold:

**Backend (`coreflow-core`)**
- Org-scoped models, one Alembic migration (revision id given per work item), soft delete, `TimestampMixin`.
- Permissions seeded in `seed-rbac` (`<module>:read`, `<module>:write`, `<module>:manage`, plus specific ones), granted to sensible default roles.
- Every mutation calls `audit.record(...)` in the same transaction.
- Controlled records keep **revision history** (who, when, what changed, why).
- Emits domain events through the platform events API (F3), which drives notifications and the timeline.
- Uses platform **Tasks** (F2) for anything assignable, and platform **entity links** (F8) for relationships.
- Registers **AI tools** (F5): at least search/list, get, create-draft and summarise for its records, all permission-checked and confirm-before-write.
- Its records appear in **global search** (F5).
- Declares the **standard clauses** it supports (F7), so evidence can be linked and auto-suggested.
- Gated by **module enablement** (F1): the API returns 404/403 while the module is disabled for the org.
- Tests cover service rules, permissions, org isolation and the API. ruff, ruff format, mypy and pytest are clean.

**Portal (`coreflow-portal`)**
- Lazy feature route; the placeholder nav entry is replaced with the real one, which is hidden while the module is disabled or the permission is missing.
- List (filter, sort, search, saved views where useful), detail with timeline, create/edit, empty states that teach.
- **Learning-mode content** (F6): a page intro, field help, a "why this matters" note with clause references, and at least one micro-lesson per module, in **en and nb at full parity**.
- Registers **page context** for the assistant (F5) and offers AI buttons where they help (draft, suggest, summarise, explain).
- Responsive and keyboard accessible, with zoneless-safe signals. lint, test and build are clean.

## 4. Platform foundation (wave 0)

The items marked *blocking* must be merged before the module wave starts. Technical contracts are specified in `docs/platform-contracts.md`, which the architect step writes first.

### F1: Organisation profile, module registry and setup wizard *(blocking)*
- Org profile: industry, size, sites/locations, countries, the frameworks in scope, certification targets and dates, and the organisation's role under the AI Act (provider/deployer/none).
- A **module registry** (backend source of truth): each module has a key, its dependencies, the frameworks it supports and its default roles. Per-org enable/disable, plus a `module_enabled(org, key)` dependency for routes.
- Org-level **terminology overrides** (for example "nonconformity" instead of "deviation"), applied through i18n params.
- A **setup wizard** for new orgs: profile → frameworks → recommended modules (AI explains why) → roles → first tasks. It can be re-run from settings.
- Portal: the settings "Modules" page, a nav driven by enabled modules, and the wizard.

### F2: Universal tasks and assignments *(blocking)*
- A `Task` linked to any entity (`entity_type`, `entity_id`). The assignee is a user, a role or a department. A task has a due date, priority, status, checklist items, comments and attachments.
- **Recurring tasks** (RRULE-style: daily … yearly), used for periodic controls, reviews and inspections.
- My Work combines tasks, deviation actions, review requests, training due and acknowledgements. List, board and calendar views. Overdue escalation.
- The service API other modules call: `tasks.create_for(entity, …)`, `tasks.list_for(entity)`.

### F3: Events, notifications and escalation *(blocking)*
- A domain event table (outbox): `emit(org, kind, entity_type, entity_id, actor, payload, recipients=…)`.
- Org-configurable **notification rules**: event kind → recipients (owner, assignee, role, department, watchers) → channels (in-app, email, daily digest).
- **Watchers/follow** on any entity. User preferences per category. Quiet hours and digest.
- Generic **due-date reminders** and **escalation** (to the manager or role after N days overdue) for any entity with a due date.
- An **activity timeline** API per entity, built from events and the audit log.

### F4: Configurable record types and workflow designer *(non-blocking, unlocks M03)*
- Generalise the deviation-type schema into reusable **record type definitions**: a field schema (text, number, date, select, multi-select, user, department, checkbox, file, rich text, calculated) and layout sections.
- A **workflow definition**: states, transitions, per-transition required fields, allowed roles, approvals (single or multi, with segregation of duties), automatic tasks and notifications per transition, and SLA timers.
- A versioned definition: records keep the version they were created with. Built-in default workflows reproduce today's deviation behaviour.
- **AI workflow designer**: you describe the process in plain language and it proposes the states, transitions and fields, then the user edits them in a visual editor.
- Portal: a type/workflow designer (field builder plus a state diagram), and a dynamic form renderer.

### F5: The assistant everywhere, plus global search *(blocking)*
- **Global search** across all entity types the user may read (FTS-based, permission-filtered), in the command palette and through the assistant.
- A **page-context protocol**: each portal page registers `{module, entityType, entityId, view, selection}`. The Ask panel sends it, so the assistant knows "this risk" or "this audit".
- A **pluggable AI tool registry**: modules register tools with permission requirements. Write tools return a proposal the user confirms.
- Navigation tool ("open the supplier evaluation for X"), explain tool ("what does clause 6.1.2 require?") and cross-module Q&A with links to the records it cites.
- Ask is reachable from every page: a floating button and a keyboard shortcut. Inline "Ask about this" on records and fields.

### F6: Learning mode and guidance framework *(blocking)*
- User preference `guidance_level`: `beginner | standard | expert`, with an org default. Toggled from the account menu.
- Components: `<app-guide-intro>` (page intro), `<app-field-help>` (inline help), `<app-why-it-matters>` (clause references), `<app-lesson>` (micro-lesson with an optional quiz), guided **tours** (step highlights), and **teaching empty states**.
- A **glossary** of compliance terms (en/nb) with hover definitions.
- The **AI tutor**: "Teach me" opens the assistant in tutor mode for the current page or topic, adapted to the user's level.
- A **learning progress** record per user (lessons seen and quizzes passed). The training module (M11) reuses it.
- Guidance content lives in `src/assets/guidance/<lang>/<module>.json` (or i18n keys), always at en/nb parity.

### F7: Standards and regulations catalogue expansion *(non-blocking)*
- Add **ISO 14001:2015, ISO/IEC 42001:2023 (incl. Annex A controls), ISO 45001:2018**: clause structure, titles and *own-written* summaries and guidance. ISO text is copyrighted, so the verbatim text keeps using the existing customer-licensed upload.
- Add **GDPR** (articles and recitals, structured by obligation) and the **EU AI Act** (articles, annexes, obligations by role and risk class). EU legal texts may be reproduced. Optional **NIS2** Article 21 measures.
- A **cross-framework mapping**: Harmonised Structure clauses 4–10 shared across ISO standards, plus mappings 27001 A.5.34 ↔ GDPR Art. 32 and 42001 ↔ AI Act.
- A **readiness score** per framework, computed from applicability, linked evidence and evidence freshness.

### F8: Shared record kit: entity links, timeline, comments, revision history *(blocking)*
- `entity_links` (any ↔ any, typed: relates-to, caused-by, mitigates, evidence-for, supersedes).
- Generic comments and @mentions on any entity, and generic attachments on any entity (extend the existing attachments).
- A generic **revision history** service (snapshot plus diff per change, with a change reason), and a UI component to compare revisions.
- Portal kit: `<app-related-items>`, `<app-timeline>`, `<app-revision-history>`, `<app-comments>`, a standard list page and a standard detail layout.

## 5. Modules (wave 1, in priority order)

Each module lists its main capabilities, the frameworks it serves, and its AI and learning-mode hooks. Every module must also meet the definition of done in §3.

### M01: Context of the organisation and leadership
ISO HS 4.1–4.4, 5.1–5.3. SWOT/PESTLE analysis, an **interested parties** register (needs and expectations, and whether each is addressed), the **scope statement** per management system, **policies** (quality/security/environment/AI/privacy, linked to documents), and **roles, responsibilities and authorities** (RACI per process/role). AI drafts the SWOT and interested parties from the org profile. Learning mode explains "context" as the foundation of every ISO standard.

### M02: Process management and process maps
ISO 9001 4.4, HS 8.1. A process register (owner, purpose, inputs/outputs, resources, KPIs, risks, linked documents). A **visual process map editor** with swimlanes, steps, decisions and links to procedures. Each process has a **description document** with **revision control and approval** (reuse document control), a **turtle diagram** and a process interaction map. AI generates a process map from a text description or an existing procedure. Learning mode explains the process approach and PDCA.

### M03: Deviations, nonconformities, incidents and improvements (upgrade)
ISO HS 10.2, 27001 A.5.24–5.28, 14001, 45001 incidents, GDPR breaches (linked to M15), AI incidents (M16). It moves deviation types onto **F4 record types and workflows**: users design their own schemas and workflows for creating and handling deviations. Built-in templates: nonconformity, customer complaint, security incident, environmental incident, HSE incident/near-miss, AI incident, improvement suggestion. **Root-cause tools** (5 Whys, fishbone), **CAPA** with effectiveness review, and **AI help** for registration (from free text to structured fields), root cause, similar past cases and suggested actions (core #14). An **anonymous/whistleblowing intake** (public link per org, optional).

### M04: Risk and opportunity management, and the Statement of Applicability
ISO HS 6.1, 27001 6.1.2/6.1.3/8.2/8.3 + Annex A SoA, 42001 6.1, 45001 hazards, 14001 risks. Configurable **risk matrices** (likelihood × consequence scales and colours), registers per category (enterprise, information security, privacy, AI, HSE, environmental, project), an asset-/process-based assessment, inherent → treatment → residual risk, treatment plans as tasks, owners, review cycle, risk acceptance sign-off, **opportunities**, a heat map, and the **SoA** generated from Annex A with justifications (core #9). AI suggests threats/vulnerabilities/controls and drafts treatment. Learning mode walks a beginner through a first risk assessment.

### M05: Inspections and checklists
ISO 9001 8.5/9.1, 45001 9.1, 14001 9.1. A **checklist template builder** (questions: yes/no/NA, score, number, text, photo, signature), **scheduled/recurring inspections** (F2), mobile-friendly execution with photo evidence, scoring, and **findings that create deviations automatically**. AI generates a checklist from a standard, a process or a description. Includes a template library.

### M06: Audit management (internal and external)
ISO HS 9.2, ISO 19011 guidance. An **audit programme** (risk-based plan per year), audit plans (scope, criteria, auditors, schedule), **auditor competence and independence** checks, checklists generated from standard clauses, findings (major/minor NC, observation, OFI) linked to deviations/CAPA, audit reports with approval, **external audits** (certification body, customer, supplier, regulator) and certification status/cycles (core #11). AI drafts audit questions per clause and evidence requests, and summarises the report.

### M07: Management review
ISO HS 9.3. Review meetings with **inputs compiled automatically** per standard (audit results, objectives/KPIs, deviations, risks, supplier performance, customer feedback, resource needs, changes in context), attendees, minutes, decisions and outputs as tasks, and a signed report (core #12). AI drafts the input summary and minutes. Includes a generic **meetings and minutes** capability that other modules can reuse.

### M08: Objectives, KPIs and measurement
ISO HS 6.2, 9.1. Objectives per management system with targets, owners, plans and deadlines. **KPIs** with manual/periodic data entry, thresholds, trends and charts. Links to processes and objectives (core #16). AI suggests SMART objectives and explains deviations from targets.

### M09: People, roles and competence (HR core)
ISO HS 7.2/7.3, 27001 A.6, 45001. An **employee register** (linked to users or standalone), positions/roles with **competence requirements**, a **competence matrix** and gap analysis, **onboarding/offboarding checklists** (including access revocation, equipment return and the confidentiality agreement), awareness records, disciplinary process records (restricted), and terms-of-employment security clauses. AI suggests competence requirements per role.

### M10: Recruitment and candidate screening
ISO 27001 A.6.1 (screening), A.6.2, GDPR. **Job requisitions** with approval, job postings, a **candidate pipeline** (kanban), structured **screening criteria**, interview scheduling and **scorecards**, background/reference check records proportional to role risk, offer → hand-off to onboarding (M09). GDPR: candidate privacy notice, consent, **automatic retention and deletion**, and access restricted to the hiring team.
- **AI policy (AI Act Annex III(4))**: AI that filters, ranks or evaluates candidates is *high-risk*. CoreFlow's AI therefore only *assists*: it drafts job ads, interview questions and scorecard criteria, and summarises an application against the human-defined criteria **when the human asks for it**. It never scores, ranks, filters or rejects, and every AI output is logged and labelled. Automated candidate ranking is out of scope until a high-risk conformity decision is made (see §8).

### M11: Training and courses (LMS)
ISO HS 7.2/7.3, AI Act Art. 4 (AI literacy), 27001 A.6.3. A **course builder** (lessons, rich text, video links, documents, quizzes with pass marks), **AI-generated courses** from documents/procedures/standards, training **assignments by role/department/new hire**, completion records, certificates, **expiry and re-training**, **read-and-understood** for documents, training needs analysis from the competence matrix (M09), and an effectiveness evaluation (core #15). It reuses the F6 lesson player.

### M12: Contract management
ISO 9001 8.2, 27001 A.5.20, GDPR Art. 28. A **contract register** (customer, supplier, NDA, DPA, employment templates, SLA), parties, values, **key dates with renewal/notice reminders**, **obligations tracking** (as tasks), an approval workflow, **versions and revision history**, signed-copy attachments, and links to suppliers, processors and risks. AI extracts parties, dates, obligations, renewal terms and risks from an uploaded contract, and flags missing DPA clauses.

### M13: Suppliers and third parties
ISO 9001 8.4, 27001 A.5.19–5.23, GDPR Art. 28, 42001 (AI suppliers). A **supplier register** with criticality, **evaluation and approval** (questionnaires with scoring), periodic re-evaluation, a performance log (deliveries, NCs), security/privacy assessments, and links to contracts and processors. AI drafts questionnaires and summarises responses.

### M14: Projects
ISO 9001 6.3, 8.3 (design and development), 27001 A.5.8. Projects with phases/milestones, tasks (F2) in board/list/Gantt views, team members, project documents, project risks (M04), **change requests** with approval (shared with M19), design reviews/verification/validation records, and close-out with lessons learned. AI produces project status summaries and risk prompts.

### M15: GDPR and privacy
GDPR Art. 5–49. A **ROPA** (Art. 30) for controller and processor roles, **DPIA** (Art. 35) with a screening checklist, **data subject requests** with legal deadlines (1 month, extendable) and a task workflow, a **breach register** with a **72-hour** notification clock and authority/subject notification decisions, a **processor register** and DPAs (links to M12/M13), **international transfers** (TIA, SCCs), retention schedules, consent records, and legal basis assessments including LIA (core #10). AI drafts ROPA entries from a description, screens DPIA need and drafts breach assessments. Learning mode covers GDPR principles in plain language.

### M16: AI governance (ISO/IEC 42001 + EU AI Act)
- An **AI system inventory**: purpose, provider/deployer role, models, data, owners and status.
- An **AI Act classification wizard**: prohibited practices (Art. 5), high-risk under Annex I/III, transparency (Art. 50), minimal risk, and GPAI. It outputs obligations as tasks.
- **AI impact assessments** (42001 6.1.4) and the deployer **FRIA** (Art. 27).
- Data and model documentation, a human-oversight design, logging, accuracy/robustness monitoring, an **AI incident** log (Art. 73), and the post-market monitoring plan.
- **AI literacy** tracking (Art. 4, links to M11) and an AI policy.
- Technical documentation for high-risk systems (Annex IV) as a structured document.
- CoreFlow's own AI features are registered in the demo inventory as an example.
- AI explains the obligations for the chosen classification.

### M17: Environmental management (ISO 14001)
ISO 14001 6.1.2, 6.1.4, 8.2, 9.1. An **aspects and impacts register** with significance evaluation (a configurable scoring method) and a lifecycle perspective, operational controls, **emergency preparedness and response** (plans, drills as recurring tasks), **environmental monitoring data** (energy, water, waste, emissions with units and trends, scope 1/2/3 basics), and environmental objectives (M08). AI suggests aspects for an activity.

### M18: Compliance obligations (legal and other requirements register)
ISO HS 4.2, 14001 6.1.3, 45001 6.1.3, 27001 5.31, GDPR, AI Act. A register of laws, regulations, permits, contractual and voluntary obligations, how each applies, the owner, a **periodic compliance evaluation** (recurring task) with its evidence, and change monitoring notes. AI summarises an obligation and proposes the applicable requirements.

### M19: Assets, access and change management
ISO 27001 A.5.9–5.14, A.5.15–5.18, A.8.32, ISO 9001 7.1.5, 6.3.
- An **asset inventory** (information, software, hardware, services, people-held assets) with owner, classification, location and lifecycle (core #13).
- **Measuring equipment calibration** schedules.
- **Access reviews** (recurring, per system) with attestation.
- **Change management**: request → impact/risk → approval → implement → review, using F4 workflows.
- AI suggests a classification and the relevant controls.

### M20: Business continuity and emergency
ISO 27001 A.5.29–5.30, 22301-lite, 45001 8.2. A **business impact analysis** (RTO/RPO), continuity plans with revision control, exercises/tests as recurring tasks with lessons learned, crisis contact lists, and ICT readiness. AI drafts plans from the BIA.

### M21: Health and safety (ISO 45001)
Hazard identification and risk assessment (reuses M04 with HSE matrices), safe job analysis/SJA, worker consultation and participation records, PPE register, incident/near-miss (M03 template), and safety rounds (M05 template). AI suggests hazards and controls for a work task.

### M22: Customer feedback and satisfaction
ISO 9001 9.1.2, 8.2.1. Customer feedback capture, satisfaction surveys (a simple survey builder with a public link), and complaint linkage to M03. AI summarises themes and trends.

### M23: Reports, dashboards, calendar and audit packs
ISO HS 9.1, 9.3, 7.5.
- A **compliance dashboard** per framework: readiness score, overdue items, open findings, risk heat map, training compliance.
- An **organisation calendar** of every due date (tasks, reviews, audits, contract renewals, training expiry).
- Configurable **dashboard widgets** per role.
- **Exports**: register exports (CSV/XLSX/PDF) and a one-click **audit pack** per standard (SoA, policies, registers, evidence index) (core #17).
- AI generates a narrative "state of compliance" report.

### M24: Document management enhancements
ISO HS 7.5.
- **Document types and templates**, automatic numbering, and a **master document list**.
- **Distribution and read-and-acknowledge campaigns** with tracking.
- **Revision compare (diff)** and a revision history view.
- **External documents** register and **records retention** rules.
- **AI drafting** of documents from a standard requirement or a process.

## 6. Delivery plan (overnight execution)

1. **Plan.** An architect agent writes `docs/platform-contracts.md` (exact backend APIs, tables, migration ids and portal component/service contracts for F1–F8, plus the module integration recipe). A tracking agent creates the GitHub issues (reusing core #9–#18 and portal #6/#7 where they match) and adds them to Project #5.
2. **Wave 0 (foundation).** F1, F2, F3, F5, F6 and F8 run in parallel (backend then portal per item). QA runs, then the implementer fixes, then the item goes to the merge queue. F4 and F7 start at the same time but do not block.
3. **Wave 1 (modules).** These start once the blocking foundation is on main, and run in parallel in the priority order of §5. M03 also waits for F4.
4. **Merge queue.** A single integrator merges ready branches in batches. It re-chains Alembic to one head, resolves additive conflicts (router, models, seeds, nav, i18n), runs the full backend suite in Docker plus portal lint/test/build, merges to `main` and pushes. It then refreshes the dev env (`update-dev.ps1`). A branch that fails integration is dropped from the batch and reported.
5. **Final.** A regression QA pass on main, a **demo data seed** (a `seed-demo` CLI that builds a realistic demo org with records in every module), a dev env refresh, and a morning report.

Migration ids: F1 `cf20`, F2 `cf21`, F3 `cf22`, F4 `cf23`, F5 `cf24`, F6 `cf25`, F7 `cf26`, F8 `cf27`, M01–M24 `cf31`–`cf54` (M01 `cf31` … M24 `cf54`). The integrator sets `down_revision` in merge order.

## 7. Out of scope for this build
Native mobile apps (the portal is responsive instead), SSO/SAML, e-signature provider integration (simple sign-off only), HRIS/payroll integrations, a public job board integration, and automated candidate ranking (§8).

## 8. Open decisions for the product owner
- **Recruitment AI**: keep AI assistive only (the default), or pursue high-risk conformity for automated screening.
- **ISO verbatim text**: keep the customer-licensed upload model (the default).
- Whether NIS2 and ISO 45001 are visible by default or opt-in per org (the default is opt-in via the setup wizard).
