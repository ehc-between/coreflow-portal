import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import {
  checklistProgress,
  checklistResultBadge,
  findingStatusBadge,
  textOrNull,
} from '../data/audit-display';
import {
  CHECKLIST_RESULTS,
  Checklist,
  ChecklistItem,
  ChecklistResult,
  DraftQuestion,
  EntityRef,
  MAX_EVIDENCE_REFS,
  PlanDetail,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditField } from '../shared/audit-field';
import { AuditClauseRefs } from '../shared/clause-refs';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditRecordPicker } from '../shared/record-picker';

/** Record types that can be linked as evidence for a checklist answer. */
export const EVIDENCE_TYPES: readonly string[] = [
  'document',
  'process',
  'risk',
  'deviation',
  'training_record',
  'supplier_evaluation',
  'inspection',
  'task',
];

/** Normalise the `audits.draft_questions` assist result (drops malformed rows). */
export function parseDraftQuestions(data: unknown): DraftQuestion[] {
  const list = (data as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter(
      (q): q is { question: string; clause_ref?: unknown; evidence_request?: unknown } =>
        !!q &&
        typeof (q as { question?: unknown }).question === 'string' &&
        !!(q as { question: string }).question.trim(),
    )
    .map((q) => ({
      question: q.question.trim(),
      clause_ref: typeof q.clause_ref === 'string' && q.clause_ref ? q.clause_ref : null,
      evidence_request:
        typeof q.evidence_request === 'string' && q.evidence_request ? q.evidence_request : null,
    }));
}

/** The evidence refs of an item after adding or removing one record (no duplicates). */
export function nextEvidenceRefs(
  item: Pick<ChecklistItem, 'evidence_refs' | 'evidence'>,
  change: { readonly add?: EntityRef; readonly remove?: string },
): { entity_type: string; entity_id: string }[] {
  const current = (item.evidence_refs ?? item.evidence ?? []).map((r) => ({
    entity_type: r.entity_type,
    entity_id: r.entity_id,
  }));
  const kept = current.filter((r) => r.entity_id !== change.remove);
  if (change.add && !kept.some((r) => r.entity_id === change.add!.entity_id)) {
    kept.push({ entity_type: change.add.entity_type, entity_id: change.add.entity_id });
  }
  return kept.slice(0, MAX_EVIDENCE_REFS);
}

/**
 * The audit checklist: questions per clause with the evidence to ask for, generated
 * from the standards catalogue or drafted by the assistant (reviewed before saving),
 * and answered during fieldwork (conforming, nonconforming, observation, n/a + notes
 * + linked evidence records). Each question shows who answered it and when, and the
 * findings raised from it (so the same finding is not raised twice).
 */
@Component({
  selector: 'app-audit-plan-checklist',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    AiAssistButton,
    ClausePicker,
    EntityChip,
    Badge,
    Button,
    ConfirmDialog,
    Icon,
    ProgressBar,
    StatusBadge,
    AuditClauseRefs,
    AuditField,
    AuditLoadState,
    AuditRecordPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-audit-load-state [state]="list.state()" (retry)="load()" />
    @if (list.value(); as c) {
      @if (c.items.length) {
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <div class="min-w-[180px] flex-1">
            <app-progress-bar
              [value]="progress()"
              [label]="
                'audits.checklist.progress' | transloco: { answered: c.answered, total: c.total }
              "
            />
          </div>
          <span class="text-meta text-fg-muted">
            {{ 'audits.checklist.progress' | transloco: { answered: c.answered, total: c.total } }}
          </span>
        </div>
      }

      @if (editable() && c.items.length) {
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <app-button
            variant="secondary"
            size="sm"
            [loading]="saving.busy()"
            [disabled]="!hasClauses()"
            [attr.title]="hasClauses() ? null : ('audits.checklist.noClauses' | transloco)"
            (click)="generate()"
          >
            {{ 'audits.checklist.generate' | transloco }}
          </app-button>
          <app-ai-assist-button
            assist="audits.draft_questions"
            labelKey="audits.ai.draftQuestions"
            entityType="audit_plan"
            [entityId]="plan().id"
            [input]="{ plan_id: plan().id, per_clause: 3 }"
            (result)="onDraft($event)"
          />
          <app-button variant="ghost" size="sm" (click)="adding.set(!adding())">
            <app-icon name="plus" [size]="13" />
            {{ 'audits.checklist.addQuestion' | transloco }}
          </app-button>
        </div>
      }

      @if (!c.items.length && !drafts().length && !adding()) {
        <div
          class="flex flex-col items-center gap-2 rounded-tile border border-dashed border-border px-4 py-6 text-center"
          data-testid="checklist-empty"
        >
          <p class="font-display text-card font-bold text-fg">
            {{ 'audits.checklist.emptyTitle' | transloco }}
          </p>
          <p class="max-w-md text-body text-fg-muted">
            {{
              (hasClauses() ? 'audits.checklist.emptyBody' : 'audits.checklist.emptyNoClauses')
                | transloco
            }}
          </p>
          @if (editable()) {
            <div class="mt-2 flex flex-wrap items-center justify-center gap-2">
              @if (hasClauses()) {
                <app-button size="sm" [loading]="saving.busy()" (click)="generate()">
                  {{ 'audits.checklist.generate' | transloco }}
                </app-button>
              } @else {
                <a
                  [routerLink]="['/audits/plans', plan().id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile bg-accent px-3 text-ui font-semibold text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {{ 'audits.checklist.chooseClauses' | transloco }}
                </a>
              }
            </div>
            <p class="mt-1 text-meta text-fg-muted">
              {{ 'audits.checklist.orElse' | transloco }}
              <button
                type="button"
                class="font-semibold text-accent hover:underline"
                (click)="adding.set(true)"
              >
                {{ 'audits.checklist.addOwn' | transloco }}
              </button>
            </p>
            @if (hasClauses()) {
              <app-ai-assist-button
                assist="audits.draft_questions"
                labelKey="audits.ai.draftQuestions"
                variant="ghost"
                entityType="audit_plan"
                [entityId]="plan().id"
                [input]="{ plan_id: plan().id, per_clause: 3 }"
                (result)="onDraft($event)"
              />
            }
          } @else if (!answerable()) {
            <p class="text-meta text-fg-subtle">{{ 'audits.checklist.lockedHint' | transloco }}</p>
          }
        </div>
      }

      @if (drafts().length) {
        <div
          class="mb-4 rounded-tile border border-accent-border bg-accent-soft/50 p-3"
          data-testid="draft-questions"
        >
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-ui font-semibold text-fg">
              {{ 'audits.checklist.draftsTitle' | transloco: { count: drafts().length } }}
            </h3>
            <div class="flex gap-2">
              <app-button variant="ghost" size="sm" (click)="drafts.set([])">
                {{ 'audits.checklist.discardDrafts' | transloco }}
              </app-button>
              <app-button
                size="sm"
                [loading]="saving.busy()"
                [disabled]="!selectedDrafts().length"
                (click)="acceptDrafts()"
              >
                {{
                  'audits.checklist.acceptDrafts' | transloco: { count: selectedDrafts().length }
                }}
              </app-button>
            </div>
          </div>
          <p class="mb-2 text-meta text-fg-muted">
            {{ 'audits.checklist.draftsHint' | transloco }}
          </p>
          <ul class="flex flex-col gap-2">
            @for (d of drafts(); track $index) {
              <li>
                <label class="flex items-start gap-2 text-ui text-fg">
                  <input
                    type="checkbox"
                    class="mt-0.5 h-4 w-4"
                    [checked]="!rejected().has($index)"
                    (change)="toggleDraft($index)"
                  />
                  <span class="flex flex-col gap-1">
                    <span>{{ d.question }}</span>
                    @if (d.clause_ref) {
                      <app-audit-clause-refs [refs]="[d.clause_ref]" />
                    }
                    @if (d.evidence_request) {
                      <span class="text-meta text-fg-muted">
                        {{
                          'audits.checklist.askFor' | transloco: { evidence: d.evidence_request }
                        }}
                      </span>
                    }
                  </span>
                </label>
              </li>
            }
          </ul>
        </div>
      }

      @if (adding()) {
        <form
          class="mb-4 grid grid-cols-1 gap-3 rounded-tile border border-border bg-surface-2 p-3 sm:grid-cols-2"
          (submit)="$event.preventDefault(); addQuestion()"
        >
          <app-audit-field
            class="sm:col-span-2"
            inputId="cl-question"
            labelKey="audits.checklist.question"
            [required]="true"
          >
            <input
              id="cl-question"
              required
              [value]="newQuestion()"
              (input)="newQuestion.set($any($event.target).value)"
            />
          </app-audit-field>
          <app-audit-field inputId="cl-clause" labelKey="audits.fields.clauseRef" [plain]="true">
            <app-clause-picker
              inputId="cl-clause"
              [multiple]="false"
              [frameworks]="plan().frameworks.length ? plan().frameworks : null"
              [ngModel]="newClause()"
              (ngModelChange)="newClause.set($event)"
              [ngModelOptions]="{ standalone: true }"
            />
          </app-audit-field>
          <app-audit-field inputId="cl-evidence" labelKey="audits.checklist.evidence">
            <input
              id="cl-evidence"
              [value]="newEvidence()"
              (input)="newEvidence.set($any($event.target).value)"
            />
          </app-audit-field>
          <div class="flex justify-end gap-2 sm:col-span-2">
            <app-button variant="secondary" size="sm" (click)="adding.set(false)">
              {{ 'audits.common.cancel' | transloco }}
            </app-button>
            <app-button type="submit" size="sm" [disabled]="!newQuestion().trim() || saving.busy()">
              {{ 'audits.checklist.addQuestion' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @if (c.items.length) {
        <ol class="flex flex-col gap-2" data-testid="checklist-items">
          @for (item of c.items; track item.id; let i = $index) {
            <li class="rounded-tile border border-border p-3" [attr.data-result]="item.result">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0 flex-1 basis-[260px]">
                  <p class="text-body text-fg">
                    <span class="mr-1 text-fg-subtle">{{ i + 1 }}.</span>{{ item.question }}
                  </p>
                  @if (item.evidence_request) {
                    <p class="mt-0.5 text-meta text-fg-muted">
                      {{
                        'audits.checklist.askFor' | transloco: { evidence: item.evidence_request }
                      }}
                    </p>
                  }
                  <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                    @if (item.clause_ref) {
                      <app-audit-clause-refs [refs]="[item.clause_ref]" />
                    }
                    @if (item.source !== 'manual') {
                      <app-badge tone="neutral">{{
                        'audits.checklistSource.' + item.source | transloco
                      }}</app-badge>
                    }
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  @if (answerable()) {
                    <label class="sr-only" [attr.for]="'cl-result-' + item.id">
                      {{ 'audits.checklist.resultFor' | transloco: { n: i + 1 } }}
                    </label>
                    <select
                      [id]="'cl-result-' + item.id"
                      class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                      (change)="setResult(item, $any($event.target).value)"
                    >
                      @for (r of results; track r) {
                        <option [value]="r" [selected]="item.result === r">
                          {{ 'audits.checklistResult.' + r | transloco }}
                        </option>
                      }
                    </select>
                  } @else {
                    @let rb = resultBadge(item.result);
                    <app-status-badge
                      [meaning]="rb.meaning"
                      [value]="rb.value"
                      [labelKey]="rb.labelKey"
                    />
                  }
                  @if (editable()) {
                    <app-button
                      variant="ghost"
                      size="sm"
                      [attr.aria-label]="
                        'audits.checklist.removeNumbered' | transloco: { n: i + 1 }
                      "
                      (click)="deleting.set(item)"
                    >
                      {{ 'audits.common.remove' | transloco }}
                    </app-button>
                  }
                </div>
              </div>

              @if (answerable()) {
                <div class="mt-2">
                  <label class="sr-only" [attr.for]="'cl-notes-' + item.id">{{
                    'audits.checklist.notesFor' | transloco: { n: i + 1 }
                  }}</label>
                  <textarea
                    [id]="'cl-notes-' + item.id"
                    rows="2"
                    class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg"
                    [placeholder]="'audits.checklist.notesPlaceholder' | transloco"
                    [value]="item.notes ?? ''"
                    (change)="setNotes(item, $any($event.target).value)"
                  ></textarea>
                </div>
              } @else if (item.notes) {
                <p class="mt-2 text-meta whitespace-pre-line text-fg-muted">{{ item.notes }}</p>
              }

              @if (item.evidence?.length || answerable()) {
                <div class="mt-2 flex flex-col gap-1.5">
                  <p class="text-meta font-semibold text-fg-muted">
                    {{ 'audits.checklist.evidenceRecords' | transloco }}
                  </p>
                  <div class="flex flex-wrap items-center gap-1.5">
                    @for (e of item.evidence ?? []; track e.entity_id) {
                      <span class="inline-flex max-w-full items-center gap-0.5">
                        <app-entity-chip [ref]="e" />
                        @if (answerable()) {
                          <button
                            type="button"
                            class="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fail-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                            [attr.aria-label]="
                              'audits.common.removeItem' | transloco: { name: e.title }
                            "
                            (click)="removeEvidence(item, e.entity_id)"
                          >
                            <app-icon name="x" [size]="12" />
                          </button>
                        }
                      </span>
                    } @empty {
                      @if (!answerable()) {
                        <span class="text-meta text-fg-subtle">{{
                          'common.empty.none' | transloco
                        }}</span>
                      }
                    }
                    @if (answerable() && linkingFor() !== item.id) {
                      <button
                        type="button"
                        class="inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
                        (click)="linkingFor.set(item.id)"
                      >
                        <app-icon name="link" [size]="12" />
                        {{ 'audits.checklist.linkEvidence' | transloco }}
                      </button>
                    }
                  </div>
                  @if (linkingFor() === item.id) {
                    <div class="flex items-center gap-2">
                      <app-audit-record-picker
                        class="flex-1"
                        [types]="evidenceTypes"
                        [excluded]="evidenceIds(item)"
                        placeholderKey="audits.checklist.searchEvidence"
                        (picked)="addEvidence(item, $event)"
                      />
                      <app-button variant="ghost" size="sm" (click)="linkingFor.set(null)">
                        {{ 'audits.common.close' | transloco }}
                      </app-button>
                    </div>
                  }
                </div>
              }

              @if (item.findings?.length) {
                <div class="mt-2 flex flex-wrap items-center gap-1.5" data-testid="item-findings">
                  <span class="text-meta font-semibold text-fg-muted">
                    {{ 'audits.checklist.findingsRaised' | transloco }}
                  </span>
                  @for (f of item.findings; track f.id) {
                    @let fb = findingBadge(f.status);
                    <a
                      [routerLink]="['/audits/findings', f.id]"
                      class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-meta hover:border-accent"
                    >
                      <span class="font-mono text-fg-subtle">{{ f.code }}</span>
                      <span class="truncate text-fg">{{ f.title }}</span>
                      <app-status-badge
                        [meaning]="fb.meaning"
                        [value]="fb.value"
                        [labelKey]="fb.labelKey"
                      />
                    </a>
                  }
                </div>
              } @else if (
                canRaise() && (item.result === 'nonconforming' || item.result === 'observation')
              ) {
                <a
                  [routerLink]="['/audits/plans', plan().id, 'findings', 'new']"
                  [queryParams]="{
                    item: item.id,
                    clause: item.clause_ref,
                    type: item.result === 'nonconforming' ? 'minor_nc' : 'observation',
                  }"
                  class="mt-2 inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
                >
                  <app-icon name="flag" [size]="12" />
                  {{ 'audits.checklist.raiseFinding' | transloco }}
                </a>
              }

              @if (item.answered_at) {
                <p class="mt-2 text-meta text-fg-subtle">
                  {{
                    'audits.checklist.answeredBy'
                      | transloco
                        : {
                            name: item.answered_by?.name || ('audits.common.someone' | transloco),
                            date: (item.answered_at | localDate),
                          }
                  }}
                </p>
              }
            </li>
          }
        </ol>
      }
    }

    <app-confirm-dialog
      [open]="!!deleting()"
      [title]="'audits.checklist.removeTitle' | transloco"
      [message]="'audits.checklist.removeMessage' | transloco"
      [confirmLabel]="'audits.common.remove' | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      [busy]="saving.busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class PlanChecklist {
  private readonly api = inject(AuditsApi);
  private readonly access = inject(AuditAccess);
  private readonly language = inject(LanguageService);

  readonly plan = input.required<PlanDetail>();
  /** Questions can be added, generated and removed. */
  readonly editable = input(false);
  /** Answers can be recorded (fieldwork). */
  readonly answerable = input(false);
  /** Findings can be raised from an answer. */
  readonly canRaise = input(false);
  /** The checklist changed (the host refreshes the plan counters). */
  readonly changed = output<void>();

  protected readonly results = CHECKLIST_RESULTS;
  protected readonly evidenceTypes = EVIDENCE_TYPES;
  protected readonly resultBadge = checklistResultBadge;
  protected readonly findingBadge = findingStatusBadge;
  protected readonly list = loadable<Checklist>();
  protected readonly saving = mutator();
  protected readonly adding = signal(false);
  protected readonly newQuestion = signal('');
  protected readonly newClause = signal<string | null>(null);
  protected readonly newEvidence = signal('');
  protected readonly drafts = signal<readonly DraftQuestion[]>([]);
  protected readonly rejected = signal<ReadonlySet<number>>(new Set());
  protected readonly deleting = signal<ChecklistItem | null>(null);
  protected readonly linkingFor = signal<string | null>(null);

  protected readonly hasClauses = computed(() => this.plan().clause_refs.length > 0);
  protected readonly progress = computed(() => {
    const c = this.list.value();
    return c ? checklistProgress(c.answered, c.total) : 0;
  });
  protected readonly selectedDrafts = computed(() =>
    this.drafts().filter((_, i) => !this.rejected().has(i)),
  );

  constructor() {
    effect(() => {
      const orgId = this.access.orgId();
      const planId = this.plan().id;
      untracked(() => orgId && this.list.load(this.api.checklist(orgId, planId), true));
    });
  }

  load(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      this.list.load(this.api.checklist(orgId, this.plan().id), true);
    }
  }

  private afterWrite(success?: string) {
    return {
      success,
      next: () => {
        this.load();
        this.changed.emit();
      },
    };
  }

  protected evidenceIds(item: ChecklistItem): string[] {
    return (item.evidence ?? []).map((e) => e.entity_id);
  }

  protected generate(): void {
    const orgId = this.access.orgId();
    if (!orgId || !this.hasClauses()) {
      return;
    }
    const lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.saving.run(
      this.api.generateChecklist(orgId, this.plan().id, { lang }),
      this.afterWrite('audits.notices.checklistGenerated'),
    );
  }

  protected onDraft(data: unknown): void {
    this.rejected.set(new Set());
    this.drafts.set(parseDraftQuestions(data));
  }

  protected toggleDraft(index: number): void {
    this.rejected.update((set) => {
      const next = new Set(set);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  protected acceptDrafts(): void {
    const orgId = this.access.orgId();
    const items = this.selectedDrafts();
    if (!orgId || !items.length) {
      return;
    }
    this.saving.run(this.api.addChecklistItems(orgId, this.plan().id, items, 'ai'), {
      success: 'audits.notices.questionsAdded',
      next: () => {
        this.drafts.set([]);
        this.load();
        this.changed.emit();
      },
    });
  }

  protected addQuestion(): void {
    const orgId = this.access.orgId();
    const question = this.newQuestion().trim();
    if (!orgId || !question) {
      return;
    }
    this.saving.run(
      this.api.addChecklistItem(orgId, this.plan().id, {
        question,
        clause_ref: this.newClause() || null,
        evidence_request: textOrNull(this.newEvidence()),
      }),
      {
        next: () => {
          this.newQuestion.set('');
          this.newClause.set(null);
          this.newEvidence.set('');
          this.load();
          this.changed.emit();
        },
      },
    );
  }

  protected setResult(item: ChecklistItem, result: ChecklistResult): void {
    const orgId = this.access.orgId();
    if (!orgId || result === item.result) {
      return;
    }
    this.saving.run(this.api.updateChecklistItem(orgId, this.plan().id, item.id, { result }), {
      ...this.afterWrite(),
      parallel: true,
    });
  }

  protected setNotes(item: ChecklistItem, notes: string): void {
    const orgId = this.access.orgId();
    if (!orgId || (item.notes ?? '') === notes) {
      return;
    }
    this.saving.run(
      this.api.updateChecklistItem(orgId, this.plan().id, item.id, { notes: textOrNull(notes) }),
      { next: () => this.load(), parallel: true },
    );
  }

  protected addEvidence(item: ChecklistItem, ref: EntityRef): void {
    this.writeEvidence(item, nextEvidenceRefs(item, { add: ref }));
  }

  protected removeEvidence(item: ChecklistItem, id: string): void {
    this.writeEvidence(item, nextEvidenceRefs(item, { remove: id }));
  }

  private writeEvidence(
    item: ChecklistItem,
    refs: readonly { entity_type: string; entity_id: string }[],
  ): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(
      this.api.updateChecklistItem(orgId, this.plan().id, item.id, { evidence_refs: refs }),
      {
        success: 'audits.notices.evidenceSaved',
        next: () => {
          this.linkingFor.set(null);
          this.load();
        },
        parallel: true,
      },
    );
  }

  protected remove(): void {
    const orgId = this.access.orgId();
    const item = this.deleting();
    if (!orgId || !item) {
      return;
    }
    this.saving.run(this.api.deleteChecklistItem(orgId, this.plan().id, item.id), {
      next: () => {
        this.deleting.set(null);
        this.load();
        this.changed.emit();
      },
      error: () => {
        this.deleting.set(null);
      },
    });
  }
}
