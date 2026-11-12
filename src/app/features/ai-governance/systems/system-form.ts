import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { dayOf, dueAtFromDay } from '../../../shared/tasks/task-display';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import {
  AI_ACT_ROLES,
  AiActRole,
  AiSystem,
  AiSystemWrite,
  SYSTEM_STATUSES,
  SystemStatus,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  AI_SYSTEM_ENTITY,
  parseTags,
  roleKey,
  statusKey,
} from '../data/ai-governance-display';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiUserSelect } from '../ui/user-select';

/** The editable fields of the form (tags as text). */
export interface SystemFormValue {
  name: string;
  description: string;
  intended_purpose: string;
  ai_act_role: AiActRole;
  status: SystemStatus;
  provider_name: string;
  models: string;
  data_categories: string;
  uses_personal_data: boolean;
  owner_user_id: string;
  department_id: string;
  next_review: string;
}

export function emptySystemForm(): SystemFormValue {
  return {
    name: '',
    description: '',
    intended_purpose: '',
    ai_act_role: 'deployer',
    status: 'planned',
    provider_name: '',
    models: '',
    data_categories: '',
    uses_personal_data: false,
    owner_user_id: '',
    department_id: '',
    next_review: '',
  };
}

export function systemToForm(s: AiSystem): SystemFormValue {
  return {
    name: s.name,
    description: s.description ?? '',
    intended_purpose: s.intended_purpose ?? '',
    ai_act_role: s.ai_act_role,
    status: s.status,
    provider_name: s.provider_name ?? '',
    models: s.models.join(', '),
    data_categories: s.data_categories.join(', '),
    uses_personal_data: s.uses_personal_data,
    owner_user_id: s.owner?.id ?? '',
    department_id: s.department_id ?? '',
    next_review: dayOf(s.next_review_at),
  };
}

/** The request body of a form value (blank text becomes null). */
export function formToRequest(v: SystemFormValue): AiSystemWrite {
  const text = (value: string): string | null => value.trim() || null;
  return {
    name: v.name.trim(),
    description: text(v.description),
    intended_purpose: text(v.intended_purpose),
    ai_act_role: v.ai_act_role,
    status: v.status,
    provider_name: text(v.provider_name),
    models: parseTags(v.models),
    data_categories: parseTags(v.data_categories),
    uses_personal_data: v.uses_personal_data,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    next_review_at: dueAtFromDay(v.next_review),
  };
}

/**
 * `/ai-governance/systems/new` and `/ai-governance/systems/:id/edit`: register
 * or edit an AI system in the inventory (purpose, AI Act role, status, provider,
 * models, data, owner, department and next review). Editing asks for a change
 * reason, stored with the revision.
 */
@Component({
  selector: 'app-ai-system-form',
  imports: [
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    Alert,
    Button,
    Card,
    FormField,
    AiGovPage,
    AiUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      [titleKey]="id() ? 'aiGovernance.systemForm.editTitle' : 'aiGovernance.systemForm.newTitle'"
      page="systemForm"
      [backLink]="id() ? ['/ai-governance/systems', id()] : '/ai-governance/systems'"
    >
      @if (loadError()) {
        <app-alert tone="error">{{ loadError()! | transloco }}</app-alert>
      } @else if (ready()) {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
          <app-card>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div class="md:col-span-2">
                <app-form-field [label]="'aiGovernance.fields.name' | transloco" inputId="ais-name">
                  <input
                    id="ais-name"
                    type="text"
                    maxlength="200"
                    required
                    [value]="form().name"
                    (input)="patch({ name: $any($event.target).value })"
                    [attr.aria-invalid]="submitted() && !form().name.trim()"
                  />
                </app-form-field>
                @if (submitted() && !form().name.trim()) {
                  <p class="mt-1 text-[12.5px] text-fail">
                    {{ 'aiGovernance.errors.name_required' | transloco }}
                  </p>
                }
              </div>
              <div class="md:col-span-2">
                <div class="flex items-center gap-2">
                  <app-form-field
                    class="flex-1"
                    [label]="'aiGovernance.fields.intendedPurpose' | transloco"
                    inputId="ais-purpose"
                  >
                    <textarea
                      id="ais-purpose"
                      rows="3"
                      maxlength="10000"
                      [value]="form().intended_purpose"
                      (input)="patch({ intended_purpose: $any($event.target).value })"
                    ></textarea>
                  </app-form-field>
                </div>
                <app-field-help [scope]="scope" page="systemForm" field="intended_purpose" />
              </div>
              <div class="md:col-span-2">
                <app-form-field
                  [label]="'aiGovernance.fields.description' | transloco"
                  inputId="ais-desc"
                >
                  <textarea
                    id="ais-desc"
                    rows="3"
                    maxlength="10000"
                    [value]="form().description"
                    (input)="patch({ description: $any($event.target).value })"
                  ></textarea>
                </app-form-field>
              </div>
              <div>
                <app-form-field [label]="'aiGovernance.fields.role' | transloco" inputId="ais-role">
                  <select
                    id="ais-role"
                    (change)="patch({ ai_act_role: $any($event.target).value })"
                  >
                    @for (r of roles; track r) {
                      <option [value]="r" [selected]="form().ai_act_role === r">
                        {{ roleKey(r) | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <div class="mt-1 flex items-center gap-2">
                  <app-field-help [scope]="scope" page="systemForm" field="ai_act_role" />
                  <app-ask-about
                    [prompt]="'aiGovernance.systemForm.askRole' | transloco"
                    field="ai_act_role"
                    labelKey="aiGovernance.wizard.askAbout"
                  />
                </div>
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.fields.status' | transloco"
                  inputId="ais-status"
                >
                  <select id="ais-status" (change)="patch({ status: $any($event.target).value })">
                    @for (s of statuses; track s) {
                      <option [value]="s" [selected]="form().status === s">
                        {{ statusKey(s) | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.fields.provider' | transloco"
                  inputId="ais-provider"
                >
                  <input
                    id="ais-provider"
                    type="text"
                    maxlength="200"
                    [value]="form().provider_name"
                    (input)="patch({ provider_name: $any($event.target).value })"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="systemForm" field="provider_name" />
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.fields.models' | transloco"
                  inputId="ais-models"
                >
                  <input
                    id="ais-models"
                    type="text"
                    [placeholder]="'aiGovernance.systemForm.tagsPlaceholder' | transloco"
                    [value]="form().models"
                    (input)="patch({ models: $any($event.target).value })"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="systemForm" field="models" />
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.fields.dataCategories' | transloco"
                  inputId="ais-data"
                >
                  <input
                    id="ais-data"
                    type="text"
                    [placeholder]="'aiGovernance.systemForm.tagsPlaceholder' | transloco"
                    [value]="form().data_categories"
                    (input)="patch({ data_categories: $any($event.target).value })"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="systemForm" field="data_categories" />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 pb-2 text-[13.5px] text-fg">
                  <input
                    type="checkbox"
                    [checked]="form().uses_personal_data"
                    (change)="patch({ uses_personal_data: $any($event.target).checked })"
                  />
                  {{ 'aiGovernance.fields.usesPersonalData' | transloco }}
                </label>
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.fields.owner' | transloco"
                  inputId="ais-owner"
                >
                  <app-ai-user-select
                    selectId="ais-owner"
                    [value]="form().owner_user_id"
                    [currentName]="ownerName()"
                    (valueChange)="patch({ owner_user_id: $event })"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="systemForm" field="owner" />
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.fields.department' | transloco"
                  inputId="ais-dept"
                >
                  <select
                    id="ais-dept"
                    (change)="patch({ department_id: $any($event.target).value })"
                  >
                    <option value="" [selected]="!form().department_id">
                      {{ 'aiGovernance.common.none' | transloco }}
                    </option>
                    @for (d of departments(); track d.id) {
                      <option [value]="d.id" [selected]="form().department_id === d.id">
                        {{ d.name }}
                      </option>
                    }
                  </select>
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.fields.nextReview' | transloco"
                  inputId="ais-review"
                >
                  <input
                    id="ais-review"
                    type="date"
                    [value]="form().next_review"
                    (input)="patch({ next_review: $any($event.target).value })"
                  />
                </app-form-field>
              </div>
              @if (id()) {
                <div class="md:col-span-2">
                  <app-form-field
                    [label]="'aiGovernance.fields.changeReason' | transloco"
                    inputId="ais-reason"
                  >
                    <input
                      id="ais-reason"
                      type="text"
                      maxlength="1000"
                      [value]="changeReason()"
                      (input)="changeReason.set($any($event.target).value)"
                    />
                  </app-form-field>
                </div>
              }
            </div>
          </app-card>
          @if (error()) {
            <app-alert tone="error">{{ error()! | transloco }}</app-alert>
          }
          <div class="flex flex-wrap justify-end gap-2">
            <app-button variant="secondary" (click)="cancel()">{{
              'aiGovernance.common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()" data-testid="system-save">
              {{
                (id() ? 'aiGovernance.common.save' : 'aiGovernance.systemForm.create') | transloco
              }}
            </app-button>
          </div>
        </form>
      } @else {
        <p class="text-[14px] text-fg-muted">{{ 'aiGovernance.common.loading' | transloco }}</p>
      }
    </app-ai-gov-page>
  `,
})
export class AiSystemForm {
  private readonly api = inject(AiGovernanceApi);
  private readonly assigneeOptions = inject(AssigneeOptionsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Route param on the edit page; absent on "new". */
  readonly id = input<string | undefined>(undefined);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly roles = AI_ACT_ROLES;
  protected readonly statuses = SYSTEM_STATUSES;
  protected readonly roleKey = roleKey;
  protected readonly statusKey = statusKey;

  protected readonly form = signal<SystemFormValue>(emptySystemForm());
  protected readonly ownerName = signal<string | null>(null);
  protected readonly changeReason = signal('');
  /** Departments of the org (from the shared people / department options). */
  protected readonly departments = computed(() =>
    this.assigneeOptions
      .options()
      .departments.filter((d) => d.value.startsWith('department:'))
      .map((d) => ({ id: d.value.slice('department:'.length), name: d.label })),
  );
  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly ready = computed(() => !this.id() || this.loaded());
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.form().name || this.language.translate('aiGovernance.systemForm.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.assigneeOptions.ensureLoaded();
        if (id) {
          this.api.getSystem(orgId, id).subscribe({
            next: (system) => {
              this.form.set(systemToForm(system));
              this.ownerName.set(system.owner?.name ?? null);
              this.loaded.set(true);
            },
            error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
          });
        }
      });
    });
  }

  protected patch(change: Partial<SystemFormValue>): void {
    this.form.update((v) => ({ ...v, ...change }));
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/ai-governance/systems', id] : ['/ai-governance/systems']);
  }

  protected submit(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || !this.form().name.trim()) {
      return;
    }
    const body = formToRequest(this.form());
    const id = this.id();
    this.saving.set(true);
    this.error.set(null);
    const request$ = id
      ? this.api.updateSystem(orgId, id, {
          ...body,
          change_reason: this.changeReason().trim() || null,
        })
      : this.api.createSystem(orgId, body);
    request$.subscribe({
      next: (system) => {
        this.saving.set(false);
        this.notifications.success(
          id ? 'aiGovernance.systemForm.updated' : 'aiGovernance.systemForm.created',
          { code: system.code },
        );
        void this.router.navigate(['/ai-governance/systems', system.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(aiGovernanceErrorKey(err));
      },
    });
  }
}
