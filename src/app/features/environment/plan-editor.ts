import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Signal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService, FlowContext } from '../../core/kit/create-flow.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { RecurrencePicker } from '../../shared/tasks/recurrence-picker';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { EnvironmentApi } from './data/environment-api';
import {
  ASSIST_DRAFT_RESPONSE,
  ENTITY_ASPECT,
  ENTITY_PLAN,
  EmergencyPlan,
  RECORD_STATUSES,
} from './data/environment.models';
import { environmentErrorKey } from './data/environment-errors';
import {
  ContactDraft,
  MAX_CONTACTS,
  PickedRecord,
  PlanFormValue,
  emptyContact,
  emptyPlanForm,
  planFormFrom,
  toPlanCreate,
  toPlanUpdate,
  validatePlanForm,
} from './data/form-models';
import {
  ENV_CRUMBS,
  ENV_MODULE,
  ENV_ROOT_CRUMB,
  EnvDirectorySelect,
  EnvField,
  injectEnvPermissions,
} from './environment-shared';
import { EnvRecordPicker } from './record-picker';

type PlanText = 'scenario' | 'potential_impact' | 'response_procedure' | 'resources';

/** Form values a create-from-here prefill may set (from an aspect: title, scenario …). */
export function planPrefill(
  form: PlanFormValue,
  prefill: Readonly<Record<string, unknown>>,
): PlanFormValue {
  const str = (key: string) => (typeof prefill[key] === 'string' ? (prefill[key] as string) : null);
  const status = str('status');
  return {
    ...form,
    title: str('title') ?? form.title,
    scenario: str('scenario') ?? form.scenario,
    potential_impact: str('potential_impact') ?? form.potential_impact,
    site: str('site') ?? form.site,
    owner_user_id: str('owner_user_id') ?? form.owner_user_id,
    status: status === 'draft' || status === 'active' ? status : form.status,
  };
}

/** The aspect ids a prefill asks the new plan to cover. */
export function prefillAspectIds(prefill: Readonly<Record<string, unknown>>): string[] {
  const ids = prefill['aspect_ids'];
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Create (`/environment/emergency-plans/new`) or edit
 * (`/environment/emergency-plans/:id/edit`) an emergency preparedness and response
 * plan: the scenario and its potential impact, the aspects it covers, the response
 * procedure (the assistant can draft one), resources, contacts (members of the
 * organisation or external) and the fixed drill rhythm, which creates a recurring
 * drill task for the owner. Opened from an aspect ("Lag beredskapsplan") it is
 * prefilled and covers that aspect.
 */
@Component({
  selector: 'app-env-plan-editor',
  imports: [
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    FlowBanner,
    MarkdownPipe,
    RecurrencePicker,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    EnvDirectorySelect,
    EnvField,
    EnvRecordPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="max-w-[760px]">
        <app-page-header
          [titleKey]="id() ? 'environment.plan.editTitle' : 'environment.plan.newTitle'"
          [titleParams]="{ code: original()?.code ?? '' }"
          [breadcrumbs]="breadcrumbs()"
          titleTestId="plan-form-title"
        />
        <app-help-strip scope="environment" page="planForm" lesson="emergency-preparedness" />

        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="6" />
          }
          @case ('error') {
            <app-error-state [bodyKey]="errorKey()" (retry)="reload()" />
          }
          @default {
            <app-flow-banner [flow]="flow()" (cancelled)="cancelFlow()" />
            <form
              class="flex flex-col gap-5"
              (submit)="$event.preventDefault(); submit()"
              novalidate
            >
              <p class="text-meta text-fg-muted">
                <span class="text-fail" aria-hidden="true">*</span>
                {{ 'environment.form.requiredHint' | transloco }}
              </p>

              <app-card>
                <h2 class="mb-4 font-display text-card font-bold text-fg">
                  {{ 'environment.plan.sections.scenario' | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <app-env-field
                    class="sm:col-span-2"
                    labelKey="environment.fields.title"
                    inputId="cf-env-p-title"
                    page="planForm"
                    help="title"
                    [required]="true"
                    [errorKey]="shown()['title']"
                  >
                    <input
                      id="cf-env-p-title"
                      type="text"
                      maxlength="255"
                      required
                      [value]="form().title"
                      (input)="set('title', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['title']"
                      data-testid="plan-title"
                    />
                  </app-env-field>
                  <app-env-field
                    class="sm:col-span-2"
                    labelKey="environment.fields.scenario"
                    inputId="cf-env-p-scenario"
                    page="planForm"
                    help="scenario"
                  >
                    <textarea
                      id="cf-env-p-scenario"
                      rows="3"
                      maxlength="20000"
                      [value]="form().scenario"
                      (input)="setText('scenario', $any($event.target).value)"
                    ></textarea>
                  </app-env-field>
                  <app-env-field
                    class="sm:col-span-2"
                    labelKey="environment.fields.potentialImpact"
                    inputId="cf-env-p-impact"
                    page="planForm"
                    help="potential_impact"
                  >
                    <textarea
                      id="cf-env-p-impact"
                      rows="2"
                      maxlength="20000"
                      [value]="form().potential_impact"
                      (input)="setText('potential_impact', $any($event.target).value)"
                    ></textarea>
                  </app-env-field>
                  <app-env-field labelKey="environment.fields.site" inputId="cf-env-p-site">
                    <input
                      id="cf-env-p-site"
                      type="text"
                      maxlength="128"
                      [value]="form().site"
                      (input)="set('site', $any($event.target).value)"
                    />
                  </app-env-field>
                </div>
              </app-card>

              <app-card id="aspects">
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'environment.plan.sections.aspects' | transloco }}
                </h2>
                <p class="mb-4 text-ui text-fg-muted">
                  {{ 'environment.plan.aspectsFormHint' | transloco }}
                </p>
                <app-env-field
                  labelKey="environment.fields.coveredAspects"
                  inputId="cf-env-p-aspects"
                  page="planForm"
                  help="aspects"
                  [legend]="true"
                >
                  <app-env-record-picker
                    [entityType]="aspectType"
                    [value]="form().aspects"
                    inputId="cf-env-p-aspects"
                    labelledBy="cf-env-p-aspects-label"
                    placeholderKey="environment.picker.aspectPlaceholder"
                    testId="plan-aspects"
                    (valueChange)="set('aspects', $event)"
                  />
                </app-env-field>
              </app-card>

              <app-card>
                <h2 class="mb-4 font-display text-card font-bold text-fg">
                  {{ 'environment.plan.sections.response' | transloco }}
                </h2>
                <div class="flex flex-col gap-4">
                  <app-env-field
                    labelKey="environment.fields.responseProcedure"
                    inputId="cf-env-p-procedure"
                    page="planForm"
                    help="response_procedure"
                  >
                    <app-ask-about
                      label-extra
                      [prompt]="'environment.ask.procedureField' | transloco"
                      field="response_procedure"
                      [fieldLabel]="'environment.fields.responseProcedure' | transloco"
                      [requirements]="['iso14001:8.2']"
                    />
                    <textarea
                      id="cf-env-p-procedure"
                      rows="8"
                      maxlength="20000"
                      [value]="form().response_procedure"
                      (input)="setText('response_procedure', $any($event.target).value)"
                      data-testid="plan-procedure"
                    ></textarea>
                  </app-env-field>
                  <div class="flex flex-col items-start gap-2">
                    <app-ai-assist-button
                      [assist]="draftAssist"
                      labelKey="environment.plan.draftResponse"
                      [input]="draftInput()"
                      [disabled]="!form().scenario.trim()"
                      (text)="draft.set($event)"
                      data-testid="draft-response"
                    />
                    @if (!form().scenario.trim()) {
                      <p class="text-meta text-fg-subtle">
                        {{ 'environment.plan.draftNeedsScenario' | transloco }}
                      </p>
                    }
                    @if (draft()) {
                      <div
                        class="w-full rounded-card border border-accent-border bg-accent-soft p-3"
                        data-testid="response-draft"
                      >
                        <p class="mb-2 text-meta font-semibold text-fg-muted">
                          {{ 'environment.plan.draftTitle' | transloco }}
                        </p>
                        <div
                          class="cf-prose text-ui text-fg"
                          [innerHTML]="draft() | appMarkdown"
                        ></div>
                        <div class="mt-3 flex flex-wrap gap-2">
                          <app-button size="sm" (click)="useDraft()" data-testid="use-draft">
                            {{ 'environment.plan.useDraft' | transloco }}
                          </app-button>
                          <app-button size="sm" variant="ghost" (click)="draft.set('')">
                            {{ 'environment.plan.discardDraft' | transloco }}
                          </app-button>
                        </div>
                      </div>
                    }
                  </div>
                  <app-env-field
                    labelKey="environment.fields.resources"
                    inputId="cf-env-p-resources"
                    page="planForm"
                    help="resources"
                  >
                    <textarea
                      id="cf-env-p-resources"
                      rows="3"
                      maxlength="20000"
                      [value]="form().resources"
                      (input)="setText('resources', $any($event.target).value)"
                    ></textarea>
                  </app-env-field>
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'environment.fields.contacts' | transloco }}
                </h2>
                <p class="mb-4 text-ui text-fg-muted">
                  {{ 'environment.plan.contactsHint' | transloco }}
                </p>
                <ul class="flex flex-col gap-3" data-testid="plan-contacts-form">
                  @for (c of form().contacts; track $index; let i = $index) {
                    <li class="rounded-tile border border-border p-3">
                      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div
                          class="inline-flex rounded-tile border border-border p-0.5"
                          role="radiogroup"
                          [attr.aria-label]="'environment.plan.contactN' | transloco: { n: i + 1 }"
                        >
                          @for (kind of contactKinds; track kind) {
                            <button
                              type="button"
                              role="radio"
                              [attr.aria-checked]="c.kind === kind"
                              class="rounded-lg px-2.5 py-1 text-meta font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                              [class]="
                                c.kind === kind
                                  ? 'bg-accent-soft text-accent'
                                  : 'text-fg-muted hover:text-fg'
                              "
                              (click)="setContact(i, { kind })"
                            >
                              {{ 'environment.plan.contactKinds.' + kind | transloco }}
                            </button>
                          }
                        </div>
                        <app-button
                          variant="ghost"
                          size="sm"
                          [attr.aria-label]="
                            'environment.plan.removeContact' | transloco: { n: i + 1 }
                          "
                          (click)="removeContact(i)"
                        >
                          <app-icon name="trash" [size]="14" />
                          <span class="hidden sm:inline">{{
                            'environment.picker.remove' | transloco
                          }}</span>
                        </app-button>
                      </div>
                      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        @if (c.kind === 'member') {
                          <app-env-field
                            labelKey="environment.fields.contactPerson"
                            [inputId]="'cf-env-c-user-' + i"
                          >
                            <app-env-directory-select
                              [inputId]="'cf-env-c-user-' + i"
                              noneKey="environment.form.choosePerson"
                              [value]="c.user_id"
                              [currentName]="c.name || null"
                              (valueChange)="setContact(i, { user_id: $event })"
                            />
                          </app-env-field>
                        } @else {
                          <app-env-field
                            labelKey="environment.fields.contactName"
                            [inputId]="'cf-env-c-name-' + i"
                            [required]="true"
                            [errorKey]="shown()['contacts.' + i]"
                          >
                            <input
                              [id]="'cf-env-c-name-' + i"
                              type="text"
                              maxlength="128"
                              [value]="c.name"
                              (input)="setContact(i, { name: $any($event.target).value })"
                              [attr.aria-invalid]="!!shown()['contacts.' + i]"
                            />
                          </app-env-field>
                        }
                        <app-env-field
                          labelKey="environment.fields.contactRole"
                          [inputId]="'cf-env-c-role-' + i"
                        >
                          <input
                            [id]="'cf-env-c-role-' + i"
                            type="text"
                            maxlength="128"
                            [value]="c.role"
                            (input)="setContact(i, { role: $any($event.target).value })"
                          />
                        </app-env-field>
                        <app-env-field
                          labelKey="environment.fields.contactPhone"
                          [inputId]="'cf-env-c-phone-' + i"
                        >
                          <input
                            [id]="'cf-env-c-phone-' + i"
                            type="tel"
                            maxlength="64"
                            [value]="c.phone"
                            (input)="setContact(i, { phone: $any($event.target).value })"
                          />
                        </app-env-field>
                        <app-env-field
                          labelKey="environment.fields.contactEmail"
                          [inputId]="'cf-env-c-email-' + i"
                        >
                          <input
                            [id]="'cf-env-c-email-' + i"
                            type="email"
                            maxlength="254"
                            [value]="c.email"
                            (input)="setContact(i, { email: $any($event.target).value })"
                          />
                        </app-env-field>
                      </div>
                    </li>
                  } @empty {
                    <li class="text-ui text-fg-muted">
                      {{ 'environment.plan.noContacts' | transloco }}
                    </li>
                  }
                </ul>
                <div class="mt-3 flex flex-wrap gap-2">
                  <app-button
                    variant="secondary"
                    size="sm"
                    [disabled]="form().contacts.length >= maxContacts"
                    (click)="addContact('member')"
                    data-testid="add-member-contact"
                  >
                    <app-icon name="plus" [size]="13" />
                    {{ 'environment.plan.addMemberContact' | transloco }}
                  </app-button>
                  <app-button
                    variant="secondary"
                    size="sm"
                    [disabled]="form().contacts.length >= maxContacts"
                    (click)="addContact('external')"
                  >
                    <app-icon name="plus" [size]="13" />
                    {{ 'environment.plan.addExternalContact' | transloco }}
                  </app-button>
                </div>
              </app-card>

              <app-card id="drills">
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'environment.plan.sections.drillRhythm' | transloco }}
                </h2>
                <p class="mb-4 text-ui text-fg-muted">
                  {{ 'environment.plan.drillRhythmHint' | transloco }}
                </p>
                <label class="mb-3 flex items-center gap-2 text-body text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="form().drill_enabled"
                    (change)="set('drill_enabled', $any($event.target).checked)"
                    data-testid="plan-drill-enabled"
                  />
                  {{ 'environment.plan.scheduleDrills' | transloco }}
                </label>
                @if (form().drill_enabled) {
                  <div class="flex flex-col gap-3">
                    <app-recurrence-picker
                      idPrefix="cf-env-drill"
                      [rrule]="form().drill_rrule"
                      (rruleChange)="set('drill_rrule', $event)"
                    />
                    <app-env-field
                      labelKey="environment.fields.firstDrill"
                      inputId="cf-env-p-drill-start"
                      hintKey="environment.plan.firstDrillHint"
                    >
                      <input
                        id="cf-env-p-drill-start"
                        type="date"
                        aria-describedby="cf-env-p-drill-start-hint"
                        [value]="form().drill_start"
                        (change)="set('drill_start', $any($event.target).value)"
                      />
                    </app-env-field>
                  </div>
                }
              </app-card>

              <app-card>
                <h2 class="mb-4 font-display text-card font-bold text-fg">
                  {{ 'environment.plan.sections.ownership' | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <app-env-field labelKey="environment.fields.owner" inputId="cf-env-p-owner">
                    <app-env-directory-select
                      inputId="cf-env-p-owner"
                      [value]="form().owner_user_id"
                      [currentName]="original()?.owner_name ?? null"
                      (valueChange)="set('owner_user_id', $event)"
                    />
                  </app-env-field>
                  <app-env-field labelKey="environment.fields.department" inputId="cf-env-p-dept">
                    <app-env-directory-select
                      kind="department"
                      inputId="cf-env-p-dept"
                      noneKey="environment.form.noDepartment"
                      [value]="form().department_id"
                      (valueChange)="set('department_id', $event)"
                    />
                  </app-env-field>
                  <app-env-field
                    labelKey="environment.fields.status"
                    inputId="cf-env-p-status"
                    page="planForm"
                    help="status"
                  >
                    <select
                      id="cf-env-p-status"
                      (change)="set('status', $any($event.target).value)"
                    >
                      @for (s of statuses; track s) {
                        <option [value]="s" [selected]="form().status === s">
                          {{ 'environment.status.' + s | transloco }}
                        </option>
                      }
                    </select>
                  </app-env-field>
                  <app-env-field labelKey="environment.fields.reviewDue" inputId="cf-env-p-review">
                    <input
                      id="cf-env-p-review"
                      type="date"
                      [value]="form().review_due"
                      (change)="set('review_due', $any($event.target).value)"
                    />
                  </app-env-field>
                </div>
              </app-card>

              @if (id()) {
                <app-card>
                  <app-env-field
                    labelKey="environment.fields.changeReason"
                    inputId="cf-env-p-reason"
                    hintKey="environment.form.changeReasonHint"
                  >
                    <input
                      id="cf-env-p-reason"
                      type="text"
                      maxlength="2000"
                      aria-describedby="cf-env-p-reason-hint"
                      [value]="changeReason()"
                      (input)="changeReason.set($any($event.target).value)"
                    />
                  </app-env-field>
                </app-card>
              }

              <div
                class="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0"
              >
                @if (attempted() && errorCount()) {
                  <p class="mr-auto text-meta font-semibold text-fail" role="alert">
                    {{ 'environment.form.fixErrors' | transloco: { count: errorCount() } }}
                  </p>
                }
                <app-button variant="secondary" (click)="back()">
                  {{ 'common.cancel' | transloco }}
                </app-button>
                <app-button
                  type="submit"
                  [loading]="saving()"
                  [disabled]="saving()"
                  data-testid="plan-save"
                >
                  {{ (id() ? 'common.save' : 'environment.plan.create') | transloco }}
                </app-button>
              </div>
            </form>
          }
        }
      </div>
    </div>
  `,
})
export class PlanEditor {
  private readonly api = inject(EnvironmentApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flows = inject(CreateFlowService);

  readonly id = input<string | undefined>(undefined);

  protected readonly perms = injectEnvPermissions();
  protected readonly draftAssist = ASSIST_DRAFT_RESPONSE;
  protected readonly statuses = RECORD_STATUSES;
  protected readonly maxContacts = MAX_CONTACTS;
  protected readonly aspectType = ENTITY_ASPECT;
  protected readonly contactKinds: readonly ContactDraft['kind'][] = ['member', 'external'];

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('ui.error.body');
  protected readonly original = signal<EmergencyPlan | null>(null);
  private readonly seed = signal<PlanFormValue | null>(null);
  protected readonly form = signal<PlanFormValue>(emptyPlanForm());
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  protected readonly draft = signal('');
  protected readonly attempted = signal(false);

  private readonly flowSource = signal<Signal<FlowContext | null> | null>(null);
  protected readonly flow = computed(() => this.flowSource()?.() ?? null);

  protected readonly errors = computed(() => validatePlanForm(this.form()));
  protected readonly shown = computed(() => (this.attempted() ? this.errors() : {}));
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);

  protected readonly breadcrumbs = computed(() => {
    const p = this.original();
    return p
      ? [
          ENV_ROOT_CRUMB,
          ENV_CRUMBS.plans,
          { label: p.code, link: ['/environment/emergency-plans', p.id] },
          { labelKey: 'environment.common.edit' },
        ]
      : [ENV_ROOT_CRUMB, ENV_CRUMBS.plans, { labelKey: 'environment.plan.newTitle' }];
  });

  protected readonly draftInput = computed(() => {
    const f = this.form();
    return {
      scenario: f.scenario.trim(),
      site: f.site.trim() || undefined,
      potential_impact: f.potential_impact.trim() || undefined,
      resources: f.resources.trim() || undefined,
    };
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: ENV_MODULE,
      entityType: ENTITY_PLAN,
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.title ?? this.language.translate('environment.plan.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    // Prefill from "Lag beredskapsplan" on an aspect (may arrive after the form opened).
    effect(() => {
      const flow = this.flow();
      if (flow && !this.id()) {
        untracked(() => {
          this.form.update((f) => planPrefill(f, flow.prefill));
          this.loadPrefillAspects(prefillAspectIds(flow.prefill));
        });
      }
    });
  }

  protected set<K extends keyof PlanFormValue>(key: K, value: PlanFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setText(key: PlanText, value: string): void {
    this.set(key, value);
  }

  protected addContact(kind: ContactDraft['kind']): void {
    if (this.form().contacts.length < MAX_CONTACTS) {
      this.set('contacts', [...this.form().contacts, emptyContact(kind)]);
    }
  }

  protected setContact(index: number, patch: Partial<ContactDraft>): void {
    this.set(
      'contacts',
      this.form().contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  }

  protected removeContact(index: number): void {
    this.set(
      'contacts',
      this.form().contacts.filter((_, i) => i !== index),
    );
  }

  protected useDraft(): void {
    this.set('response_procedure', this.draft());
    this.draft.set('');
  }

  protected cancelFlow(): void {
    this.flows.cancel();
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected submit(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || this.errorCount()) {
      return;
    }
    const id = this.id();
    const seed = this.seed();
    if (id && seed) {
      const body = toPlanUpdate(seed, this.form(), this.changeReason());
      if (Object.keys(body).filter((k) => k !== 'change_reason').length === 0) {
        this.notifications.info('environment.notices.noChanges');
        this.back();
        return;
      }
      this.saving.set(true);
      this.api.updatePlan(orgId, id, body).subscribe({
        next: () => this.saved(id, 'environment.notices.saved'),
        error: (error: unknown) => this.failed(error),
      });
      return;
    }
    this.saving.set(true);
    this.api.createPlan(orgId, toPlanCreate(this.form())).subscribe({
      next: (p) => {
        if (this.flow()) {
          this.flows.complete(p.id, ENTITY_PLAN).subscribe();
        }
        this.saved(p.id, 'environment.notices.created', p.code);
      },
      error: (error: unknown) => this.failed(error),
    });
  }

  protected back(): void {
    const id = this.id();
    if (!id && this.flow()) {
      this.flows.cancel();
    }
    void this.router.navigate(
      id ? ['/environment/emergency-plans', id] : ['/environment/emergency-plans'],
    );
  }

  private saved(id: string, key: string, code?: string): void {
    this.saving.set(false);
    this.notifications.success(key, code ? { code } : undefined);
    void this.router.navigate(['/environment/emergency-plans', id]);
  }

  private failed(error: unknown): void {
    this.saving.set(false);
    this.notifications.error(environmentErrorKey(error));
  }

  /** Show the prefilled aspects as chips (their code and title come from the API). */
  private loadPrefillAspects(ids: readonly string[]): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !ids.length) {
      return;
    }
    forkJoin(
      ids.map((id) => this.api.getAspect(orgId, id).pipe(catchError(() => of(null)))),
    ).subscribe((aspects) => {
      const picked: PickedRecord[] = aspects
        .filter((a) => !!a)
        .map((a) => ({ id: a!.id, code: a!.code, title: a!.aspect, url: a!.url }));
      if (picked.length) {
        this.form.update((f) => ({
          ...f,
          aspects: [...f.aspects, ...picked.filter((p) => !f.aspects.some((x) => x.id === p.id))],
        }));
      }
    });
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!id) {
      this.form.set(emptyPlanForm({ owner_user_id: this.auth.user()?.id ?? '' }));
      if (!this.flowSource()) {
        this.flowSource.set(this.flows.consume(this.route, { targetType: ENTITY_PLAN }));
      }
      this.state.set('ready');
      return;
    }
    this.state.set('loading');
    this.request = this.api.getPlan(orgId, id).subscribe({
      next: (plan) => {
        const value = planFormFrom(plan);
        this.original.set(plan);
        this.seed.set(value);
        this.form.set(value);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(environmentErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
