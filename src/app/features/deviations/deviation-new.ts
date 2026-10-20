import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import {
  CreateDeviationRequest,
  DeviationType,
  DeviationVisibility,
  RootCauseMethod,
  Severity,
  Source,
  Standard,
} from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import {
  invalidDataErrors,
  notifyDeviationSaveError,
} from '../../core/deviations/deviation-errors';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import {
  ROOT_CAUSE_METHOD_OPTIONS,
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  fieldErrorKeys,
  rootCauseMethodLabelKey,
  severityLabelKey,
  sourceLabelKey,
  standardLabelKey,
} from './deviation-enums';
import { DeviationClassificationFields } from './classification-fields';
import { ClauseRow, toClauseRefs } from './deviation-edit';
import { DynamicField, DynamicFieldOption } from './dynamic-field';
import { groupFieldsIntoSections } from './types/type-schema';

/**
 * New deviation flow, scoped to the currently selected org. Step 1 picks a
 * deviation type (from `listTypes`); step 2 is the form — core fields plus the
 * type's schema fields rendered via {@link DynamicField} into the `data` object.
 * On submit a 422 `{detail:{data:{key:msg}}}` maps back onto the dynamic fields;
 * a 400 surfaces as a toast. On success it navigates to the new deviation's
 * detail page with a success toast. Gated upstream on `deviations:write`.
 * Navigates back to the list on org switch.
 */
@Component({
  selector: 'app-deviation-new',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    Card,
    Button,
    Icon,
    Badge,
    DynamicField,
    DeviationClassificationFields,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-8 pt-7 pb-12">
      <a
        routerLink="/deviations"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.backToList' | transloco }}
      </a>

      <h1 class="mb-[18px] font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
        {{ 'deviations.new' | transloco }}
      </h1>

      @if (loadingTypes()) {
        <app-card>
          <p class="py-6 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else if (types().length === 0) {
        <app-card>
          <div class="flex flex-col items-center gap-2 py-8 text-center">
            <app-icon name="alert" [size]="22" class="text-fg-subtle" />
            <p class="text-[14px] font-semibold text-fg">
              {{ 'deviations.create.noTypesTitle' | transloco }}
            </p>
            <p class="max-w-[420px] text-[13px] text-fg-muted">
              {{ 'deviations.create.noTypesHint' | transloco }}
            </p>
          </div>
        </app-card>
      } @else if (!selectedType()) {
        <p class="mb-3 text-[13px] font-semibold text-fg-muted">
          {{ 'deviations.create.pickType' | transloco }}
        </p>
        <div class="grid gap-2.5 sm:grid-cols-2">
          @for (type of types(); track type.id) {
            <button
              type="button"
              (click)="selectType(type)"
              class="flex flex-col gap-1.5 rounded-card border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <span class="flex items-center gap-2">
                <span class="font-mono text-[12px] text-fg-subtle">{{ type.code_prefix }}</span>
                <span class="text-[14px] font-semibold text-fg">{{ type.name }}</span>
              </span>
              @if (type.description) {
                <span class="text-[12.5px] text-fg-muted">{{ type.description }}</span>
              }
              @if (type.standards.length) {
                <span class="mt-0.5 flex flex-wrap gap-1">
                  @for (std of type.standards; track std) {
                    <app-badge tone="neutral">{{ standardLabelKey(std) | transloco }}</app-badge>
                  }
                </span>
              }
            </button>
          }
        </div>
      } @else {
        <form class="flex flex-col gap-4" (ngSubmit)="submit()">
          <app-card>
            <div class="mb-4 flex items-center gap-2">
              <span class="font-mono text-[12px] text-fg-subtle">{{
                selectedType()!.code_prefix
              }}</span>
              <span class="text-[14px] font-semibold text-fg">{{ selectedType()!.name }}</span>
              <button
                type="button"
                (click)="changeType()"
                class="ml-auto text-[12.5px] font-semibold text-accent hover:underline"
              >
                {{ 'deviations.create.changeType' | transloco }}
              </button>
            </div>

            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1.5">
                <label for="dev-title" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.create.fields.title' | transloco }}
                  <span class="text-fail" aria-hidden="true">*</span>
                </label>
                <input
                  id="dev-title"
                  type="text"
                  [ngModel]="title()"
                  (ngModelChange)="title.set($event)"
                  name="title"
                  autocomplete="off"
                  class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                />
                @if (titleError()) {
                  <p class="text-[12px] font-medium text-fail">
                    {{ 'deviations.create.titleRequired' | transloco }}
                  </p>
                }
              </div>

              <div class="flex flex-col gap-1.5">
                <label for="dev-desc" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.create.fields.description' | transloco }}
                </label>
                <textarea
                  id="dev-desc"
                  [ngModel]="description()"
                  (ngModelChange)="description.set($event)"
                  name="description"
                  rows="3"
                  class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                ></textarea>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label for="dev-severity" class="text-[13px] font-semibold text-fg-muted">
                    {{ 'deviations.create.fields.severity' | transloco }}
                  </label>
                  <div class="cf-select">
                    <select
                      id="dev-severity"
                      [ngModel]="severity()"
                      (ngModelChange)="severity.set($event)"
                      name="severity"
                    >
                      @for (option of severityOptions; track option) {
                        <option [value]="option">{{ severityLabelKey(option) | transloco }}</option>
                      }
                    </select>
                  </div>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label for="dev-source" class="text-[13px] font-semibold text-fg-muted">
                    {{ 'deviations.create.fields.source' | transloco }}
                  </label>
                  <div class="cf-select">
                    <select
                      id="dev-source"
                      [ngModel]="source()"
                      (ngModelChange)="source.set($event)"
                      name="source"
                    >
                      @for (option of sourceOptions; track option) {
                        <option [value]="option">{{ sourceLabelKey(option) | transloco }}</option>
                      }
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </app-card>

          <app-card>
            <app-deviation-classification-fields
              idPrefix="dev"
              [(standards)]="standards"
              [(clauses)]="clauses"
              [(tags)]="tags"
            />
          </app-card>

          <app-card>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label for="dev-owner" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.create.fields.owner' | transloco }}
                </label>
                <div class="cf-select">
                  <select
                    id="dev-owner"
                    [ngModel]="ownerId()"
                    (ngModelChange)="ownerId.set($event)"
                    name="owner"
                  >
                    <option value="">{{ 'deviations.create.unassigned' | transloco }}</option>
                    @for (user of users(); track user.id) {
                      <option [value]="user.id">{{ user.name }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="dev-dept" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.create.fields.department' | transloco }}
                </label>
                <div class="cf-select">
                  <select
                    id="dev-dept"
                    [ngModel]="departmentId()"
                    (ngModelChange)="departmentId.set($event)"
                    name="department"
                  >
                    <option value="">{{ 'deviations.create.none' | transloco }}</option>
                    @for (dept of departments(); track dept.id) {
                      <option [value]="dept.id">{{ dept.name }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="dev-due" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.create.fields.due' | transloco }}
                </label>
                <input
                  id="dev-due"
                  type="date"
                  [ngModel]="dueAt()"
                  (ngModelChange)="dueAt.set($event)"
                  name="due"
                  class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="dev-visibility" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.create.fields.visibility' | transloco }}
                </label>
                <div class="cf-select">
                  <select
                    id="dev-visibility"
                    [ngModel]="visibility()"
                    (ngModelChange)="visibility.set($event)"
                    name="visibility"
                  >
                    <option value="organization">
                      {{ 'deviations.visibility.organization' | transloco }}
                    </option>
                    <option value="restricted">
                      {{ 'deviations.visibility.restricted' | transloco }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </app-card>

          <app-card>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label for="dev-rc" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.create.fields.rootCause' | transloco }}
                </label>
                <textarea
                  id="dev-rc"
                  [ngModel]="rootCause()"
                  (ngModelChange)="rootCause.set($event)"
                  name="rootCause"
                  rows="2"
                  class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                ></textarea>
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="dev-rcm" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.create.fields.rootCauseMethod' | transloco }}
                </label>
                <div class="cf-select">
                  <select
                    id="dev-rcm"
                    [ngModel]="rootCauseMethod()"
                    (ngModelChange)="rootCauseMethod.set($event)"
                    name="rootCauseMethod"
                  >
                    <option value="">{{ 'deviations.create.none' | transloco }}</option>
                    @for (option of rootCauseMethodOptions; track option) {
                      <option [value]="option">
                        {{ rootCauseMethodLabelKey(option) | transloco }}
                      </option>
                    }
                  </select>
                </div>
              </div>
            </div>
          </app-card>

          @if (schemaSections().length) {
            <app-card>
              <div class="flex flex-col gap-6">
                @for (section of schemaSections(); track section.title) {
                  <div class="flex flex-col gap-4">
                    @if (!section.isDefault) {
                      <p class="text-[13px] font-semibold text-fg-muted">{{ section.title }}</p>
                    }
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      @for (def of section.fields; track def.key) {
                        <div [class.sm:col-span-2]="def.width === 'full'">
                          <app-dynamic-field
                            [field]="def"
                            [value]="data()[def.key]"
                            [options]="optionsFor(def.type)"
                            [error]="dataErrors()[def.key] ?? null"
                            (valueChange)="setData(def.key, $event)"
                          />
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            </app-card>
          }

          <div class="flex items-center gap-2">
            <app-button type="submit" [loading]="saving()">
              {{ 'deviations.create.submit' | transloco }}
            </app-button>
            <a routerLink="/deviations">
              <app-button type="button" variant="ghost">
                {{ 'deviations.create.cancel' | transloco }}
              </app-button>
            </a>
          </div>
        </form>
      }
    </div>
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class DeviationNew {
  private readonly api = inject(DeviationsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly sourceOptions = SOURCE_OPTIONS;
  protected readonly rootCauseMethodOptions = ROOT_CAUSE_METHOD_OPTIONS;
  protected readonly rootCauseMethodLabelKey = rootCauseMethodLabelKey;
  protected readonly severityLabelKey = severityLabelKey;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly standardLabelKey = standardLabelKey;

  protected readonly types = signal<readonly DeviationType[]>([]);
  protected readonly loadingTypes = signal(true);
  protected readonly selectedType = signal<DeviationType | null>(null);
  protected readonly saving = signal(false);

  protected readonly users = signal<readonly { id: string; name: string }[]>([]);
  protected readonly departments = signal<readonly { id: string; name: string }[]>([]);

  // Core fields
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly severity = signal<Severity>('medium');
  protected readonly source = signal<Source>('internal');
  protected readonly standards = signal<readonly Standard[]>([]);
  protected readonly clauses = signal<readonly ClauseRow[]>([]);
  protected readonly tags = signal<readonly string[]>([]);
  protected readonly ownerId = signal('');
  protected readonly departmentId = signal('');
  protected readonly dueAt = signal('');
  protected readonly rootCause = signal('');
  protected readonly rootCauseMethod = signal<RootCauseMethod | ''>('');
  protected readonly visibility = signal<DeviationVisibility>('organization');

  // Dynamic schema values + per-field server errors
  protected readonly data = signal<Record<string, unknown>>({});
  protected readonly dataErrors = signal<Record<string, string>>({});
  protected readonly titleError = signal(false);

  /** The chosen type's schema grouped into render sections for the 2-col grid. */
  protected readonly schemaSections = computed(() => {
    const type = this.selectedType();
    if (!type) {
      return [];
    }
    const defaultTitle = this.language.translate('deviations.create.detailsSection');
    return groupFieldsIntoSections(type.schema, defaultTitle);
  });

  private currentOrgId: string | null = null;

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigateByUrl('/deviations');
        return;
      }
      this.currentOrgId = orgId;
      if (orgId) {
        this.loadTypes(orgId);
        this.loadSubjects(orgId);
      }
    });
  }

  protected optionsFor(type: string): readonly DynamicFieldOption[] {
    if (type === 'user') {
      return this.users();
    }
    if (type === 'department') {
      return this.departments();
    }
    return [];
  }

  protected selectType(type: DeviationType): void {
    this.selectedType.set(type);
    // Default the editable standards to the type's standards.
    this.standards.set([...type.standards]);
    this.data.set({});
    this.dataErrors.set({});
  }

  protected changeType(): void {
    this.selectedType.set(null);
    this.dataErrors.set({});
  }

  protected setData(key: string, value: unknown): void {
    this.data.set({ ...this.data(), [key]: value });
    const errors = this.dataErrors();
    if (errors[key]) {
      const next = { ...errors };
      delete next[key];
      this.dataErrors.set(next);
    }
  }

  protected submit(): void {
    const orgId = this.orgId();
    const type = this.selectedType();
    if (!orgId || !type || this.saving()) {
      return;
    }
    const title = this.title().trim();
    if (!title) {
      this.titleError.set(true);
      return;
    }
    this.titleError.set(false);

    const clauses = toClauseRefs(this.clauses());

    const body: CreateDeviationRequest = {
      type_id: type.id,
      title,
      description: this.description().trim() || undefined,
      standards: this.standards().length ? this.standards() : undefined,
      clauses: clauses.length ? clauses : undefined,
      tags: this.tags().length ? this.tags() : undefined,
      severity: this.severity(),
      source: this.source(),
      owner_user_id: this.ownerId() || undefined,
      department_id: this.departmentId() || undefined,
      due_at: this.dueAt() || undefined,
      root_cause: this.rootCause().trim() || undefined,
      root_cause_method: this.rootCauseMethod() || undefined,
      data: this.data(),
      visibility: this.visibility(),
    };

    this.saving.set(true);
    this.dataErrors.set({});
    this.api.createDeviation(orgId, body).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.notifications.success('deviations.create.createdToast');
        void this.router.navigate(['/deviations', created.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.handleError(error);
      },
    });
  }

  private handleError(error: unknown): void {
    const fieldErrors = invalidDataErrors(error);
    if (fieldErrors) {
      this.dataErrors.set(fieldErrorKeys(fieldErrors));
      this.notifications.error('deviations.create.validationToast');
      return;
    }
    notifyDeviationSaveError(this.notifications, error);
  }

  private loadTypes(orgId: string): void {
    this.loadingTypes.set(true);
    this.api.listTypes(orgId).subscribe({
      next: (types) => {
        this.types.set(types.filter((t) => t.is_active));
        this.loadingTypes.set(false);
      },
      error: () => this.loadingTypes.set(false),
    });
  }

  private loadSubjects(orgId: string): void {
    this.api.listAccessSubjects(orgId).subscribe({
      next: (subjects) => {
        this.users.set(subjects.users.map((u) => ({ id: u.id, name: u.name })));
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name })));
        // Default owner to the current user when present in the org.
        const me = this.auth.user()?.id;
        if (me && !this.ownerId() && subjects.users.some((u) => u.id === me)) {
          this.ownerId.set(me);
        }
      },
    });
  }
}
