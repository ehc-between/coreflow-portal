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
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { Attachments } from '../../shared/attachments/attachments';
import { FieldHelp } from '../../shared/guidance/field-help';
import { EntityChip } from '../../shared/kit/entity-chip';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  DesignReview,
  DesignReviewCreate,
  DesignReviewUpdate,
  EntityRef,
  Milestone,
  REVIEW_KINDS,
  REVIEW_OUTCOMES,
  ReviewKind,
  ReviewOutcome,
  isOneOf,
} from './data/project.models';
import { outcomeBadge } from './data/project-display';
import { projectErrorKey } from './data/project-errors';
import { ProjectsApi } from './data/projects-api';
import { ProjectRecordPicker } from './record-picker';

/** A document the review looked at, as shown on the form. */
export interface InputDocDraft {
  readonly document_id: string;
  /** The pinned revision (null = the current approved one, set on save). */
  readonly revision: string | null;
  readonly ref: EntityRef | null;
  readonly current_revision: string | null;
  readonly outdated: boolean;
}

export interface ReviewDraft {
  readonly kind: ReviewKind;
  readonly title: string;
  readonly milestone_id: string;
  readonly planned_date: string;
  readonly held_on: string;
  readonly participant_ids: readonly string[];
  readonly inputs: string;
  readonly input_documents: readonly InputDocDraft[];
  readonly findings: string;
  readonly outcome: ReviewOutcome;
}

export function emptyReviewDraft(patch: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    kind: 'review',
    title: '',
    milestone_id: '',
    planned_date: '',
    held_on: '',
    participant_ids: [],
    inputs: '',
    input_documents: [],
    findings: '',
    outcome: 'pending',
    ...patch,
  };
}

export function draftFromReview(r: DesignReview): ReviewDraft {
  return {
    kind: r.kind,
    title: r.title,
    milestone_id: r.milestone_id ?? '',
    planned_date: r.planned_date ?? '',
    held_on: r.held_on ?? '',
    participant_ids: r.participants.map((p) => p.id),
    inputs: r.inputs ?? '',
    input_documents: (r.input_documents ?? []).map((d) => ({
      document_id: d.document_id,
      revision: d.revision,
      ref: d.document,
      current_revision: d.current_revision,
      outdated: d.outdated,
    })),
    findings: r.findings ?? '',
    outcome: r.outcome,
  };
}

/**
 * The request body. The free-text stage is no longer edited (the phase follows the
 * milestone), so it is left out and keeps its stored value.
 */
export function reviewBody(d: ReviewDraft): DesignReviewCreate {
  return {
    kind: d.kind,
    title: d.title.trim(),
    milestone_id: d.milestone_id || null,
    planned_date: d.planned_date || null,
    held_on: d.held_on || null,
    participant_ids: [...d.participant_ids],
    inputs: d.inputs.trim() || null,
    input_documents: d.input_documents.map((x) => ({
      document_id: x.document_id,
      ...(x.revision ? { revision: x.revision } : {}),
    })),
    findings: d.findings.trim() || null,
    outcome: d.outcome,
  };
}

/** A decided review needs the date it was held (a sensible check, not a backend rule). */
export function reviewNeedsDate(d: ReviewDraft): boolean {
  return d.outcome !== 'pending' && !d.held_on;
}

/**
 * Design reviews, verifications, validations and design changes (ISO 9001 8.3.4
 * and 8.3.6): who took part, which controlled documents were reviewed (pinned
 * to the revision), the findings, the outcome, and the actions raised from them
 * (tasks on the review, which block close-out until done). `focusId` (from
 * `?review=`) opens that record.
 */
@Component({
  selector: 'app-project-reviews',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    AskAbout,
    Attachments,
    FieldHelp,
    EntityChip,
    SupportsRequirements,
    EntityTasks,
    Button,
    ConfirmDialog,
    ErrorState,
    FormField,
    Icon,
    LoadingState,
    SlideOver,
    StatusBadge,
    ProjectRecordPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <h2 class="font-display text-card font-bold text-fg">
          {{ 'projects.reviews.title' | transloco }}
        </h2>
        <app-field-help scope="projects" page="detail" field="design_reviews" />
      </div>
      @if (canContribute()) {
        <app-button size="sm" variant="secondary" (click)="openNew()" data-testid="add-review">
          <app-icon name="plus" [size]="14" />
          {{ 'projects.reviews.add' | transloco }}
        </app-button>
      }
    </div>

    @switch (state()) {
      @case ('loading') {
        <app-loading-state [rows]="2" />
      }
      @case ('error') {
        <app-error-state (retry)="reload()" />
      }
      @default {
        @if (items().length === 0) {
          <p class="py-4 text-ui text-fg-muted" data-testid="reviews-empty">
            {{ 'projects.reviews.empty' | transloco }}
          </p>
        } @else {
          <ul
            class="mt-2 divide-y divide-border rounded-tile border border-border"
            data-testid="reviews"
          >
            @for (r of items(); track r.id) {
              <li
                class="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                [class.bg-accent-soft]="highlight() === r.id"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 flex-col items-start text-left"
                  (click)="openEdit(r)"
                  [attr.data-testid]="'review-open-' + r.id"
                >
                  <span
                    class="max-w-full truncate text-body font-semibold text-fg hover:underline"
                    >{{ r.title }}</span
                  >
                  <span class="text-meta text-fg-subtle">
                    {{ 'projects.reviewKinds.' + r.kind | transloco }}
                    @if (phaseOf(r); as phase) {
                      · {{ 'projects.reviews.inPhase' | transloco: { phase } }}
                    }
                    @if (milestoneOf(r); as mt) {
                      · {{ mt }}
                    }
                  </span>
                </button>
                <span class="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
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
                  @if (r.actions; as a) {
                    @if (a.total > 0) {
                      <span
                        [class.text-warn-ink]="a.open > 0"
                        [class.font-semibold]="a.open > 0"
                        [attr.data-testid]="'review-actions-' + r.id"
                        >{{ actionsText(a.total, a.open) }}</span
                      >
                    }
                  }
                  <app-status-badge
                    [meaning]="badge(r.outcome).meaning"
                    [value]="badge(r.outcome).value"
                    [labelKey]="badge(r.outcome).labelKey"
                    [attr.data-testid]="'review-outcome-' + r.id"
                  />
                  <app-ask-about
                    [prompt]="'projects.ask.review' | transloco: { title: r.title }"
                    labelKey="projects.ask.reviewLabel"
                  />
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
      [width]="600"
      (closed)="closePanel()"
    >
      @if (draft(); as d) {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
          <fieldset class="flex flex-col gap-4" [disabled]="!canContribute()">
            <div>
              <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                <label for="cf-rv-kind" class="text-ui font-semibold text-fg-muted">{{
                  'projects.reviews.kind' | transloco
                }}</label>
                <app-field-help scope="projects" page="detail" field="review_kind" />
              </div>
              <app-form-field inputId="cf-rv-kind">
                <select
                  id="cf-rv-kind"
                  (change)="setKind($any($event.target).value)"
                  data-testid="review-kind"
                >
                  @for (k of kinds; track k) {
                    <option [value]="k" [selected]="d.kind === k">
                      {{ 'projects.reviewKinds.' + k | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
            </div>
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
              <div>
                <app-form-field
                  [label]="'projects.reviews.milestone' | transloco"
                  inputId="cf-rv-ms"
                >
                  <select
                    id="cf-rv-ms"
                    (change)="patch({ milestone_id: $any($event.target).value })"
                    data-testid="review-milestone"
                  >
                    <option value="" [selected]="!d.milestone_id">
                      {{ 'projects.reviews.noMilestone' | transloco }}
                    </option>
                    @for (m of milestones(); track m.id) {
                      <option [value]="m.id" [selected]="d.milestone_id === m.id">
                        {{ milestoneOption(m) }}
                      </option>
                    }
                  </select>
                </app-form-field>
                @if (draftPhase(); as phase) {
                  <p class="mt-1 text-meta text-fg-subtle" data-testid="review-phase">
                    {{ 'projects.reviews.phaseFromMilestone' | transloco: { phase } }}
                  </p>
                }
              </div>
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
              <p class="mb-1 text-ui font-semibold text-fg-muted">
                {{ 'projects.reviews.participants' | transloco }}
              </p>
              <ul class="mb-2 flex flex-wrap gap-1.5">
                @for (id of d.participant_ids; track id) {
                  <li
                    class="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5 text-ui text-fg"
                  >
                    {{ userName(id) }}
                    <button
                      type="button"
                      class="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:text-fg"
                      [attr.aria-label]="
                        'projects.team.removeNamed' | transloco: { name: userName(id) }
                      "
                      (click)="removeParticipant(id)"
                    >
                      <app-icon name="x" [size]="12" />
                    </button>
                  </li>
                } @empty {
                  <li class="text-ui text-fg-subtle">
                    {{ 'projects.reviews.noParticipants' | transloco }}
                  </li>
                }
              </ul>
              <app-form-field inputId="cf-rv-add">
                <label class="sr-only" for="cf-rv-add">{{
                  'projects.reviews.addParticipant' | transloco
                }}</label>
                <select
                  id="cf-rv-add"
                  (change)="addParticipant($any($event.target)); $any($event.target).value = ''"
                  data-testid="review-add-participant"
                >
                  <option value="">{{ 'projects.reviews.addParticipant' | transloco }}</option>
                  @for (u of addableUsers(); track u.id) {
                    <option [value]="u.id">{{ u.label }}</option>
                  }
                </select>
              </app-form-field>
            </div>

            <div>
              <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span class="text-ui font-semibold text-fg-muted">{{
                  'projects.reviews.inputDocuments' | transloco
                }}</span>
                <app-field-help scope="projects" page="detail" field="review_documents" />
              </div>
              @if (d.input_documents.length) {
                <ul class="mb-2 flex flex-col gap-1.5" data-testid="review-documents">
                  @for (doc of d.input_documents; track doc.document_id) {
                    <li
                      class="flex flex-wrap items-center gap-2 rounded-tile border border-border px-2.5 py-1.5"
                    >
                      <span class="min-w-0 flex-1">
                        @if (doc.ref) {
                          <app-entity-chip [ref]="doc.ref" />
                        } @else {
                          <span class="text-ui text-fg-subtle">{{
                            'projects.reviews.documentHidden' | transloco
                          }}</span>
                        }
                      </span>
                      <span class="text-meta text-fg-muted">
                        @if (doc.revision) {
                          {{ 'projects.reviews.revision' | transloco: { revision: doc.revision } }}
                        } @else {
                          {{ 'projects.reviews.revisionOnSave' | transloco }}
                        }
                      </span>
                      @if (doc.outdated) {
                        <app-status-badge
                          meaning="lifecycle"
                          value="expiring"
                          labelKey="projects.reviews.outdated"
                          [labelParams]="{ revision: doc.current_revision ?? '' }"
                        />
                      }
                      @if (canContribute()) {
                        <button
                          type="button"
                          class="inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fg"
                          [attr.aria-label]="
                            'projects.picker.remove'
                              | transloco: { name: doc.ref?.code || doc.ref?.title || '' }
                          "
                          (click)="removeDocument(doc.document_id)"
                        >
                          <app-icon name="x" [size]="12" />
                        </button>
                      }
                    </li>
                  }
                </ul>
              }
              <app-project-record-picker
                [types]="documentTypes"
                [picked]="pickedDocs()"
                [disabled]="!canContribute()"
                [label]="'projects.reviews.inputDocuments' | transloco"
                [placeholder]="'projects.reviews.documentPlaceholder' | transloco"
                testId="review-doc-picker"
                (selected)="addDocument($event)"
              />
            </div>

            <div>
              <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                <label for="cf-rv-inputs" class="text-ui font-semibold text-fg-muted">{{
                  'projects.reviews.inputs' | transloco
                }}</label>
                <app-field-help scope="projects" page="detail" field="review_inputs" />
              </div>
              <app-form-field inputId="cf-rv-inputs">
                <textarea
                  id="cf-rv-inputs"
                  rows="2"
                  maxlength="20000"
                  [value]="d.inputs"
                  (input)="patch({ inputs: $any($event.target).value })"
                ></textarea>
              </app-form-field>
            </div>
            <div>
              <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                <label for="cf-rv-findings" class="text-ui font-semibold text-fg-muted">{{
                  'projects.reviews.findings' | transloco
                }}</label>
                <app-field-help scope="projects" page="detail" field="review_findings" />
                <app-ask-about
                  [prompt]="'projects.ask.findings' | transloco"
                  field="findings"
                  [fieldLabel]="'projects.reviews.findings' | transloco"
                />
              </div>
              <app-form-field inputId="cf-rv-findings">
                <textarea
                  id="cf-rv-findings"
                  rows="4"
                  maxlength="20000"
                  [value]="d.findings"
                  (input)="patch({ findings: $any($event.target).value })"
                ></textarea>
              </app-form-field>
            </div>
            <div>
              <app-form-field
                [label]="'projects.reviews.outcome' | transloco"
                inputId="cf-rv-outcome"
              >
                <select
                  id="cf-rv-outcome"
                  (change)="setOutcome($any($event.target).value)"
                  aria-describedby="cf-rv-outcome-hint"
                  data-testid="review-outcome"
                >
                  @for (o of outcomes; track o) {
                    <option [value]="o" [selected]="d.outcome === o">
                      {{ 'projects.outcomes.' + o | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
              <p id="cf-rv-outcome-hint" class="mt-1 text-meta text-fg-subtle">
                {{ 'projects.reviews.decisionHint' | transloco }}
              </p>
            </div>
            @if (needsDate()) {
              <p class="text-meta text-fail-ink" role="alert" data-testid="review-needs-date">
                {{ 'projects.reviews.needsDate' | transloco }}
              </p>
            }
            @if (editing(); as r) {
              @if (r.decided_by) {
                <p class="text-meta text-fg-muted" data-testid="review-decided">
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
                [loading]="busy()"
                [disabled]="busy() || !d.title.trim() || needsDate()"
                data-testid="review-save"
              >
                {{ 'common.save' | transloco }}
              </app-button>
            </div>
          }
        </form>

        @if (editing(); as r) {
          <section
            class="mt-6 flex flex-col gap-3 border-t border-border pt-4"
            data-testid="review-actions"
          >
            <div>
              <h3 class="font-display text-card font-bold text-fg">
                {{ 'projects.reviews.actionsTitle' | transloco }}
              </h3>
              <p class="mt-0.5 text-meta text-fg-muted">
                {{ 'projects.reviews.actionsHint' | transloco }}
              </p>
            </div>
            <app-entity-tasks
              entityType="project_design_review"
              [entityId]="r.id"
              [canCreate]="canContribute()"
              [entityLabel]="r.title"
            />
            @if (canContribute()) {
              <div>
                <app-button
                  variant="secondary"
                  size="sm"
                  [disabled]="flows.starting() !== null"
                  (click)="registerDeviation(r)"
                  data-testid="review-to-deviation"
                >
                  <app-icon name="alert" [size]="14" />
                  {{ 'projects.reviews.toDeviation' | transloco }}
                </app-button>
              </div>
            }
          </section>
          <section class="mt-6 border-t border-border pt-4">
            <app-supports-requirements
              entityType="project_design_review"
              [entityId]="r.id"
              [canEdit]="canContribute()"
            />
          </section>
          <section class="mt-6 border-t border-border pt-4">
            <h3 class="mb-2 font-display text-card font-bold text-fg">
              {{ 'projects.reviews.attachments' | transloco }}
            </h3>
            <app-attachments
              entityType="project_design_review"
              [entityId]="r.id"
              [canEdit]="canContribute()"
              [compact]="true"
            />
          </section>
        }
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
  protected readonly flows = inject(CreateFlowService);

  readonly projectId = input.required<string>();
  readonly canContribute = input(false);
  /** Delete needs the edit right. */
  readonly canEdit = input(false);
  readonly refresh = input(0);
  readonly focusId = input<string | null>(null);
  readonly changed = output<void>();

  protected readonly kinds = REVIEW_KINDS;
  protected readonly outcomes = REVIEW_OUTCOMES;
  protected readonly documentTypes = ['document'];
  protected readonly badge = outcomeBadge;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly DesignReview[]>([]);
  /** Phases and milestones (a review can belong to either). */
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
    this.assignees
      .options()
      .users.map((o) => ({ id: o.value.slice(5), label: o.label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
  protected readonly addableUsers = computed(() => {
    const taken = new Set(this.draft()?.participant_ids ?? []);
    return this.users().filter((u) => !taken.has(u.id));
  });
  protected readonly pickedDocs = computed(() =>
    (this.draft()?.input_documents ?? []).map((d) => d.ref).filter((r): r is EntityRef => !!r),
  );
  protected readonly panelTitle = computed(() =>
    this.language.translate(
      this.editing() ? 'projects.reviews.editTitle' : 'projects.reviews.newTitle',
    ),
  );
  /** The phase the chosen milestone belongs to (or the phase itself). */
  protected readonly draftPhase = computed(() => {
    const id = this.draft()?.milestone_id;
    const m = id ? this.milestones().find((x) => x.id === id) : null;
    if (!m) {
      return null;
    }
    if (m.kind === 'phase') {
      return m.title;
    }
    return m.phase_id ? (this.milestones().find((x) => x.id === m.phase_id)?.title ?? null) : null;
  });

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

  /** The review's phase: from the server, else derived from its milestone, else the old free text. */
  protected phaseOf(r: DesignReview): string | null {
    if (r.phase) {
      return r.phase.title;
    }
    const m = r.milestone_id ? this.milestones().find((x) => x.id === r.milestone_id) : null;
    if (m) {
      if (m.kind === 'phase') {
        return m.title;
      }
      return m.phase_id
        ? (this.milestones().find((x) => x.id === m.phase_id)?.title ?? null)
        : null;
    }
    return r.stage ?? null;
  }

  protected milestoneOf(r: DesignReview): string | null {
    const title =
      r.milestone_title ??
      (r.milestone_id
        ? (this.milestones().find((m) => m.id === r.milestone_id)?.title ?? null)
        : null);
    return title && title !== r.phase?.title ? title : null;
  }

  protected milestoneOption(m: Milestone): string {
    return m.kind === 'phase'
      ? this.language.translate('projects.reviews.phaseOption', { title: m.title })
      : m.title;
  }

  protected actionsText(total: number, open: number): string {
    return open > 0
      ? this.language.translate('projects.reviews.actionsOpen', { total, open })
      : this.language.translate('projects.reviews.actionsDone', { total });
  }

  protected userName(id: string): string {
    const known =
      this.users().find((u) => u.id === id)?.label ??
      this.editing()?.participants.find((p) => p.id === id)?.name;
    return known ?? id;
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.projectId());
  }

  openNew(): void {
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
    const hadEditing = !!this.editing();
    this.panelOpen.set(false);
    this.editing.set(null);
    this.draft.set(null);
    if (hadEditing) {
      // Actions may have been added or completed in the panel: refresh the counts.
      this.reload();
      this.changed.emit();
    }
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

  protected addDocument(ref: EntityRef): void {
    const d = this.draft();
    if (!d || d.input_documents.some((x) => x.document_id === ref.entity_id)) {
      return;
    }
    this.patch({
      input_documents: [
        ...d.input_documents,
        {
          document_id: ref.entity_id,
          revision: null,
          ref,
          current_revision: null,
          outdated: false,
        },
      ],
    });
  }

  protected removeDocument(id: string): void {
    const d = this.draft();
    if (d) {
      this.patch({ input_documents: d.input_documents.filter((x) => x.document_id !== id) });
    }
  }

  protected registerDeviation(r: DesignReview): void {
    void this.flows.start('project_design_review.to_deviation', 'project_design_review', r.id);
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
        if (existing) {
          this.panelOpen.set(false);
          this.editing.set(null);
          this.draft.set(null);
        } else {
          // Keep the panel open on the new review so actions can be added right away.
          this.editing.set(saved);
          this.draft.set(draftFromReview(saved));
        }
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
        this.panelOpen.set(false);
        this.editing.set(null);
        this.draft.set(null);
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
        this.milestones.set(milestones);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
