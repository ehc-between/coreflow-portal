import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, forkJoin } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import {
  DesignReview,
  DesignReviewCreate,
  DesignReviewUpdate,
  Milestone,
  REVIEW_KINDS,
  REVIEW_OUTCOMES,
  ReviewKind,
  ReviewOutcome,
  isOneOf,
} from './data/project.models';
import { outcomeTone } from './data/project-display';
import { projectErrorKey } from './data/project-errors';
import { ProjectsApi } from './data/projects-api';

export interface ReviewDraft {
  readonly kind: ReviewKind;
  readonly title: string;
  readonly stage: string;
  readonly milestone_id: string;
  readonly planned_date: string;
  readonly held_on: string;
  readonly participant_ids: readonly string[];
  readonly inputs: string;
  readonly findings: string;
  readonly outcome: ReviewOutcome;
}

export function emptyReviewDraft(patch: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    kind: 'review',
    title: '',
    stage: '',
    milestone_id: '',
    planned_date: '',
    held_on: '',
    participant_ids: [],
    inputs: '',
    findings: '',
    outcome: 'pending',
    ...patch,
  };
}

export function draftFromReview(r: DesignReview): ReviewDraft {
  return {
    kind: r.kind,
    title: r.title,
    stage: r.stage ?? '',
    milestone_id: r.milestone_id ?? '',
    planned_date: r.planned_date ?? '',
    held_on: r.held_on ?? '',
    participant_ids: r.participants.map((p) => p.id),
    inputs: r.inputs ?? '',
    findings: r.findings ?? '',
    outcome: r.outcome,
  };
}

export function reviewBody(d: ReviewDraft): DesignReviewCreate {
  return {
    kind: d.kind,
    title: d.title.trim(),
    stage: d.stage.trim() || null,
    milestone_id: d.milestone_id || null,
    planned_date: d.planned_date || null,
    held_on: d.held_on || null,
    participant_ids: [...d.participant_ids],
    inputs: d.inputs.trim() || null,
    findings: d.findings.trim() || null,
    outcome: d.outcome,
  };
}

/** A decided review needs the date it was held (a sensible check, not a backend rule). */
export function reviewNeedsDate(d: ReviewDraft): boolean {
  return d.outcome !== 'pending' && !d.held_on;
}

/**
 * Design reviews, verifications and validations (ISO 9001 8.3.4): who took part,
 * what was reviewed, the findings and the outcome. `focusId` (from `?review=`)
 * opens that record.
 */
@Component({
  selector: 'app-project-reviews',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    AskAbout,
    FieldHelp,
    Badge,
    Button,
    ConfirmDialog,
    FormField,
    Icon,
    SlideOver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-display text-[15px] font-bold text-fg">
        {{ 'projects.reviews.title' | transloco }}
      </h2>
      @if (canContribute()) {
        <app-button size="sm" variant="secondary" (click)="openNew()" data-testid="add-review">
          <app-icon name="plus" [size]="14" />
          {{ 'projects.reviews.add' | transloco }}
        </app-button>
      }
    </div>
    <app-field-help scope="projects" page="detail" field="design_reviews" />

    @switch (state()) {
      @case ('loading') {
        <p class="py-4 text-[13px] text-fg-muted" role="status">
          {{ 'projects.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <p class="py-4 text-[13px] text-fail" role="alert">
          {{ 'projects.common.loadFailed' | transloco }}
        </p>
      }
      @default {
        @if (items().length === 0) {
          <p class="py-4 text-[13px] text-fg-muted" data-testid="reviews-empty">
            {{ 'projects.reviews.empty' | transloco }}
          </p>
        } @else {
          <ul
            class="mt-2 divide-y divide-border rounded-tile border border-border"
            data-testid="reviews"
          >
            @for (r of items(); track r.id) {
              <li
                class="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                [class.bg-accent-soft]="highlight() === r.id"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 flex-col items-start text-left"
                  (click)="openEdit(r)"
                >
                  <span class="truncate text-[13.5px] font-semibold text-fg hover:underline">{{
                    r.title
                  }}</span>
                  <span class="text-[12px] text-fg-subtle">
                    {{ 'projects.reviewKinds.' + r.kind | transloco }}
                    @if (r.stage) {
                      · {{ r.stage }}
                    }
                    @if (milestoneTitle(r.milestone_id); as mt) {
                      · {{ mt }}
                    }
                  </span>
                </button>
                <span class="flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
                  @if (r.held_on) {
                    <span>{{
                      'projects.reviews.heldOn' | transloco: { date: (r.held_on | localDay) }
                    }}</span>
                  } @else if (r.planned_date) {
                    <span>{{
                      'projects.reviews.plannedFor'
                        | transloco: { date: (r.planned_date | localDay) }
                    }}</span>
                  }
                  <span>{{
                    'projects.reviews.participantCount'
                      | transloco: { count: r.participants.length }
                  }}</span>
                  <app-badge
                    [tone]="tone(r.outcome)"
                    [attr.data-testid]="'review-outcome-' + r.id"
                    >{{ 'projects.outcomes.' + r.outcome | transloco }}</app-badge
                  >
                </span>
              </li>
            }
          </ul>
        }
      }
    }

    <app-slide-over
      [open]="panelOpen()"
      [title]="panelTitle()"
      [closeLabel]="'projects.common.close' | transloco"
      [width]="560"
      (closed)="closePanel()"
    >
      @if (draft(); as d) {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
          <fieldset class="flex flex-col gap-4" [disabled]="!canContribute()">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-form-field [label]="'projects.reviews.kind' | transloco" inputId="cf-rv-kind">
                <select id="cf-rv-kind" (change)="setKind($any($event.target).value)">
                  @for (k of kinds; track k) {
                    <option [value]="k" [selected]="d.kind === k">
                      {{ 'projects.reviewKinds.' + k | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
              <app-form-field [label]="'projects.reviews.stage' | transloco" inputId="cf-rv-stage">
                <input
                  id="cf-rv-stage"
                  type="text"
                  maxlength="120"
                  [value]="d.stage"
                  (input)="patch({ stage: $any($event.target).value })"
                />
              </app-form-field>
            </div>
            <app-field-help scope="projects" page="detail" field="review_kind" />
            <app-form-field [label]="'projects.fields.title' | transloco" inputId="cf-rv-title">
              <input
                id="cf-rv-title"
                type="text"
                maxlength="255"
                required
                [value]="d.title"
                (input)="patch({ title: $any($event.target).value })"
                data-testid="review-title"
              />
            </app-form-field>
            @if (milestones().length) {
              <app-form-field [label]="'projects.reviews.milestone' | transloco" inputId="cf-rv-ms">
                <select id="cf-rv-ms" (change)="patch({ milestone_id: $any($event.target).value })">
                  <option value="" [selected]="!d.milestone_id">
                    {{ 'projects.reviews.noMilestone' | transloco }}
                  </option>
                  @for (m of milestones(); track m.id) {
                    <option [value]="m.id" [selected]="d.milestone_id === m.id">
                      {{ m.title }}
                    </option>
                  }
                </select>
              </app-form-field>
            }
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-form-field
                [label]="'projects.reviews.plannedDate' | transloco"
                inputId="cf-rv-plan"
              >
                <input
                  id="cf-rv-plan"
                  type="date"
                  [value]="d.planned_date"
                  (change)="patch({ planned_date: $any($event.target).value })"
                />
              </app-form-field>
              <app-form-field
                [label]="'projects.reviews.heldOnLabel' | transloco"
                inputId="cf-rv-held"
              >
                <input
                  id="cf-rv-held"
                  type="date"
                  [value]="d.held_on"
                  (change)="patch({ held_on: $any($event.target).value })"
                  data-testid="review-held"
                />
              </app-form-field>
            </div>

            <div>
              <p class="mb-1 text-[13px] font-semibold text-fg-muted">
                {{ 'projects.reviews.participants' | transloco }}
              </p>
              <ul class="mb-2 flex flex-wrap gap-1.5">
                @for (id of d.participant_ids; track id) {
                  <li
                    class="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5 text-[12.5px] text-fg"
                  >
                    {{ userName(id) }}
                    <button
                      type="button"
                      class="rounded-full p-0.5 text-fg-subtle hover:text-fg"
                      [attr.aria-label]="
                        'projects.team.removeNamed' | transloco: { name: userName(id) }
                      "
                      (click)="removeParticipant(id)"
                    >
                      <app-icon name="x" [size]="12" />
                    </button>
                  </li>
                } @empty {
                  <li class="text-[12.5px] text-fg-subtle">
                    {{ 'projects.reviews.noParticipants' | transloco }}
                  </li>
                }
              </ul>
              <label class="sr-only" for="cf-rv-add">{{
                'projects.reviews.addParticipant' | transloco
              }}</label>
              <select
                id="cf-rv-add"
                class="h-9 w-full rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
                (change)="addParticipant($any($event.target)); $any($event.target).value = ''"
                data-testid="review-add-participant"
              >
                <option value="">{{ 'projects.reviews.addParticipant' | transloco }}</option>
                @for (u of addableUsers(); track u.id) {
                  <option [value]="u.id">{{ u.label }}</option>
                }
              </select>
            </div>

            <div>
              <app-form-field
                [label]="'projects.reviews.inputs' | transloco"
                inputId="cf-rv-inputs"
              >
                <textarea
                  id="cf-rv-inputs"
                  rows="3"
                  maxlength="20000"
                  [value]="d.inputs"
                  (input)="patch({ inputs: $any($event.target).value })"
                ></textarea>
              </app-form-field>
              <app-field-help scope="projects" page="detail" field="review_inputs" />
            </div>
            <div>
              <app-form-field
                [label]="'projects.reviews.findings' | transloco"
                inputId="cf-rv-findings"
              >
                <textarea
                  id="cf-rv-findings"
                  rows="4"
                  maxlength="20000"
                  [value]="d.findings"
                  (input)="patch({ findings: $any($event.target).value })"
                ></textarea>
              </app-form-field>
              <div class="flex items-center gap-1">
                <app-field-help scope="projects" page="detail" field="review_findings" />
                <app-ask-about [prompt]="'projects.ask.findings' | transloco" field="findings" />
              </div>
            </div>
            <app-form-field
              [label]="'projects.reviews.outcome' | transloco"
              inputId="cf-rv-outcome"
            >
              <select
                id="cf-rv-outcome"
                (change)="setOutcome($any($event.target).value)"
                data-testid="review-outcome"
              >
                @for (o of outcomes; track o) {
                  <option [value]="o" [selected]="d.outcome === o">
                    {{ 'projects.outcomes.' + o | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            @if (needsDate()) {
              <p class="text-[12px] text-fail" role="alert" data-testid="review-needs-date">
                {{ 'projects.reviews.needsDate' | transloco }}
              </p>
            }
            @if (editing(); as r) {
              @if (r.decided_by) {
                <p class="text-[12px] text-fg-subtle">
                  {{
                    'projects.reviews.decidedBy'
                      | transloco: { name: r.decided_by.name, date: (r.decided_at | localDay) }
                  }}
                </p>
              }
              <app-form-field
                [label]="'projects.form.changeReason' | transloco"
                inputId="cf-rv-reason"
              >
                <input
                  id="cf-rv-reason"
                  type="text"
                  maxlength="2000"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
              </app-form-field>
            }
          </fieldset>
          @if (canContribute()) {
            <div class="flex flex-wrap justify-between gap-2">
              @if (editing() && canEdit()) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(editing())">
                  <app-icon name="trash" [size]="14" />
                  {{ 'projects.common.delete' | transloco }}
                </app-button>
              } @else {
                <span></span>
              }
              <app-button
                type="submit"
                size="sm"
                [loading]="busy()"
                [disabled]="busy() || !d.title.trim() || needsDate()"
                data-testid="review-save"
              >
                {{ 'common.save' | transloco }}
              </app-button>
            </div>
          }
        </form>
      }
    </app-slide-over>

    <app-confirm-dialog
      [open]="!!deleting()"
      [title]="'projects.reviews.deleteTitle' | transloco"
      [message]="'projects.reviews.deleteMessage' | transloco: { title: deleting()?.title ?? '' }"
      [confirmLabel]="'projects.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class ProjectReviews {
  private readonly api = inject(ProjectsApi);
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly projectId = input.required<string>();
  readonly canContribute = input(false);
  /** Delete needs the edit right. */
  readonly canEdit = input(false);
  readonly refresh = input(0);
  readonly focusId = input<string | null>(null);
  readonly changed = output<void>();

  protected readonly kinds = REVIEW_KINDS;
  protected readonly outcomes = REVIEW_OUTCOMES;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly DesignReview[]>([]);
  protected readonly milestones = signal<readonly Milestone[]>([]);
  protected readonly busy = signal(false);
  protected readonly panelOpen = signal(false);
  protected readonly draft = signal<ReviewDraft | null>(null);
  protected readonly editing = signal<DesignReview | null>(null);
  protected readonly deleting = signal<DesignReview | null>(null);
  protected readonly highlight = signal<string | null>(null);
  protected readonly changeReason = signal('');
  protected readonly needsDate = computed(() => {
    const d = this.draft();
    return !!d && reviewNeedsDate(d);
  });

  private readonly users = computed(() =>
    this.assignees.options().users.map((o) => ({ id: o.value.slice(5), label: o.label })),
  );
  protected readonly addableUsers = computed(() => {
    const taken = new Set(this.draft()?.participant_ids ?? []);
    return this.users().filter((u) => !taken.has(u.id));
  });
  protected readonly panelTitle = computed(() =>
    this.language.translate(
      this.editing() ? 'projects.reviews.editTitle' : 'projects.reviews.newTitle',
    ),
  );

  private request = new Subscription();
  private focused: string | null = null;

  constructor() {
    this.assignees.ensureLoaded();
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.projectId();
      this.refresh();
      untracked(() => this.load(orgId, id));
    });
    effect(() => {
      const focus = this.focusId();
      const items = this.items();
      if (focus && focus !== this.focused) {
        const r = items.find((i) => i.id === focus);
        if (r) {
          this.focused = focus;
          untracked(() => {
            this.highlight.set(r.id);
            this.openEdit(r);
          });
        }
      }
    });
  }

  protected tone(outcome: string) {
    return outcomeTone(outcome);
  }

  protected milestoneTitle(id: string | null): string | null {
    return id ? (this.milestones().find((m) => m.id === id)?.title ?? null) : null;
  }

  protected userName(id: string): string {
    const known =
      this.users().find((u) => u.id === id)?.label ??
      this.editing()?.participants.find((p) => p.id === id)?.name;
    return known ?? id;
  }

  protected openNew(): void {
    this.editing.set(null);
    this.changeReason.set('');
    this.draft.set(emptyReviewDraft());
    this.panelOpen.set(true);
  }

  protected openEdit(r: DesignReview): void {
    this.editing.set(r);
    this.changeReason.set('');
    this.draft.set(draftFromReview(r));
    this.panelOpen.set(true);
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
    this.editing.set(null);
    this.draft.set(null);
  }

  protected patch(p: Partial<ReviewDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }

  protected setKind(value: string): void {
    if (isOneOf(REVIEW_KINDS, value)) {
      this.patch({ kind: value });
    }
  }

  protected setOutcome(value: string): void {
    if (isOneOf(REVIEW_OUTCOMES, value)) {
      this.patch({ outcome: value });
    }
  }

  protected addParticipant(select: HTMLSelectElement): void {
    const id = select.value;
    const d = this.draft();
    if (id && d && !d.participant_ids.includes(id)) {
      this.patch({ participant_ids: [...d.participant_ids, id] });
    }
  }

  protected removeParticipant(id: string): void {
    const d = this.draft();
    if (d) {
      this.patch({ participant_ids: d.participant_ids.filter((p) => p !== id) });
    }
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || !d.title.trim() || reviewNeedsDate(d) || this.busy()) {
      return;
    }
    const existing = this.editing();
    const body = reviewBody(d);
    this.busy.set(true);
    const reason = this.changeReason().trim();
    const update: DesignReviewUpdate = reason ? { ...body, change_reason: reason } : body;
    const call = existing
      ? this.api.updateDesignReview(orgId, this.projectId(), existing.id, update)
      : this.api.addDesignReview(orgId, this.projectId(), body);
    call.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.items.update((list) =>
          existing ? list.map((i) => (i.id === saved.id ? saved : i)) : [...list, saved],
        );
        this.notifications.success('projects.notices.reviewSaved', { title: saved.title });
        this.closePanel();
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.deleting();
    if (!orgId || !r || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteDesignReview(orgId, this.projectId(), r.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.closePanel();
        this.items.update((list) => list.filter((i) => i.id !== r.id));
        this.notifications.success('projects.notices.reviewDeleted', { title: r.title });
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.items().length) {
      this.state.set('loading');
    }
    this.request = forkJoin({
      reviews: this.api.designReviews(orgId, id),
      milestones: this.api.milestones(orgId, id),
    }).subscribe({
      next: ({ reviews, milestones }) => {
        this.items.set(reviews);
        this.milestones.set(milestones.filter((m) => m.kind === 'milestone'));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
