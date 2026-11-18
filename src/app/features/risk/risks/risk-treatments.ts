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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { Term } from '../../../shared/guidance/term';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RiskApi } from '../data/risk-api';
import {
  canonicalControlRef,
  controlsOf,
  frameworksForCategory,
  fromDateInput,
  toDateInput,
  treatmentStatusValue,
} from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  EFFECTIVENESS_RESULTS,
  EffectivenessResult,
  Risk,
  TREATMENT_STATUSES,
  Treatment,
  TreatmentDraft,
  TreatmentPlan,
  TreatmentStatus,
} from '../data/risk.models';
import { ControlList } from '../shared/control-list';
import { PersonSelect } from '../shared/person-select';
import { RiskField } from '../shared/risk-field';
import { RiskPermissions } from '../shared/risk-permissions';

interface TreatmentForm {
  readonly title: string;
  readonly description: string;
  readonly control_refs: readonly string[];
  readonly owner_user_id: string;
  readonly due_at: string;
}

const EMPTY_FORM: TreatmentForm = {
  title: '',
  description: '',
  control_refs: [],
  owner_user_id: '',
  due_at: '',
};

/** Effectiveness results on the shared compliance vocabulary (badge colour). */
const EFFECT_VALUE: Readonly<Record<EffectivenessResult, string>> = {
  effective: 'compliant',
  partially_effective: 'partial',
  not_effective: 'non_compliant',
};

/** Today as `YYYY-MM-DD` (local date, for the date input default). */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The treatment plan of a risk: each treatment is an action with an owner and a due
 * date, backed by a platform task (so it shows in the owner's My Work), and the
 * controls it puts in place (picked from the catalogue, shown with their SoA
 * status). Marking one done asks how its effectiveness was checked (ISO 27001 6.1.3,
 * 10.2; ISO 45001 6.1.4) and offers to re-rate the residual risk. "Draft treatment"
 * proposes actions the user can adopt one by one. `focusId` (`?treatment=<id>`)
 * opens that treatment.
 */
@Component({
  selector: 'app-risk-treatments',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    Term,
    LocalDayPipe,
    ClausePicker,
    Alert,
    Button,
    ConfirmDialog,
    Icon,
    SlideOver,
    StatusBadge,
    ControlList,
    PersonSelect,
    RiskField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-display text-section font-bold text-fg">
        <app-term scope="risk" key="risk-treatment">{{
          'risk.treatments.title' | transloco
        }}</app-term>
      </h2>
      @if (canEdit()) {
        <div class="flex flex-wrap items-center gap-2">
          <app-ai-assist-button
            assist="risk.draft_treatment"
            labelKey="risk.ai.draftTreatment"
            [input]="{ risk_id: risk().id }"
            entityType="risk"
            [entityId]="risk().id"
            (result)="onPlan($event)"
          />
          <app-button size="sm" (click)="openNew()">
            <app-icon name="plus" [size]="14" />
            {{ 'risk.treatments.add' | transloco }}
          </app-button>
        </div>
      }
    </div>

    @if (plan(); as p) {
      <section
        class="mb-4 rounded-card border border-accent/30 bg-accent-soft p-3 text-ui"
        aria-live="polite"
        [attr.aria-label]="'risk.ai.planTitle' | transloco"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class="font-semibold text-fg">{{ 'risk.ai.planTitle' | transloco }}</h3>
          <button
            type="button"
            class="text-meta font-semibold text-fg-muted hover:text-fg"
            (click)="plan.set(null)"
          >
            {{ 'risk.common.dismiss' | transloco }}
          </button>
        </div>
        @if (p.strategy) {
          <p class="text-fg">
            {{ 'risk.fields.strategy' | transloco }}:
            {{ 'risk.strategies.' + p.strategy | transloco }}
          </p>
        }
        @if (p.rationale) {
          <p class="mt-1 text-fg-muted">{{ p.rationale }}</p>
        }
        <ul class="mt-2 flex flex-col gap-2">
          @for (d of p.treatments ?? []; track $index) {
            <li
              class="flex flex-col gap-2 rounded-tile bg-surface p-2.5 sm:flex-row sm:items-start"
            >
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-fg">{{ d.title }}</p>
                @if (d.description) {
                  <p class="text-fg-muted">{{ d.description }}</p>
                }
                @if (d.control_refs?.length) {
                  <app-risk-control-list
                    class="mt-1"
                    [compact]="true"
                    [controls]="draftControls(d)"
                  />
                }
              </div>
              <app-button size="sm" variant="secondary" (click)="adoptDraft(d)">
                {{ 'risk.ai.adopt' | transloco }}
              </app-button>
            </li>
          }
        </ul>
        @if (p.residual_likelihood && p.residual_consequence) {
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span class="text-fg-muted">
              {{
                'risk.ai.expectedResidual'
                  | transloco
                    : { likelihood: p.residual_likelihood, consequence: p.residual_consequence }
              }}
            </span>
            <app-button size="sm" variant="ghost" (click)="applyPlan(p)">
              {{ 'risk.ai.applyResidual' | transloco }}
            </app-button>
          </div>
        }
      </section>
    }

    @if (loading()) {
      <p class="py-4 text-ui text-fg-muted">{{ 'risk.common.loading' | transloco }}</p>
    } @else {
      <ul class="divide-y divide-border rounded-card border border-border">
        @for (t of items(); track t.id) {
          <li
            class="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start"
            [class.bg-accent-soft]="t.id === focusId()"
            [attr.data-testid]="'treatment-' + t.id"
          >
            <div class="min-w-0 flex-1">
              <button
                type="button"
                class="text-left text-body font-semibold text-fg hover:underline"
                [class.line-through]="t.status === 'cancelled'"
                (click)="openEdit(t)"
              >
                {{ t.title }}
              </button>
              <div
                class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-fg-subtle"
              >
                <span>{{ t.owner?.name ?? ('risk.common.unassigned' | transloco) }}</span>
                @if (t.due_at) {
                  <span [class.text-warn-ink]="t.overdue" [class.font-semibold]="t.overdue">
                    {{ 'risk.treatments.due' | transloco: { date: (t.due_at | localDay) } }}
                    @if (t.overdue) {
                      · {{ 'common.status.overdue' | transloco }}
                    }
                  </span>
                }
                @if (t.task_id) {
                  <a [routerLink]="['/tasks', t.task_id]" class="text-accent hover:underline">
                    {{ 'risk.treatments.task' | transloco }}
                    @if (t.task_status) {
                      ({{ 'risk.treatments.taskStatus.' + t.task_status | transloco }})
                    }
                  </a>
                }
              </div>
              @if (t.control_refs.length) {
                <app-risk-control-list class="mt-1.5" [compact]="true" [controls]="controls(t)" />
              }
              @if (t.effectiveness; as eff) {
                <p class="mt-1.5 flex flex-wrap items-center gap-2 text-meta text-fg-muted">
                  <app-status-badge
                    meaning="compliance"
                    [value]="effectValue(eff.result)"
                    [labelKey]="'risk.effectiveness.results.' + eff.result"
                  />
                  <span>
                    {{
                      'risk.effectiveness.checkedBy'
                        | transloco
                          : {
                              name: eff.checked_by?.name ?? ('risk.common.unknown' | transloco),
                              date: eff.checked_at ? (eff.checked_at | localDay) : '',
                            }
                    }}
                  </span>
                </p>
              } @else if (needsCheck(t)) {
                <p class="mt-1.5 flex flex-wrap items-center gap-2 text-meta text-warn-ink">
                  <app-icon name="alert" [size]="13" />
                  {{ 'risk.effectiveness.needed' | transloco }}
                  @if (canEdit()) {
                    <button
                      type="button"
                      class="font-semibold text-accent hover:underline"
                      (click)="openEffect(t)"
                      [attr.data-testid]="'treatment-check-' + t.id"
                    >
                      {{ 'risk.effectiveness.check' | transloco }}
                    </button>
                  }
                </p>
              }
            </div>
            <div class="flex items-center gap-2">
              @if (canEdit()) {
                <label class="sr-only" [for]="'treatment-status-' + t.id">
                  {{ 'risk.fields.status' | transloco }}
                </label>
                <select
                  [id]="'treatment-status-' + t.id"
                  class="h-8 rounded-tile border border-border bg-bg px-2 text-meta text-fg"
                  (change)="setStatus(t, $any($event.target).value)"
                >
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="s === t.status">
                      {{ 'risk.treatments.status.' + s | transloco }}
                    </option>
                  }
                </select>
              } @else {
                <app-status-badge
                  meaning="lifecycle"
                  [value]="statusValue(t.status)"
                  [labelKey]="'risk.treatments.status.' + t.status"
                />
              }
            </div>
          </li>
        } @empty {
          <li class="px-3 py-6 text-center text-ui text-fg-muted">
            {{ 'risk.treatments.empty' | transloco }}
          </li>
        }
      </ul>
    }

    <app-slide-over
      [open]="panelOpen()"
      [title]="(editing() ? 'risk.treatments.editTitle' : 'risk.treatments.newTitle') | transloco"
      [subtitle]="risk().code + ' · ' + risk().title"
      [closeLabel]="'risk.common.close' | transloco"
      (closed)="closePanel()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
        <app-risk-field
          inputId="treatment-title"
          labelKey="risk.fields.title"
          [required]="true"
          [error]="titleError()"
        >
          <input
            id="treatment-title"
            required
            maxlength="255"
            [disabled]="!canEdit()"
            [value]="form().title"
            [attr.aria-invalid]="titleError() ? true : null"
            (input)="set('title', $any($event.target).value)"
          />
        </app-risk-field>
        <app-risk-field inputId="treatment-description" labelKey="risk.fields.description">
          <textarea
            id="treatment-description"
            rows="3"
            [disabled]="!canEdit()"
            [value]="form().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-risk-field>
        <app-risk-field
          inputId="treatment-owner"
          labelKey="risk.fields.owner"
          helpPage="treatment"
          helpField="owner"
        >
          <app-person-select
            inputId="treatment-owner"
            [disabled]="!canEdit()"
            [value]="form().owner_user_id"
            [currentName]="editing()?.owner?.name ?? null"
            (valueChange)="set('owner_user_id', $event)"
          />
        </app-risk-field>
        <app-risk-field inputId="treatment-due" labelKey="risk.fields.dueAt">
          <input
            id="treatment-due"
            type="date"
            [disabled]="!canEdit()"
            [value]="form().due_at"
            (input)="set('due_at', $any($event.target).value)"
          />
        </app-risk-field>
        <app-risk-field
          inputId="treatment-controls"
          labelKey="risk.fields.controlRefs"
          [plain]="true"
          helpPage="treatment"
          helpField="controls"
        >
          <app-clause-picker
            inputId="treatment-controls"
            placeholderKey="risk.form.controlPickerPlaceholder"
            [frameworks]="frameworks()"
            [disabled]="!canEdit()"
            [ngModel]="form().control_refs"
            (ngModelChange)="set('control_refs', $event)"
            [ngModelOptions]="{ standalone: true }"
          />
          <span hint>{{ 'risk.form.controlsHint' | transloco }}</span>
        </app-risk-field>
        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }
        @if (canEdit()) {
          <div class="flex flex-wrap justify-between gap-2">
            @if (editing()) {
              <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                <app-icon name="trash" [size]="14" />
                {{ 'risk.common.delete' | transloco }}
              </app-button>
            } @else {
              <span></span>
            }
            <app-button type="submit" [loading]="saving()" [disabled]="saving()">
              {{ 'risk.common.save' | transloco }}
            </app-button>
          </div>
        }
      </form>
    </app-slide-over>

    <app-confirm-dialog
      [open]="confirmDelete()"
      [title]="'risk.treatments.deleteTitle' | transloco"
      [message]="'risk.treatments.deleteMessage' | transloco"
      [confirmLabel]="'risk.common.delete' | transloco"
      [cancelLabel]="'risk.common.cancel' | transloco"
      (confirmed)="remove()"
      (cancelled)="confirmDelete.set(false)"
    />

    <app-confirm-dialog
      [open]="effectFor() !== null"
      [title]="'risk.effectiveness.title' | transloco"
      [message]="'risk.effectiveness.message' | transloco: { title: effectFor()?.title ?? '' }"
      confirmVariant="primary"
      [confirmLabel]="'risk.effectiveness.save' | transloco"
      [cancelLabel]="'risk.effectiveness.later' | transloco"
      [busy]="saving()"
      [confirmDisabled]="!effectValid()"
      (confirmed)="saveEffect()"
      (cancelled)="effectFor.set(null)"
    >
      <div class="mt-3 flex flex-col gap-3">
        <fieldset>
          <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
            {{ 'risk.effectiveness.result' | transloco }}
          </legend>
          <div class="flex flex-col gap-1.5">
            @for (r of results; track r) {
              <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
                <input
                  type="radio"
                  name="effect-result"
                  [value]="r"
                  [checked]="effectResult() === r"
                  (change)="effectResult.set(r)"
                />
                {{ 'risk.effectiveness.results.' + r | transloco }}
              </label>
            }
          </div>
        </fieldset>
        <app-risk-field
          inputId="effect-note"
          [labelKey]="
            noteRequired() ? 'risk.effectiveness.noteRequired' : 'risk.effectiveness.note'
          "
          [required]="noteRequired()"
        >
          <textarea
            id="effect-note"
            rows="3"
            [value]="effectNote()"
            (input)="effectNote.set($any($event.target).value)"
          ></textarea>
          <span hint>{{ 'risk.effectiveness.noteHint' | transloco }}</span>
        </app-risk-field>
        <app-risk-field inputId="effect-date" labelKey="risk.effectiveness.checkedAt">
          <input
            id="effect-date"
            type="date"
            [max]="maxDate"
            [value]="effectDate()"
            (input)="effectDate.set($any($event.target).value)"
          />
        </app-risk-field>
        @if (effectError(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }
      </div>
    </app-confirm-dialog>

    @if (rerateOffer()) {
      <div
        class="mt-3 flex flex-wrap items-center gap-2 rounded-tile border border-info/30 bg-info-soft px-3 py-2 text-ui text-info-ink"
        role="status"
        data-testid="rerate-offer"
      >
        <span class="min-w-0 flex-1">{{ 'risk.effectiveness.rerateOffer' | transloco }}</span>
        <app-button size="sm" variant="secondary" (click)="rerate.emit(); rerateOffer.set(false)">
          {{ 'risk.effectiveness.rerate' | transloco }}
        </app-button>
        <button
          type="button"
          class="font-semibold hover:underline"
          (click)="rerateOffer.set(false)"
        >
          {{ 'risk.common.dismiss' | transloco }}
        </button>
      </div>
    }
  `,
})
export class RiskTreatments {
  private readonly api = inject(RiskApi);
  private readonly toasts = inject(NotificationService);
  private readonly perms = inject(RiskPermissions);

  readonly risk = input.required<Risk>();
  readonly canEdit = input(false);
  readonly focusId = input<string | null>(null);
  /** Treatments changed (the risk's counts may differ). */
  readonly changed = output<void>();
  /** The user adopted the drafted plan's strategy and residual rating. */
  readonly planApplied = output<TreatmentPlan>();
  /** The user wants to re-rate the residual risk after an effectiveness check. */
  readonly rerate = output<void>();

  protected readonly statuses = TREATMENT_STATUSES;
  protected readonly results = EFFECTIVENESS_RESULTS;
  protected readonly statusValue = treatmentStatusValue;
  protected readonly maxDate = today();
  protected readonly items = signal<readonly Treatment[]>([]);
  protected readonly loading = signal(true);
  protected readonly panelOpen = signal(false);
  protected readonly editing = signal<Treatment | null>(null);
  protected readonly form = signal<TreatmentForm>(EMPTY_FORM);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly plan = signal<TreatmentPlan | null>(null);
  protected readonly effectFor = signal<Treatment | null>(null);
  protected readonly effectResult = signal<EffectivenessResult>('effective');
  protected readonly effectNote = signal('');
  protected readonly effectDate = signal(today());
  protected readonly effectError = signal<string | null>(null);
  protected readonly rerateOffer = signal(false);
  private focused: string | null = null;
  private sub: Subscription | null = null;

  private readonly riskId = computed(() => this.risk().id);
  protected readonly frameworks = computed(() => {
    const risk = this.risk();
    const list = risk.frameworks?.length ? risk.frameworks : frameworksForCategory(risk.category);
    return list.length ? list : null;
  });
  protected readonly titleError = computed(() =>
    this.submitted() && !this.form().title.trim() ? 'risk.errors.title_required' : null,
  );
  protected readonly noteRequired = computed(() => this.effectResult() !== 'effective');
  protected readonly effectValid = computed(
    () => !this.noteRequired() || !!this.effectNote().trim(),
  );

  constructor() {
    effect(() => {
      const orgId = this.perms.orgId();
      const riskId = this.riskId();
      untracked(() => this.load(orgId, riskId));
    });
    effect(() => {
      const focus = this.focusId();
      const items = this.items();
      untracked(() => {
        if (focus && focus !== this.focused) {
          const match = items.find((t) => t.id === focus);
          if (match) {
            this.focused = focus;
            this.openEdit(match);
          }
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, riskId: string): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = this.api.listTreatments(orgId, riskId).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  private reload(): void {
    this.load(this.perms.orgId(), this.riskId());
    this.changed.emit();
  }

  protected controls(t: Treatment) {
    return controlsOf(t);
  }

  protected draftControls(d: TreatmentDraft) {
    return controlsOf({ control_refs: d.control_refs ?? [] });
  }

  protected effectValue(result: EffectivenessResult): string {
    return EFFECT_VALUE[result] ?? 'not_assessed';
  }

  /** Done but not checked (older APIs: done without an effectiveness record). */
  protected needsCheck(t: Treatment): boolean {
    return t.needs_effectiveness_check ?? (t.status === 'done' && !t.effectiveness);
  }

  protected set<K extends keyof TreatmentForm>(key: K, value: TreatmentForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected openNew(prefill: Partial<TreatmentForm> = {}): void {
    this.editing.set(null);
    this.form.set({ ...EMPTY_FORM, owner_user_id: this.risk().owner?.id ?? '', ...prefill });
    this.errorKey.set(null);
    this.submitted.set(false);
    this.panelOpen.set(true);
  }

  protected openEdit(t: Treatment): void {
    this.editing.set(t);
    this.form.set({
      title: t.title,
      description: t.description ?? '',
      control_refs: t.control_refs.map(canonicalControlRef),
      owner_user_id: t.owner?.id ?? '',
      due_at: toDateInput(t.due_at),
    });
    this.errorKey.set(null);
    this.submitted.set(false);
    this.panelOpen.set(true);
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
    this.editing.set(null);
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    const f = this.form();
    this.submitted.set(true);
    if (!orgId || !f.title.trim()) {
      return;
    }
    const body = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      control_refs: [...f.control_refs],
      owner_user_id: f.owner_user_id || null,
      due_at: fromDateInput(f.due_at),
    };
    const editing = this.editing();
    this.saving.set(true);
    const request = editing
      ? this.api.updateTreatment(orgId, editing.id, body)
      : this.api.createTreatment(orgId, this.riskId(), body);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closePanel();
        this.toasts.success(
          editing ? 'risk.notices.treatmentSaved' : 'risk.notices.treatmentAdded',
        );
        this.reload();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }

  protected setStatus(t: Treatment, status: TreatmentStatus): void {
    const orgId = this.perms.orgId();
    if (!orgId || status === t.status) {
      return;
    }
    this.api.updateTreatment(orgId, t.id, { status }).subscribe({
      next: (updated) => {
        this.toasts.success('risk.notices.treatmentSaved');
        this.reload();
        if (status === 'done' && !updated?.effectiveness) {
          // Done is not the end: how do we know it worked?
          this.openEffect(updated ?? t);
        }
      },
      error: (e: unknown) => {
        this.toasts.error(riskErrorKey(e));
        this.reload();
      },
    });
  }

  protected openEffect(t: Treatment): void {
    this.effectResult.set('effective');
    this.effectNote.set('');
    this.effectDate.set(today());
    this.effectError.set(null);
    this.effectFor.set(t);
  }

  protected saveEffect(): void {
    const orgId = this.perms.orgId();
    const t = this.effectFor();
    if (!orgId || !t || !this.effectValid()) {
      return;
    }
    this.saving.set(true);
    this.effectError.set(null);
    this.api
      .checkEffectiveness(orgId, t.id, {
        result: this.effectResult(),
        note: this.effectNote().trim() || null,
        checked_at: fromDateInput(this.effectDate()),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.effectFor.set(null);
          this.toasts.success('risk.notices.effectivenessSaved');
          this.rerateOffer.set(true);
          this.reload();
        },
        error: (e: unknown) => {
          this.saving.set(false);
          this.effectError.set(riskErrorKey(e));
        },
      });
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    const editing = this.editing();
    this.confirmDelete.set(false);
    if (!orgId || !editing) {
      return;
    }
    this.api.deleteTreatment(orgId, editing.id).subscribe({
      next: () => {
        this.closePanel();
        this.toasts.success('risk.notices.treatmentDeleted');
        this.reload();
      },
      error: (e: unknown) => this.toasts.error(riskErrorKey(e)),
    });
  }

  protected onPlan(result: unknown): void {
    if (result && typeof result === 'object') {
      this.plan.set(result as TreatmentPlan);
    }
  }

  protected adoptDraft(d: TreatmentDraft): void {
    this.openNew({
      title: d.title ?? '',
      description: d.description ?? '',
      control_refs: (d.control_refs ?? []).map(canonicalControlRef),
    });
  }

  protected applyPlan(p: TreatmentPlan): void {
    this.planApplied.emit(p);
  }
}
