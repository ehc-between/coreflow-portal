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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { AuditAccess } from '../data/audit-access';
import { checklistProgress, checklistResultTone, textOrNull } from '../data/audit-display';
import {
  CHECKLIST_RESULTS,
  Checklist,
  ChecklistItem,
  ChecklistResult,
  DraftQuestion,
  PlanDetail,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';

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

/**
 * The audit checklist: questions per clause with the evidence to ask for, generated
 * from the standards catalogue or drafted by the assistant (reviewed before saving),
 * and answered during fieldwork (conforming, nonconforming, observation, n/a + notes).
 * A nonconforming or observed answer links to raising a finding.
 */
@Component({
  selector: 'app-audit-plan-checklist',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    ClauseChips,
    FieldHelp,
    Badge,
    Button,
    ConfirmDialog,
    FormField,
    ProgressBar,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-audit-load-state [state]="list.state()" (retry)="load()" />
    @if (list.value(); as c) {
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <div class="min-w-[180px] flex-1">
          <app-progress-bar
            [value]="progress()"
            [label]="
              'audits.checklist.progress' | transloco: { answered: c.answered, total: c.total }
            "
          />
        </div>
        <span class="text-[12.5px] text-fg-muted">
          {{ 'audits.checklist.progress' | transloco: { answered: c.answered, total: c.total } }}
        </span>
      </div>

      @if (editable()) {
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <app-button variant="secondary" size="sm" [loading]="saving.busy()" (click)="generate()">
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
            {{ 'audits.checklist.addQuestion' | transloco }}
          </app-button>
        </div>
        @if (!plan().clause_refs.length) {
          <p class="mb-3 text-[12.5px] text-fg-muted">
            {{ 'audits.checklist.noClauses' | transloco }}
          </p>
        }
      }

      @if (drafts().length) {
        <div
          class="mb-4 rounded-[10px] border border-accent-border bg-accent-soft/50 p-3"
          data-testid="draft-questions"
        >
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-[13px] font-semibold text-fg">
              {{ 'audits.checklist.draftsTitle' | transloco: { count: drafts().length } }}
            </h4>
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
          <p class="mb-2 text-[12px] text-fg-muted">
            {{ 'audits.checklist.draftsHint' | transloco }}
          </p>
          <ul class="flex flex-col gap-2">
            @for (d of drafts(); track $index) {
              <li>
                <label class="flex items-start gap-2 text-[13px] text-fg">
                  <input
                    type="checkbox"
                    class="mt-0.5 h-4 w-4"
                    [checked]="!rejected().has($index)"
                    (change)="toggleDraft($index)"
                  />
                  <span>
                    @if (d.clause_ref) {
                      <span class="mr-1 font-semibold text-accent">{{ d.clause_ref }}</span>
                    }
                    {{ d.question }}
                    @if (d.evidence_request) {
                      <span class="block text-[12px] text-fg-muted">
                        {{ 'audits.checklist.evidence' | transloco }}: {{ d.evidence_request }}
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
          class="mb-4 grid grid-cols-1 gap-3 rounded-[10px] border border-border bg-surface-2 p-3 sm:grid-cols-2"
          (submit)="$event.preventDefault(); addQuestion()"
        >
          <app-form-field
            class="sm:col-span-2"
            [label]="'audits.checklist.question' | transloco"
            inputId="cl-question"
          >
            <input
              id="cl-question"
              required
              [value]="newQuestion()"
              (input)="newQuestion.set($any($event.target).value)"
            />
          </app-form-field>
          <app-form-field [label]="'audits.fields.clauseRef' | transloco" inputId="cl-clause">
            <input
              id="cl-clause"
              maxlength="64"
              [value]="newClause()"
              (input)="newClause.set($any($event.target).value)"
            />
          </app-form-field>
          <app-form-field [label]="'audits.checklist.evidence' | transloco" inputId="cl-evidence">
            <input
              id="cl-evidence"
              [value]="newEvidence()"
              (input)="newEvidence.set($any($event.target).value)"
            />
          </app-form-field>
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
        <ol class="flex flex-col gap-2">
          @for (item of c.items; track item.id; let i = $index) {
            <li class="rounded-[10px] border border-border p-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <p class="text-[13.5px] text-fg">
                    <span class="mr-1 text-fg-subtle">{{ i + 1 }}.</span>{{ item.question }}
                  </p>
                  @if (item.evidence_request) {
                    <p class="mt-0.5 text-[12.5px] text-fg-muted">
                      {{ 'audits.checklist.evidence' | transloco }}: {{ item.evidence_request }}
                    </p>
                  }
                  <div class="mt-1 flex flex-wrap items-center gap-1.5">
                    @if (item.clause_ref) {
                      <app-clause-chips [clauses]="[item.clause_ref]" />
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
                      {{ 'audits.checklist.result' | transloco }}
                    </label>
                    <select
                      [id]="'cl-result-' + item.id"
                      class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
                      (change)="setResult(item, $any($event.target).value)"
                    >
                      @for (r of results; track r) {
                        <option [value]="r" [selected]="item.result === r">
                          {{ 'audits.checklistResult.' + r | transloco }}
                        </option>
                      }
                    </select>
                  } @else {
                    <app-badge [tone]="resultTone(item.result)">
                      {{ 'audits.checklistResult.' + item.result | transloco }}
                    </app-badge>
                  }
                  @if (editable()) {
                    <app-button variant="ghost" size="sm" (click)="deleting.set(item)">
                      {{ 'audits.common.remove' | transloco }}
                    </app-button>
                  }
                </div>
              </div>
              @if (answerable()) {
                <div class="mt-2">
                  <label class="sr-only" [attr.for]="'cl-notes-' + item.id">{{
                    'audits.checklist.notes' | transloco
                  }}</label>
                  <textarea
                    [id]="'cl-notes-' + item.id"
                    rows="2"
                    class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-fg"
                    [placeholder]="'audits.checklist.notesPlaceholder' | transloco"
                    [value]="item.notes ?? ''"
                    (change)="setNotes(item, $any($event.target).value)"
                  ></textarea>
                </div>
              } @else if (item.notes) {
                <p class="mt-2 text-[12.5px] whitespace-pre-line text-fg-muted">{{ item.notes }}</p>
              }
              @if (
                canRaise() && (item.result === 'nonconforming' || item.result === 'observation')
              ) {
                <a
                  [routerLink]="['/audits/plans', plan().id, 'findings', 'new']"
                  [queryParams]="{
                    item: item.id,
                    clause: item.clause_ref,
                    type: item.result === 'nonconforming' ? 'minor_nc' : 'observation',
                  }"
                  class="mt-2 inline-block text-[12.5px] font-semibold text-accent hover:underline"
                >
                  {{ 'audits.checklist.raiseFinding' | transloco }}
                </a>
              }
            </li>
          }
        </ol>
      } @else {
        <p class="text-[13px] text-fg-muted">{{ 'audits.checklist.empty' | transloco }}</p>
        <app-field-help scope="audits" page="planDetail" field="checklist" />
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
  protected readonly resultTone = checklistResultTone;
  protected readonly list = loadable<Checklist>();
  protected readonly saving = mutator();
  protected readonly adding = signal(false);
  protected readonly newQuestion = signal('');
  protected readonly newClause = signal('');
  protected readonly newEvidence = signal('');
  protected readonly drafts = signal<readonly DraftQuestion[]>([]);
  protected readonly rejected = signal<ReadonlySet<number>>(new Set());
  protected readonly deleting = signal<ChecklistItem | null>(null);

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

  protected generate(): void {
    const orgId = this.access.orgId();
    if (!orgId) {
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
        clause_ref: textOrNull(this.newClause()),
        evidence_request: textOrNull(this.newEvidence()),
      }),
      {
        next: () => {
          this.newQuestion.set('');
          this.newClause.set('');
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
