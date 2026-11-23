import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { dateInputToIso, isoToDateInput, kpiResultValue } from '../data/process-display';
import { processErrorKey } from '../data/process-errors';
import { ProcessReferences } from '../data/process-references';
import {
  ProcessDetail,
  REVIEW_CHECKS,
  REVIEW_OUTCOMES,
  ReviewOutcome,
  ReviewPrefill,
  ReviewRequest,
} from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';

/** One checklist row in the form. */
export interface CheckRow {
  readonly key: string;
  readonly ok: boolean | null;
  readonly note: string;
  /** What the live data says (params of `processes.review.data.<key>`). */
  readonly params: Readonly<Record<string, unknown>> | null;
  readonly suggested: boolean | null;
}

/** A follow-up task created from the review. */
export interface ActionRow {
  readonly title: string;
  readonly assignee: string;
  readonly due: string;
}

/** Checklist rows from the prefill (every known question, in order). */
export function checklistFromPrefill(prefill: ReviewPrefill | null): CheckRow[] {
  const byKey = new Map((prefill?.checklist ?? []).map((c) => [c.key, c]));
  return REVIEW_CHECKS.map((key) => {
    const item = byKey.get(key);
    return {
      key,
      ok: item?.ok ?? null,
      note: '',
      params: item?.params ?? null,
      suggested: item?.ok ?? null,
    };
  });
}

/** The request body; only answered checks, non-empty actions. */
export function toReviewRequest(
  outcome: ReviewOutcome,
  checks: readonly CheckRow[],
  actions: readonly ActionRow[],
  notes: string,
  next: string,
): ReviewRequest {
  return {
    notes: notes.trim() || null,
    next_review_at: dateInputToIso(next),
    outcome,
    checklist: checks
      .filter((c) => c.ok !== null || c.note.trim())
      .map((c) => ({ key: c.key, ok: c.ok, note: c.note.trim() || null })),
    actions: actions
      .filter((a) => a.title.trim())
      .map((a) => ({
        title: a.title.trim(),
        assignee_user_id: a.assignee || null,
        due_at: dateInputToIso(a.due),
      })),
  };
}

/**
 * "Registrer gjennomgang": the periodic review of a process as a real record.
 * The checklist (purpose, KPIs against target, risks, map, description, open
 * deviations, interactions) is prefilled from live data, so the owner confirms
 * or corrects each point. The owner picks an outcome (suitable and effective /
 * needs change / not effective), adds follow-up actions (tasks on the process,
 * in "Mitt arbeid") and notes, and sets the next date (the interval decides it
 * when left empty). Emits the updated process.
 */
@Component({
  selector: 'app-process-review-form',
  imports: [
    DateInput,
    RouterLink,
    TranslocoPipe,
    AskAbout,
    LocalDayPipe,
    LocalNumberPipe,
    Button,
    FormField,
    Icon,
    SlideOver,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'processes.review.recordTitle' | transloco"
      [subtitle]="'processes.review.recordSubtitle' | transloco"
      [closeLabel]="'processes.actions.close' | transloco"
      [width]="600"
      (closed)="closed.emit()"
    >
      @if (open()) {
        <form
          class="flex flex-col gap-5"
          (submit)="$event.preventDefault(); submit()"
          data-testid="review-form"
        >
          <fieldset>
            <legend class="mb-2 text-card font-bold text-fg">
              {{ 'processes.review.outcomeLabel' | transloco }}
            </legend>
            <div class="flex flex-col gap-2">
              @for (o of outcomes; track o) {
                <label
                  class="flex cursor-pointer items-start gap-2.5 rounded-tile border px-3 py-2.5 text-ui"
                  [class]="outcome() === o ? 'border-accent bg-accent-soft' : 'border-border'"
                >
                  <input
                    type="radio"
                    name="cf-review-outcome"
                    class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    [checked]="outcome() === o"
                    (change)="outcome.set(o)"
                    [attr.data-testid]="'outcome-' + o"
                  />
                  <span>
                    <span class="block font-semibold text-fg">{{
                      'processes.review.outcome.' + o | transloco
                    }}</span>
                    <span class="block text-meta text-fg-muted">{{
                      'processes.review.outcomeHint.' + o | transloco
                    }}</span>
                  </span>
                </label>
              }
            </div>
          </fieldset>

          <section>
            <div class="mb-1 flex items-center justify-between gap-2">
              <h3 class="text-card font-bold text-fg">
                {{ 'processes.review.checklist' | transloco }}
              </h3>
              <app-ask-about
                [prompt]="'processes.review.askChecklist' | transloco"
                field="review"
              />
            </div>
            <p class="mb-2 text-meta text-fg-muted">
              @if (loading()) {
                {{ 'common.loading' | transloco }}
              } @else {
                {{ 'processes.review.checklistHint' | transloco }}
              }
            </p>
            <ul class="flex flex-col divide-y divide-border rounded-tile border border-border">
              @for (c of checks(); track c.key; let i = $index) {
                <li class="flex flex-col gap-1.5 px-3 py-2.5" [attr.data-testid]="'check-' + c.key">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <p class="text-ui font-semibold text-fg">
                        {{ 'processes.review.checks.' + c.key | transloco }}
                      </p>
                      @if (c.params) {
                        <p class="text-meta text-fg-muted">
                          {{ 'processes.review.data.' + c.key | transloco: c.params }}
                        </p>
                      }
                    </div>
                    <div
                      class="inline-flex flex-none overflow-hidden rounded-tile border border-border"
                      role="radiogroup"
                      [attr.aria-label]="'processes.review.checks.' + c.key | transloco"
                    >
                      @for (opt of answerOptions; track opt.key) {
                        <button
                          type="button"
                          role="radio"
                          class="min-h-8 px-2.5 text-meta font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                          [class]="
                            c.ok === opt.value
                              ? 'bg-accent text-white'
                              : 'bg-surface text-fg-muted hover:text-fg'
                          "
                          [attr.aria-checked]="c.ok === opt.value"
                          (click)="setCheck(i, { ok: opt.value })"
                        >
                          {{ 'processes.review.answer.' + opt.key | transloco }}
                        </button>
                      }
                    </div>
                  </div>
                  @if (c.ok === false) {
                    <input
                      class="cf-review"
                      maxlength="1000"
                      [attr.aria-label]="'processes.review.checkNote' | transloco"
                      [placeholder]="'processes.review.checkNote' | transloco"
                      [value]="c.note"
                      (input)="setCheck(i, { note: $any($event.target).value })"
                    />
                  }
                </li>
              }
            </ul>
          </section>

          @if (prefill(); as pf) {
            @if (pf.kpis.length > 0) {
              <section>
                <h3 class="mb-1.5 text-card font-bold text-fg">
                  {{ 'processes.review.kpis' | transloco }}
                </h3>
                <ul class="flex flex-col gap-1.5 text-ui">
                  @for (k of pf.kpis; track k.index) {
                    <li class="flex flex-wrap items-center gap-2">
                      <span class="font-semibold text-fg">{{ k.name }}</span>
                      @if (k.kpi_id && isNum(k.latest_value)) {
                        <span class="text-meta text-fg-muted">{{
                          'processes.kpi.latestVsTarget'
                            | transloco
                              : {
                                  value: (k.latest_value | localNumber),
                                  target: isNum(k.target_value)
                                    ? (k.target_value | localNumber)
                                    : '—',
                                  unit: k.unit ?? '',
                                }
                        }}</span>
                        <app-status-badge
                          meaning="compliance"
                          [value]="resultValue(k.status)"
                          [labelKey]="'processes.kpi.result.' + (k.status ?? 'none')"
                        />
                      } @else {
                        <span class="text-meta text-fg-subtle">{{
                          (k.kpi_id ? 'processes.kpi.noValues' : 'processes.kpi.notLinked')
                            | transloco
                        }}</span>
                      }
                    </li>
                  }
                </ul>
              </section>
            }
          }

          <section>
            <h3 class="text-card font-bold text-fg">
              {{ 'processes.review.actions' | transloco }}
            </h3>
            <p class="mb-2 text-meta text-fg-muted">
              {{ 'processes.review.actionsHint' | transloco }}
            </p>
            <div class="flex flex-col gap-2">
              @for (a of actions(); track $index; let i = $index) {
                <div
                  class="grid grid-cols-1 gap-2 rounded-tile border border-border p-2 sm:grid-cols-[1fr_150px_140px_auto]"
                  data-testid="review-action"
                >
                  <input
                    class="cf-review"
                    maxlength="255"
                    [attr.aria-label]="'processes.review.actionTitle' | transloco"
                    [placeholder]="'processes.review.actionTitle' | transloco"
                    [value]="a.title"
                    (input)="setAction(i, { title: $any($event.target).value })"
                  />
                  <select
                    class="cf-review"
                    [attr.aria-label]="'processes.review.actionAssignee' | transloco"
                    (change)="setAction(i, { assignee: $any($event.target).value })"
                  >
                    <option value="" [selected]="!a.assignee">
                      {{ 'processes.review.actionOwner' | transloco }}
                    </option>
                    @for (u of references.users(); track u.id) {
                      <option [value]="u.id" [selected]="u.id === a.assignee">{{ u.name }}</option>
                    }
                  </select>
                  <input
                    class="cf-review"
                    type="date"
                    [attr.aria-label]="'processes.review.actionDue' | transloco"
                    [value]="a.due"
                    (input)="setAction(i, { due: $any($event.target).value })"
                  />
                  <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center rounded-lg text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [attr.aria-label]="'processes.review.removeAction' | transloco"
                    (click)="removeAction(i)"
                  >
                    <app-icon name="x" [size]="14" />
                  </button>
                </div>
              }
            </div>
            <app-button
              class="mt-2"
              variant="secondary"
              size="sm"
              (click)="addAction()"
              data-testid="review-add-action"
            >
              <app-icon name="plus" [size]="14" />
              {{ 'processes.review.addAction' | transloco }}
            </app-button>
          </section>

          <app-form-field [label]="'processes.review.notes' | transloco" inputId="cf-review-notes">
            <textarea
              id="cf-review-notes"
              rows="4"
              maxlength="2000"
              [placeholder]="'processes.review.notesPlaceholder' | transloco"
              [value]="notes()"
              (input)="notes.set($any($event.target).value)"
              data-testid="review-notes"
            ></textarea>
          </app-form-field>

          <div>
            <app-form-field
              [label]="'processes.review.nextDate' | transloco"
              inputId="cf-review-next"
            >
              <app-date-input
                inputId="cf-review-next"
                [value]="next()"
                (valueChange)="next.set($event ?? '')"
              />
            </app-form-field>
            <p class="mt-1 text-meta text-fg-muted">
              @if (prefill()?.suggested_next_review_at; as suggested) {
                {{
                  'processes.review.nextDateSuggested' | transloco: { date: (suggested | localDay) }
                }}
              } @else {
                {{ 'processes.review.nextDateHint' | transloco }}
              }
            </p>
          </div>

          @if (prefill()?.open_deviations) {
            <p class="text-meta text-warn-ink">
              {{
                'processes.review.openDeviations' | transloco: { count: prefill()?.open_deviations }
              }}
              <a
                [routerLink]="['/processes', process().id]"
                [queryParams]="{ tab: 'related' }"
                class="font-semibold underline"
              >
                {{ 'processes.review.seeRelated' | transloco }}
              </a>
            </p>
          }

          <div
            class="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border bg-surface px-1 pt-3"
          >
            <app-button variant="secondary" (click)="closed.emit()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              [loading]="busy()"
              [disabled]="busy()"
              data-testid="review-submit"
            >
              {{ 'processes.review.submit' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-slide-over>
  `,
  styles: [
    `
      .cf-review {
        width: 100%;
        min-height: 36px;
        border-radius: 9px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        padding: 6px 10px;
        outline: none;
      }
      .cf-review:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ReviewForm {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly references = inject(ProcessReferences);

  readonly open = input(false);
  readonly process = input.required<ProcessDetail>();
  /** UI language, for the date inputs. */
  readonly lang = input('nb');
  readonly saved = output<ProcessDetail>();
  readonly closed = output<void>();

  protected readonly outcomes = REVIEW_OUTCOMES;
  protected readonly answerOptions = [
    { key: 'yes', value: true },
    { key: 'no', value: false },
    { key: 'unset', value: null },
  ] as const;

  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly prefill = signal<ReviewPrefill | null>(null);
  protected readonly outcome = signal<ReviewOutcome>('suitable');
  protected readonly checks = signal<CheckRow[]>(checklistFromPrefill(null));
  protected readonly actions = signal<ActionRow[]>([]);
  protected readonly notes = signal('');
  protected readonly next = signal('');

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      untracked(() => this.start());
    });
  }

  private start(): void {
    this.outcome.set('suitable');
    this.actions.set([]);
    this.notes.set('');
    this.next.set('');
    this.prefill.set(null);
    this.checks.set(checklistFromPrefill(null));
    this.references.ensurePeople();
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.process();
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    this.api.reviewPrefill(orgId, p.id).subscribe({
      next: (prefill) => {
        this.loading.set(false);
        this.prefill.set(prefill);
        this.checks.set(checklistFromPrefill(prefill));
        if (prefill.suggested_next_review_at && !this.next()) {
          this.next.set(isoToDateInput(prefill.suggested_next_review_at));
        }
      },
      // An older server has no prefill: the checklist stays unanswered.
      error: () => this.loading.set(false),
    });
  }

  protected isNum(value: number | null | undefined): boolean {
    return typeof value === 'number' && Number.isFinite(value);
  }

  protected resultValue(status: string | null | undefined): string {
    return kpiResultValue(status);
  }

  protected setCheck(index: number, patch: Partial<CheckRow>): void {
    this.checks.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  protected addAction(): void {
    this.actions.update((rows) => [...rows, { title: '', assignee: '', due: '' }]);
  }

  protected setAction(index: number, patch: Partial<ActionRow>): void {
    this.actions.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  protected removeAction(index: number): void {
    this.actions.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected submit(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const body = toReviewRequest(
      this.outcome(),
      this.checks(),
      this.actions(),
      this.notes(),
      this.next(),
    );
    this.busy.set(true);
    this.api.recordReview(orgId, this.process().id, body).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.notifications.success(
          body.actions?.length
            ? 'processes.notices.reviewedWithActions'
            : 'processes.notices.reviewed',
          { count: body.actions?.length ?? 0 },
        );
        this.saved.emit(updated);
      },
      error: (error) => {
        this.busy.set(false);
        this.notifications.error(processErrorKey(error));
      },
    });
  }
}
