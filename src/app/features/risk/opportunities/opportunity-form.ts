import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { RiskApi } from '../data/risk-api';
import { fromDateInput, toDateInput } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  Opportunity,
  OpportunityCreate,
  Register,
  SOURCE_TYPES,
  SourceType,
} from '../data/risk.models';
import { PersonSelect } from '../shared/person-select';
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';

export interface OpportunityFormValue {
  readonly register_id: string;
  readonly title: string;
  readonly description: string;
  readonly source_type: SourceType | '';
  readonly source_ref: string;
  readonly benefit: string;
  readonly feasibility: string;
  readonly action_plan: string;
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly due_at: string;
}

const EMPTY: OpportunityFormValue = {
  register_id: '',
  title: '',
  description: '',
  source_type: '',
  source_ref: '',
  benefit: '',
  feasibility: '',
  action_plan: '',
  owner_user_id: '',
  department_id: '',
  due_at: '',
};

export function opportunityToForm(o: Opportunity): OpportunityFormValue {
  return {
    register_id: o.register?.id ?? '',
    title: o.title,
    description: o.description ?? '',
    source_type: o.source_type ?? '',
    source_ref: o.source_ref ?? '',
    benefit: o.benefit !== null ? String(o.benefit) : '',
    feasibility: o.feasibility !== null ? String(o.feasibility) : '',
    action_plan: o.action_plan ?? '',
    owner_user_id: o.owner?.id ?? '',
    department_id: o.department?.id ?? '',
    due_at: toDateInput(o.due_at),
  };
}

export function toOpportunityBody(v: OpportunityFormValue): OpportunityCreate {
  const text = (s: string) => s.trim() || null;
  return {
    register_id: v.register_id || null,
    title: v.title.trim(),
    description: text(v.description),
    source_type: v.source_type || null,
    source_ref: text(v.source_ref),
    benefit: v.benefit ? Number(v.benefit) : null,
    feasibility: v.feasibility ? Number(v.feasibility) : null,
    action_plan: text(v.action_plan),
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    due_at: fromDateInput(v.due_at),
  };
}

const SCALE = [1, 2, 3, 4, 5] as const;

/** Create or edit an opportunity: what it is, benefit x feasibility, owner and plan. */
@Component({
  selector: 'app-opportunity-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    PersonSelect,
    RiskPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[820px] px-4 pt-6 pb-12 sm:px-8">
      <a
        [routerLink]="id() ? ['/risk/opportunities', id()] : '/risk/opportunities'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'risk.common.backToOpportunities' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'risk.opportunities.editTitle' : 'risk.opportunities.newTitle') | transloco }}
      </h1>
      <app-risk-page-guide class="mb-5" page="opportunityForm" />

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted">
          {{ 'risk.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <p class="py-10 text-center text-[14px] text-fail" role="alert">
          {{ 'risk.common.loadFailed' | transloco }}
        </p>
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-card>
            <div class="grid grid-cols-1 gap-4">
              <app-form-field [label]="'risk.fields.title' | transloco" inputId="opp-title">
                <input
                  id="opp-title"
                  required
                  maxlength="255"
                  [value]="form().title"
                  (input)="set('title', $any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.description' | transloco"
                inputId="opp-description"
              >
                <textarea
                  id="opp-description"
                  rows="3"
                  [value]="form().description"
                  (input)="set('description', $any($event.target).value)"
                ></textarea>
              </app-form-field>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                @if (registers().length) {
                  <app-form-field
                    [label]="'risk.fields.register' | transloco"
                    inputId="opp-register"
                  >
                    <select
                      id="opp-register"
                      (change)="set('register_id', $any($event.target).value)"
                    >
                      <option value="" [selected]="!form().register_id">
                        {{ 'risk.common.notSet' | transloco }}
                      </option>
                      @for (r of registers(); track r.id) {
                        <option [value]="r.id" [selected]="r.id === form().register_id">
                          {{ r.name }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                }
                <app-form-field
                  [label]="'risk.fields.sourceType' | transloco"
                  inputId="opp-source-type"
                >
                  <select
                    id="opp-source-type"
                    (change)="set('source_type', $any($event.target).value)"
                  >
                    <option value="" [selected]="!form().source_type">
                      {{ 'risk.common.notSet' | transloco }}
                    </option>
                    @for (s of sourceTypes; track s) {
                      <option [value]="s" [selected]="s === form().source_type">
                        {{ 'risk.sourceTypes.' + s | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-form-field
                  [label]="'risk.fields.sourceRef' | transloco"
                  inputId="opp-source-ref"
                >
                  <input
                    id="opp-source-ref"
                    maxlength="255"
                    [value]="form().source_ref"
                    (input)="set('source_ref', $any($event.target).value)"
                  />
                </app-form-field>
              </div>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'risk.opportunities.evaluation' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <app-form-field [label]="'risk.fields.benefit' | transloco" inputId="opp-benefit">
                <select id="opp-benefit" (change)="set('benefit', $any($event.target).value)">
                  <option value="" [selected]="!form().benefit">
                    {{ 'risk.rating.choose' | transloco }}
                  </option>
                  @for (n of scale; track n) {
                    <option [value]="n" [selected]="'' + n === form().benefit">
                      {{ n }} · {{ 'risk.opportunities.scale.' + n | transloco }}
                    </option>
                  }
                </select>
                <app-field-help scope="risk" page="opportunityForm" field="benefit" />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.feasibility' | transloco"
                inputId="opp-feasibility"
              >
                <select
                  id="opp-feasibility"
                  (change)="set('feasibility', $any($event.target).value)"
                >
                  <option value="" [selected]="!form().feasibility">
                    {{ 'risk.rating.choose' | transloco }}
                  </option>
                  @for (n of scale; track n) {
                    <option [value]="n" [selected]="'' + n === form().feasibility">
                      {{ n }} · {{ 'risk.opportunities.scale.' + n | transloco }}
                    </option>
                  }
                </select>
                <app-field-help scope="risk" page="opportunityForm" field="feasibility" />
              </app-form-field>
              <div class="flex flex-col gap-1.5" aria-live="polite">
                <span class="text-[13px] font-semibold text-fg-muted">{{
                  'risk.fields.score' | transloco
                }}</span>
                <span class="font-display text-[22px] font-bold text-fg">{{ score() ?? '—' }}</span>
              </div>
            </div>
            <div class="mt-4">
              <app-form-field [label]="'risk.fields.actionPlan' | transloco" inputId="opp-plan">
                <textarea
                  id="opp-plan"
                  rows="3"
                  [value]="form().action_plan"
                  (input)="set('action_plan', $any($event.target).value)"
                ></textarea>
                <app-field-help scope="risk" page="opportunityForm" field="actionPlan" />
              </app-form-field>
            </div>
          </app-card>

          <app-card>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <app-form-field [label]="'risk.fields.owner' | transloco" inputId="opp-owner">
                <app-person-select
                  inputId="opp-owner"
                  [value]="form().owner_user_id"
                  [currentName]="original()?.owner?.name ?? null"
                  (valueChange)="set('owner_user_id', $event)"
                />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.department' | transloco"
                inputId="opp-department"
              >
                <app-person-select
                  kind="department"
                  inputId="opp-department"
                  [value]="form().department_id"
                  [currentName]="original()?.department?.name ?? null"
                  (valueChange)="set('department_id', $event)"
                />
              </app-form-field>
              <app-form-field [label]="'risk.fields.dueAt' | transloco" inputId="opp-due">
                <input
                  id="opp-due"
                  type="date"
                  [value]="form().due_at"
                  (input)="set('due_at', $any($event.target).value)"
                />
              </app-form-field>
            </div>
          </app-card>

          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }
          <div class="flex flex-wrap justify-end gap-2">
            <app-button variant="ghost" (click)="cancel()">{{
              'risk.common.cancel' | transloco
            }}</app-button>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="saving() || !form().title.trim()"
            >
              {{ (id() ? 'risk.common.save' : 'risk.opportunities.create') | transloco }}
            </app-button>
          </div>
        </form>
      }
    </div>
  `,
})
export class OpportunityFormPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly perms = inject(RiskPermissions);

  readonly id = input<string | undefined>(undefined);

  protected readonly sourceTypes = SOURCE_TYPES;
  protected readonly scale = SCALE;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly registers = signal<readonly Register[]>([]);
  protected readonly original = signal<Opportunity | null>(null);
  protected readonly form = signal<OpportunityFormValue>(EMPTY);
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  private sub: Subscription | null = null;

  protected readonly score = computed(() => {
    const { benefit, feasibility } = this.form();
    return benefit && feasibility ? Number(benefit) * Number(feasibility) : null;
  });

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'opportunity',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.title ?? this.language.translate('risk.opportunities.newTitle'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.sub = forkJoin({
          registers: this.api.listRegisters(orgId),
          opportunity: id ? this.api.getOpportunity(orgId, id) : of(null),
        }).subscribe({
          next: ({ registers, opportunity }) => {
            this.registers.set(registers.items.filter((r) => r.status === 'active'));
            this.original.set(opportunity);
            this.form.set(opportunity ? opportunityToForm(opportunity) : EMPTY);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected set<K extends keyof OpportunityFormValue>(
    key: K,
    value: OpportunityFormValue[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/risk/opportunities', id] : ['/risk/opportunities']);
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    const value = this.form();
    if (!orgId || !value.title.trim()) {
      return;
    }
    const id = this.id();
    this.saving.set(true);
    this.errorKey.set(null);
    const body = toOpportunityBody(value);
    const request = id
      ? this.api.updateOpportunity(orgId, id, body)
      : this.api.createOpportunity(orgId, body);
    request.subscribe({
      next: (o) => {
        this.saving.set(false);
        this.toasts.success(id ? 'risk.notices.saved' : 'risk.notices.created', { code: o.code });
        void this.router.navigate(['/risk/opportunities', o.id]);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }
}
