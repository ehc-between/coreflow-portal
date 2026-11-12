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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { RecurrencePicker } from '../../shared/tasks/recurrence-picker';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { EnvironmentApi } from './data/environment-api';
import { ASSIST_DRAFT_RESPONSE, EmergencyPlan, RECORD_STATUSES } from './data/environment.models';
import { environmentErrorKey } from './data/environment-errors';
import {
  ContactDraft,
  MAX_CONTACTS,
  PlanFormValue,
  emptyContact,
  emptyPlanForm,
  planFormFrom,
  toPlanCreate,
  toPlanUpdate,
  validatePlanForm,
} from './data/form-models';
import { EnvOwnerFields } from './owner-fields';

type PlanText = 'scenario' | 'potential_impact' | 'response_procedure' | 'resources';

/**
 * Create (`/environment/emergency-plans/new`) or edit
 * (`/environment/emergency-plans/:id/edit`) an emergency preparedness and
 * response plan: the scenario and its potential impact, the response procedure
 * (the assistant can draft one), resources, emergency contacts and the drill
 * schedule, which creates a recurring drill task for the owner.
 */
@Component({
  selector: 'app-env-plan-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    MarkdownPipe,
    RecurrencePicker,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    EnvOwnerFields,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="
          id() ? ['/environment/emergency-plans', id()] : '/environment/emergency-plans'
        "
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'environment.common.backToRecord' : 'environment.plans.back') | transloco }}
      </a>
      <h1
        class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
        data-testid="plan-form-title"
      >
        @if (original(); as p) {
          {{ 'environment.plan.editTitle' | transloco: { code: p.code } }}
        } @else {
          {{ 'environment.plan.newTitle' | transloco }}
        }
      </h1>
      <div class="mb-5"><app-guide-intro scope="environment" page="planForm" /></div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'environment.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
        }
        @default {
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
            <app-card>
              <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
                {{ 'environment.plan.sections.scenario' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'environment.fields.title' | transloco"
                    inputId="cf-env-p-title"
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
                  </app-form-field>
                  @if (shown()['title']; as key) {
                    <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                  }
                </div>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'environment.fields.scenario' | transloco"
                    inputId="cf-env-p-scenario"
                  >
                    <textarea
                      id="cf-env-p-scenario"
                      rows="3"
                      maxlength="20000"
                      [value]="form().scenario"
                      (input)="setText('scenario', $any($event.target).value)"
                      data-testid="plan-scenario"
                    ></textarea>
                  </app-form-field>
                  <app-field-help scope="environment" page="planForm" field="scenario" />
                </div>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'environment.fields.potentialImpact' | transloco"
                    inputId="cf-env-p-impact"
                  >
                    <textarea
                      id="cf-env-p-impact"
                      rows="3"
                      maxlength="20000"
                      [value]="form().potential_impact"
                      (input)="setText('potential_impact', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.site' | transloco"
                    inputId="cf-env-p-site"
                  >
                    <input
                      id="cf-env-p-site"
                      type="text"
                      maxlength="128"
                      [value]="form().site"
                      (input)="set('site', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
                {{ 'environment.plan.sections.response' | transloco }}
              </h2>
              <div class="flex flex-col gap-4">
                <div>
                  <app-form-field
                    [label]="'environment.fields.responseProcedure' | transloco"
                    inputId="cf-env-p-procedure"
                  >
                    <textarea
                      id="cf-env-p-procedure"
                      rows="8"
                      maxlength="20000"
                      [value]="form().response_procedure"
                      (input)="setText('response_procedure', $any($event.target).value)"
                      data-testid="plan-procedure"
                    ></textarea>
                  </app-form-field>
                  <app-field-help scope="environment" page="planForm" field="response_procedure" />
                  <div class="mt-2 flex flex-col items-start gap-2">
                    <app-ai-assist-button
                      [assist]="draftAssist"
                      labelKey="environment.plan.draftResponse"
                      [input]="draftInput()"
                      [disabled]="!form().scenario.trim()"
                      (text)="draft.set($event)"
                      data-testid="draft-response"
                    />
                    @if (!form().scenario.trim()) {
                      <p class="text-[12px] text-fg-subtle">
                        {{ 'environment.plan.draftNeedsScenario' | transloco }}
                      </p>
                    }
                    @if (draft()) {
                      <div
                        class="w-full rounded-card border border-accent-border bg-accent-soft p-3"
                        data-testid="response-draft"
                      >
                        <p class="mb-2 text-[12px] font-semibold text-fg-muted">
                          {{ 'environment.plan.draftTitle' | transloco }}
                        </p>
                        <div
                          class="cf-prose text-[13px] text-fg"
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
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.resources' | transloco"
                    inputId="cf-env-p-resources"
                  >
                    <textarea
                      id="cf-env-p-resources"
                      rows="3"
                      maxlength="20000"
                      [value]="form().resources"
                      (input)="setText('resources', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                  <app-field-help scope="environment" page="planForm" field="resources" />
                </div>
              </div>
            </app-card>

            <app-card>
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 class="font-display text-[16px] font-bold text-fg">
                  {{ 'environment.fields.contacts' | transloco }}
                </h2>
                @if (form().contacts.length < maxContacts) {
                  <app-button
                    size="sm"
                    variant="secondary"
                    (click)="addContact()"
                    data-testid="add-contact"
                  >
                    <app-icon name="plus" [size]="14" />
                    {{ 'environment.plan.addContact' | transloco }}
                  </app-button>
                }
              </div>
              <app-field-help scope="environment" page="planForm" field="contacts" />
              @for (c of form().contacts; track $index; let i = $index) {
                <fieldset
                  class="mt-3 grid grid-cols-1 gap-3 rounded-tile border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end"
                >
                  <legend class="sr-only">
                    {{ 'environment.plan.contactN' | transloco: { n: i + 1 } }}
                  </legend>
                  <app-form-field
                    [label]="'environment.fields.contactName' | transloco"
                    [inputId]="'cf-env-c-name-' + i"
                  >
                    <input
                      [id]="'cf-env-c-name-' + i"
                      type="text"
                      maxlength="128"
                      [value]="c.name"
                      (input)="setContact(i, { name: $any($event.target).value })"
                      [attr.aria-invalid]="!!shown()['contacts.' + i]"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'environment.fields.contactRole' | transloco"
                    [inputId]="'cf-env-c-role-' + i"
                  >
                    <input
                      [id]="'cf-env-c-role-' + i"
                      type="text"
                      maxlength="128"
                      [value]="c.role"
                      (input)="setContact(i, { role: $any($event.target).value })"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'environment.fields.contactPhone' | transloco"
                    [inputId]="'cf-env-c-phone-' + i"
                  >
                    <input
                      [id]="'cf-env-c-phone-' + i"
                      type="tel"
                      maxlength="64"
                      [value]="c.phone"
                      (input)="setContact(i, { phone: $any($event.target).value })"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'environment.fields.contactEmail' | transloco"
                    [inputId]="'cf-env-c-email-' + i"
                  >
                    <input
                      [id]="'cf-env-c-email-' + i"
                      type="email"
                      maxlength="254"
                      [value]="c.email"
                      (input)="setContact(i, { email: $any($event.target).value })"
                    />
                  </app-form-field>
                  <app-button
                    variant="ghost"
                    size="sm"
                    [attr.aria-label]="'environment.plan.removeContact' | transloco: { n: i + 1 }"
                    (click)="removeContact(i)"
                  >
                    <app-icon name="trash" [size]="14" />
                  </app-button>
                  @if (shown()['contacts.' + i]; as key) {
                    <p class="text-[12px] text-fail sm:col-span-5" role="alert">
                      {{ key | transloco }}
                    </p>
                  }
                </fieldset>
              } @empty {
                <p class="mt-2 text-[13px] text-fg-muted">
                  {{ 'environment.plan.noContacts' | transloco }}
                </p>
              }
            </app-card>

            <app-card>
              <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
                {{ 'environment.plan.sections.drills' | transloco }}
              </h2>
              <label class="flex items-center gap-2 text-[13.5px] text-fg">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="form().drill_enabled"
                  (change)="set('drill_enabled', $any($event.target).checked)"
                  data-testid="plan-drill-enabled"
                />
                {{ 'environment.plan.scheduleDrills' | transloco }}
              </label>
              <app-field-help scope="environment" page="planForm" field="drill_rrule" />
              @if (form().drill_enabled) {
                <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr] sm:items-start">
                  <app-recurrence-picker
                    idPrefix="cf-env-drill"
                    [rrule]="form().drill_rrule"
                    (rruleChange)="set('drill_rrule', $event)"
                  />
                  <app-form-field
                    [label]="'environment.fields.firstDrill' | transloco"
                    inputId="cf-env-p-drill-start"
                  >
                    <input
                      id="cf-env-p-drill-start"
                      type="date"
                      [value]="form().drill_start"
                      (change)="set('drill_start', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
              }
            </app-card>

            <app-card>
              <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
                {{ 'environment.plan.sections.ownership' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <app-env-owner-fields
                  idPrefix="cf-env-p"
                  [ownerId]="form().owner_user_id"
                  [departmentId]="form().department_id"
                  [ownerName]="original()?.owner_name ?? null"
                  (ownerChange)="set('owner_user_id', $event)"
                  (departmentChange)="set('department_id', $event)"
                />
                <div>
                  <app-form-field
                    [label]="'environment.fields.status' | transloco"
                    inputId="cf-env-p-status"
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
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.reviewDue' | transloco"
                    inputId="cf-env-p-review"
                  >
                    <input
                      id="cf-env-p-review"
                      type="date"
                      [value]="form().review_due"
                      (change)="set('review_due', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
              </div>
            </app-card>

            @if (id()) {
              <app-card>
                <app-form-field
                  [label]="'environment.fields.changeReason' | transloco"
                  inputId="cf-env-p-reason"
                >
                  <input
                    id="cf-env-p-reason"
                    type="text"
                    maxlength="2000"
                    [value]="changeReason()"
                    (input)="changeReason.set($any($event.target).value)"
                  />
                </app-form-field>
                <p class="mt-1 text-[12px] text-fg-subtle">
                  {{ 'environment.form.changeReasonHint' | transloco }}
                </p>
              </app-card>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="ghost" (click)="back()">
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
          <div class="mt-6"><app-why-it-matters scope="environment" page="planForm" /></div>
        }
      }
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

  readonly id = input<string | undefined>(undefined);

  protected readonly draftAssist = ASSIST_DRAFT_RESPONSE;
  protected readonly statuses = RECORD_STATUSES;
  protected readonly maxContacts = MAX_CONTACTS;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.common.loadFailed');
  protected readonly original = signal<EmergencyPlan | null>(null);
  private readonly seed = signal<PlanFormValue | null>(null);
  protected readonly form = signal<PlanFormValue>(emptyPlanForm());
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  protected readonly draft = signal('');
  private readonly attempted = signal(false);

  protected readonly errors = computed(() => validatePlanForm(this.form()));
  protected readonly shown = computed(() => (this.attempted() ? this.errors() : {}));

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
      module: 'environment',
      entityType: 'emergency_plan',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.title ?? this.language.translate('environment.plan.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected set<K extends keyof PlanFormValue>(key: K, value: PlanFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setText(key: PlanText, value: string): void {
    this.set(key, value);
  }

  protected addContact(): void {
    if (this.form().contacts.length < MAX_CONTACTS) {
      this.set('contacts', [...this.form().contacts, emptyContact()]);
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

  protected submit(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || Object.keys(this.errors()).length) {
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
      next: (p) => this.saved(p.id, 'environment.notices.created', p.code),
      error: (error: unknown) => this.failed(error),
    });
  }

  protected back(): void {
    const id = this.id();
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

  private load(orgId: string | null, id: string | undefined): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!id) {
      this.form.set(emptyPlanForm({ owner_user_id: this.auth.user()?.id ?? '' }));
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
