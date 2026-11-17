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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService, FlowContext } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RiskApi } from '../data/risk-api';
import { fromDateInput, subjectTypesFor, toDateInput } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  EntityRef,
  Opportunity,
  OpportunityCreate,
  Register,
  SOURCE_TYPES,
  SUBJECT_TYPES,
  SourceType,
  SubjectType,
} from '../data/risk.models';
import { OpportunityScore } from '../shared/opportunity-score';
import { PersonSelect } from '../shared/person-select';
import { RiskField } from '../shared/risk-field';
import { RiskPermissions } from '../shared/risk-permissions';
import { SubjectPicker } from '../shared/subject-picker';

export interface OpportunityFormValue {
  readonly register_id: string;
  readonly title: string;
  readonly description: string;
  readonly source_type: SourceType | '';
  readonly source_ref: string;
  readonly subject: EntityRef | null;
  readonly benefit: string;
  readonly feasibility: string;
  readonly action_plan: string;
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly due_at: string;
}

function emptyOpportunity(ownerId = ''): OpportunityFormValue {
  return {
    register_id: '',
    title: '',
    description: '',
    source_type: '',
    source_ref: '',
    subject: null,
    benefit: '',
    feasibility: '',
    action_plan: '',
    owner_user_id: ownerId,
    department_id: '',
    due_at: '',
  };
}

export function opportunityToForm(o: Opportunity): OpportunityFormValue {
  return {
    register_id: o.register?.id ?? '',
    title: o.title,
    description: o.description ?? '',
    source_type: o.source_type ?? '',
    source_ref: o.source_ref ?? '',
    subject: o.source_entity ?? null,
    benefit: o.benefit !== null ? String(o.benefit) : '',
    feasibility: o.feasibility !== null ? String(o.feasibility) : '',
    action_plan: o.action_plan ?? '',
    owner_user_id: o.owner?.id ?? '',
    department_id: o.department?.id ?? '',
    due_at: toDateInput(o.due_at),
  };
}

function isSubjectType(type: string): type is SubjectType {
  return (SUBJECT_TYPES as readonly string[]).includes(type);
}

export function toOpportunityBody(v: OpportunityFormValue): OpportunityCreate {
  const text = (s: string) => s.trim() || null;
  const subject = v.subject && isSubjectType(v.subject.entity_type) ? v.subject : null;
  return {
    register_id: v.register_id || null,
    title: v.title.trim(),
    description: text(v.description),
    source_type: v.source_type || null,
    source_ref: text(v.source_ref),
    source_entity_type: subject ? (subject.entity_type as SubjectType) : null,
    source_entity_id: subject ? subject.entity_id : null,
    benefit: v.benefit ? Number(v.benefit) : null,
    feasibility: v.feasibility ? Number(v.feasibility) : null,
    action_plan: text(v.action_plan),
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    due_at: fromDateInput(v.due_at),
  };
}

const SCALE = [1, 2, 3, 4, 5] as const;

/**
 * Create or edit an opportunity: what it is and what it concerns (a real record
 * where there is one), benefit x feasibility (each level explained), owner, due
 * date and a short plan. Action items are added as tasks on the opportunity
 * after saving; "Create from this" turns it into an objective or a project.
 */
@Component({
  selector: 'app-opportunity-form',
  imports: [
    TranslocoPipe,
    AskAbout,
    FlowBanner,
    Alert,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    LoadingState,
    PageHeader,
    OpportunityScore,
    PersonSelect,
    RiskField,
    SubjectPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'risk.opportunities.editTitle' : 'risk.opportunities.newTitle'"
        [breadcrumbs]="breadcrumbs()"
      />
      <app-help-strip scope="risk" page="opportunityForm" lesson="opportunities" />
      <app-flow-banner [flow]="flow()" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="5" />
      } @else if (state() === 'error') {
        <app-error-state (retry)="reload()" />
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-card>
            <div class="grid grid-cols-1 gap-4">
              <app-risk-field
                inputId="opp-title"
                labelKey="risk.fields.title"
                [required]="true"
                helpPage="opportunityForm"
                helpField="title"
                [error]="titleError()"
              >
                <input
                  id="opp-title"
                  required
                  maxlength="255"
                  [value]="form().title"
                  [attr.aria-invalid]="titleError() ? true : null"
                  (input)="set('title', $any($event.target).value)"
                />
              </app-risk-field>
              <app-risk-field inputId="opp-description" labelKey="risk.fields.description">
                <textarea
                  id="opp-description"
                  rows="3"
                  [value]="form().description"
                  (input)="set('description', $any($event.target).value)"
                ></textarea>
              </app-risk-field>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <app-risk-field
                  inputId="opp-source-type"
                  labelKey="risk.opportunities.concerns"
                  helpPage="opportunityForm"
                  helpField="concerns"
                >
                  <select id="opp-source-type" (change)="setSourceType($any($event.target).value)">
                    <option value="" [selected]="!form().source_type">
                      {{ 'risk.common.notSet' | transloco }}
                    </option>
                    @for (s of sourceTypes; track s) {
                      <option [value]="s" [selected]="s === form().source_type">
                        {{ 'risk.sourceTypes.' + s | transloco }}
                      </option>
                    }
                  </select>
                </app-risk-field>
                @if (registers().length) {
                  <app-risk-field inputId="opp-register" labelKey="risk.fields.register">
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
                  </app-risk-field>
                }
              </div>
              @if (subjectTypes().length) {
                <app-risk-field
                  inputId="opp-subject"
                  labelKey="risk.fields.sourceEntity"
                  [plain]="true"
                >
                  <app-risk-subject-picker
                    inputId="opp-subject"
                    [types]="subjectTypes()"
                    [value]="form().subject"
                    (picked)="set('subject', $event)"
                    (cleared)="set('subject', null)"
                  />
                </app-risk-field>
              }
              @if (!form().subject) {
                <app-risk-field
                  inputId="opp-source-ref"
                  [labelKey]="
                    subjectTypes().length ? 'risk.fields.sourceRefOther' : 'risk.fields.sourceRef'
                  "
                >
                  <input
                    id="opp-source-ref"
                    maxlength="255"
                    [value]="form().source_ref"
                    (input)="set('source_ref', $any($event.target).value)"
                  />
                </app-risk-field>
              }
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-1 flex items-center gap-1.5 font-display text-section font-bold text-fg">
              {{ 'risk.opportunities.evaluation' | transloco }}
              <app-ask-about [prompt]="'risk.ask.opportunity' | transloco" field="score" />
            </h2>
            <p class="mb-4 text-ui text-fg-muted">
              {{ 'risk.opportunities.evaluationHint' | transloco }}
            </p>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              @for (axis of axes; track axis) {
                <fieldset>
                  <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
                    {{ 'risk.fields.' + axis | transloco }}
                  </legend>
                  <div class="flex flex-col gap-1">
                    @for (n of scale; track n) {
                      <label
                        class="flex min-h-8 cursor-pointer items-start gap-2 rounded-tile px-2 py-1 text-ui hover:bg-surface-2"
                      >
                        <input
                          type="radio"
                          class="mt-0.5"
                          [name]="'opp-' + axis"
                          [value]="n"
                          [checked]="'' + n === form()[axis]"
                          (change)="set(axis, '' + n)"
                        />
                        <span>
                          <span class="font-semibold text-fg"
                            >{{ n }} · {{ 'risk.opportunities.scale.' + n | transloco }}</span
                          >
                          <span class="block text-meta text-fg-muted">{{
                            'risk.opportunities.levels.' + axis + '.' + n | transloco
                          }}</span>
                        </span>
                      </label>
                    }
                  </div>
                </fieldset>
              }
            </div>
            <div class="mt-4 flex items-center gap-2" aria-live="polite">
              <span class="text-ui font-semibold text-fg-muted">{{
                'risk.fields.score' | transloco
              }}</span>
              <app-opportunity-score [score]="score()" />
            </div>
            <div class="mt-4">
              <app-risk-field
                inputId="opp-plan"
                labelKey="risk.fields.actionPlan"
                helpPage="opportunityForm"
                helpField="actionPlan"
              >
                <textarea
                  id="opp-plan"
                  rows="3"
                  [value]="form().action_plan"
                  (input)="set('action_plan', $any($event.target).value)"
                ></textarea>
                <span hint>{{ 'risk.opportunities.actionPlanHint' | transloco }}</span>
              </app-risk-field>
            </div>
          </app-card>

          <app-card>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <app-risk-field inputId="opp-owner" labelKey="risk.fields.owner" [required]="true">
                <app-person-select
                  inputId="opp-owner"
                  [value]="form().owner_user_id"
                  [currentName]="original()?.owner?.name ?? null"
                  (valueChange)="set('owner_user_id', $event)"
                />
              </app-risk-field>
              <app-risk-field inputId="opp-department" labelKey="risk.fields.department">
                <app-person-select
                  kind="department"
                  inputId="opp-department"
                  [value]="form().department_id"
                  [currentName]="original()?.department?.name ?? null"
                  (valueChange)="set('department_id', $event)"
                />
              </app-risk-field>
              <app-risk-field inputId="opp-due" labelKey="risk.fields.dueAt">
                <input
                  id="opp-due"
                  type="date"
                  [value]="form().due_at"
                  (input)="set('due_at', $any($event.target).value)"
                />
              </app-risk-field>
            </div>
          </app-card>

          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }
          <div
            class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0"
          >
            <app-button variant="ghost" (click)="cancel()">{{
              'risk.common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()" [disabled]="saving()">
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
  private readonly auth = inject(AuthService);
  private readonly flows = inject(CreateFlowService);
  private readonly perms = inject(RiskPermissions);

  readonly id = input<string | undefined>(undefined);

  protected readonly sourceTypes = SOURCE_TYPES;
  protected readonly scale = SCALE;
  protected readonly axes = ['benefit', 'feasibility'] as const;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly registers = signal<readonly Register[]>([]);
  protected readonly original = signal<Opportunity | null>(null);
  protected readonly form = signal<OpportunityFormValue>(emptyOpportunity());
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), {
    targetType: 'opportunity',
  });
  private flowApplied: FlowContext | null = null;
  private sub: Subscription | null = null;

  protected readonly breadcrumbs = computed(() => {
    const crumbs: { labelKey?: string; label?: string; link?: string | unknown[] }[] = [
      { labelKey: 'modules.names.risk', link: '/risk' },
      { labelKey: 'risk.opportunities.title', link: '/risk/opportunities' },
    ];
    const o = this.original();
    if (o) {
      crumbs.push({ label: o.code, link: ['/risk/opportunities', o.id] });
    }
    crumbs.push({
      labelKey: this.id() ? 'risk.opportunities.editTitle' : 'risk.opportunities.newTitle',
    });
    return crumbs;
  });

  protected readonly subjectTypes = computed(() => subjectTypesFor(this.form().source_type));
  protected readonly titleError = computed(() =>
    this.submitted() && !this.form().title.trim() ? 'risk.errors.title_required' : null,
  );

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
      untracked(() => this.load(orgId, id));
    });
    effect(() => {
      const flow = this.flow();
      const ready = this.state() === 'ready';
      untracked(() => {
        if (flow && ready && !this.id() && flow !== this.flowApplied) {
          this.flowApplied = flow;
          const p = flow.prefill;
          this.form.update((f) => ({
            ...f,
            title: typeof p.title === 'string' ? p.title : f.title,
            description: typeof p.description === 'string' ? p.description : f.description,
            subject:
              flow.source && isSubjectType(flow.source.entity_type) ? flow.source : f.subject,
          }));
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.perms.orgId(), this.id());
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = forkJoin({
      registers: this.api.listRegisters(orgId),
      opportunity: id ? this.api.getOpportunity(orgId, id) : of(null),
    }).subscribe({
      next: ({ registers, opportunity }) => {
        this.registers.set(registers.items.filter((r) => r.status === 'active'));
        this.original.set(opportunity);
        this.form.set(
          opportunity
            ? opportunityToForm(opportunity)
            : emptyOpportunity(this.auth.user()?.id ?? ''),
        );
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected set<K extends keyof OpportunityFormValue>(
    key: K,
    value: OpportunityFormValue[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setSourceType(value: string): void {
    const source = (value || '') as SourceType | '';
    const allowed = subjectTypesFor(source);
    this.form.update((f) => ({
      ...f,
      source_type: source,
      subject:
        f.subject && (allowed as readonly string[]).includes(f.subject.entity_type)
          ? f.subject
          : null,
    }));
  }

  protected cancel(): void {
    const id = this.id();
    this.flows.cancel();
    void this.router.navigate(id ? ['/risk/opportunities', id] : ['/risk/opportunities']);
  }

  protected save(): void {
    this.submitted.set(true);
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
        if (!id) {
          this.flows.complete(o.id, 'opportunity').subscribe();
        }
        void this.router.navigate(['/risk/opportunities', o.id]);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }
}
