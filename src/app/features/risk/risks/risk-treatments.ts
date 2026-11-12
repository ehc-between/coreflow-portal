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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { RiskApi } from '../data/risk-api';
import {
  fromDateInput,
  parseControlRefs,
  toDateInput,
  treatmentStatusTone,
} from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  Risk,
  TREATMENT_STATUSES,
  Treatment,
  TreatmentDraft,
  TreatmentPlan,
  TreatmentStatus,
} from '../data/risk.models';
import { PersonSelect } from '../shared/person-select';
import { RiskPermissions } from '../shared/risk-permissions';

interface TreatmentForm {
  readonly title: string;
  readonly description: string;
  readonly control_refs: string;
  readonly owner_user_id: string;
  readonly due_at: string;
}

const EMPTY_FORM: TreatmentForm = {
  title: '',
  description: '',
  control_refs: '',
  owner_user_id: '',
  due_at: '',
};

/**
 * The treatment plan of a risk: each treatment is an action with an owner and a due
 * date, backed by a platform task (so it shows in the owner's My Work). Add, edit,
 * move through planned / in progress / done, cancel or delete; "Draft treatment"
 * proposes actions (and a residual rating) the user can adopt one by one.
 * `focusId` (from `?treatment=<id>`) opens that treatment.
 */
@Component({
  selector: 'app-risk-treatments',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    FieldHelp,
    LocalDayPipe,
    Alert,
    Badge,
    Button,
    ConfirmDialog,
    FormField,
    Icon,
    SlideOver,
    PersonSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-display text-[16px] font-bold text-fg">
        {{ 'risk.treatments.title' | transloco }}
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
        class="mb-4 rounded-card border border-accent/30 bg-accent-soft p-3 text-[13px]"
        aria-live="polite"
        [attr.aria-label]="'risk.ai.planTitle' | transloco"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class="font-semibold text-fg">{{ 'risk.ai.planTitle' | transloco }}</h3>
          <button
            type="button"
            class="text-[12.5px] font-semibold text-fg-muted hover:text-fg"
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
                  <p class="mt-0.5 font-mono text-[11.5px] text-fg-subtle">
                    {{ d.control_refs?.join(', ') }}
                  </p>
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
      <p class="py-4 text-[13px] text-fg-muted">{{ 'risk.common.loading' | transloco }}</p>
    } @else {
      <ul class="divide-y divide-border rounded-card border border-border">
        @for (t of items(); track t.id) {
          <li
            class="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center"
            [class.bg-accent-soft]="t.id === focusId()"
            [class.bg-fail-soft]="t.overdue && t.id !== focusId()"
            [attr.data-testid]="'treatment-' + t.id"
          >
            <div class="min-w-0 flex-1">
              <button
                type="button"
                class="text-left text-[13.5px] font-semibold text-fg hover:underline"
                [class.line-through]="t.status === 'cancelled'"
                (click)="openEdit(t)"
              >
                {{ t.title }}
              </button>
              <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle">
                <span>{{ t.owner?.name ?? ('risk.common.unassigned' | transloco) }}</span>
                @if (t.due_at) {
                  <span [class.text-fail]="t.overdue" [class.font-semibold]="t.overdue">
                    {{ 'risk.treatments.due' | transloco: { date: (t.due_at | localDay) } }}
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
                @if (t.control_refs.length) {
                  <span class="font-mono">{{ t.control_refs.join(', ') }}</span>
                }
              </div>
            </div>
            <div class="flex items-center gap-2">
              @if (canEdit()) {
                <label class="sr-only" [for]="'treatment-status-' + t.id">
                  {{ 'risk.fields.status' | transloco }}
                </label>
                <select
                  [id]="'treatment-status-' + t.id"
                  class="h-8 rounded-tile border border-border bg-bg px-2 text-[12.5px] text-fg"
                  (change)="setStatus(t, $any($event.target).value)"
                >
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="s === t.status">
                      {{ 'risk.treatments.status.' + s | transloco }}
                    </option>
                  }
                </select>
              } @else {
                <app-badge [tone]="tone(t.status)">
                  {{ 'risk.treatments.status.' + t.status | transloco }}
                </app-badge>
              }
            </div>
          </li>
        } @empty {
          <li class="px-3 py-6 text-center text-[13px] text-fg-muted">
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
        <app-form-field [label]="'risk.fields.title' | transloco" inputId="treatment-title">
          <input
            id="treatment-title"
            required
            maxlength="255"
            [disabled]="!canEdit()"
            [value]="form().title"
            (input)="set('title', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'risk.fields.description' | transloco"
          inputId="treatment-description"
        >
          <textarea
            id="treatment-description"
            rows="3"
            [disabled]="!canEdit()"
            [value]="form().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field [label]="'risk.fields.owner' | transloco" inputId="treatment-owner">
          <app-person-select
            inputId="treatment-owner"
            [disabled]="!canEdit()"
            [value]="form().owner_user_id"
            [currentName]="editing()?.owner?.name ?? null"
            (valueChange)="set('owner_user_id', $event)"
          />
          <app-field-help scope="risk" page="treatment" field="owner" />
        </app-form-field>
        <app-form-field [label]="'risk.fields.dueAt' | transloco" inputId="treatment-due">
          <input
            id="treatment-due"
            type="date"
            [disabled]="!canEdit()"
            [value]="form().due_at"
            (input)="set('due_at', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'risk.fields.controlRefs' | transloco"
          inputId="treatment-controls"
        >
          <input
            id="treatment-controls"
            [disabled]="!canEdit()"
            [value]="form().control_refs"
            [placeholder]="'risk.form.controlRefsPlaceholder' | transloco"
            (input)="set('control_refs', $any($event.target).value)"
          />
          <app-field-help scope="risk" page="treatment" field="controls" />
        </app-form-field>
        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }
        @if (canEdit()) {
          <div class="flex flex-wrap justify-between gap-2">
            @if (editing()) {
              <app-button variant="danger" size="sm" (click)="confirmDelete.set(true)">
                <app-icon name="trash" [size]="14" />
                {{ 'risk.common.delete' | transloco }}
              </app-button>
            } @else {
              <span></span>
            }
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="saving() || !form().title.trim()"
            >
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

  protected readonly statuses = TREATMENT_STATUSES;
  protected readonly items = signal<readonly Treatment[]>([]);
  protected readonly loading = signal(true);
  protected readonly panelOpen = signal(false);
  protected readonly editing = signal<Treatment | null>(null);
  protected readonly form = signal<TreatmentForm>(EMPTY_FORM);
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly plan = signal<TreatmentPlan | null>(null);
  private focused: string | null = null;
  private sub: Subscription | null = null;

  private readonly riskId = computed(() => this.risk().id);

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

  protected tone(status: TreatmentStatus) {
    return treatmentStatusTone(status);
  }

  protected set<K extends keyof TreatmentForm>(key: K, value: TreatmentForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected openNew(prefill: Partial<TreatmentForm> = {}): void {
    this.editing.set(null);
    this.form.set({ ...EMPTY_FORM, owner_user_id: this.risk().owner?.id ?? '', ...prefill });
    this.errorKey.set(null);
    this.panelOpen.set(true);
  }

  protected openEdit(t: Treatment): void {
    this.editing.set(t);
    this.form.set({
      title: t.title,
      description: t.description ?? '',
      control_refs: t.control_refs.join(', '),
      owner_user_id: t.owner?.id ?? '',
      due_at: toDateInput(t.due_at),
    });
    this.errorKey.set(null);
    this.panelOpen.set(true);
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
    this.editing.set(null);
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    const f = this.form();
    if (!orgId || !f.title.trim()) {
      return;
    }
    const body = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      control_refs: parseControlRefs(f.control_refs),
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
      next: () => {
        this.toasts.success('risk.notices.treatmentSaved');
        this.reload();
      },
      error: (e: unknown) => {
        this.toasts.error(riskErrorKey(e));
        this.reload();
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
      control_refs: (d.control_refs ?? []).join(', '),
    });
  }

  protected applyPlan(p: TreatmentPlan): void {
    this.planApplied.emit(p);
  }
}
