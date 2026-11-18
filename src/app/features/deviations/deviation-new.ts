import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { hasAnyPermission } from '../../core/auth/permission';
import {
  invalidDataErrors,
  notifyDeviationSaveError,
  recordDataErrors,
} from '../../core/deviations/deviation-errors';
import {
  CreateDeviationRequest,
  DEVIATION_LINK_TYPES,
  DeviationLinkInput,
  DeviationLinkType,
  DeviationType,
  DeviationVisibility,
  RegisterFromTextResult,
  Severity,
  Source,
} from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RecordTypeVersion } from '../../core/records/record.models';
import { RecordsApi } from '../../core/records/records-api';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { DynamicForm } from '../../shared/records/dynamic-form';
import { defaultData } from '../../shared/records/form-model';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { DeviationClassificationFields } from './classification-fields';
import {
  DEVIATIONS_ROOT_CRUMB,
  PersonOption,
  clausesFromRefs,
  eventTimesErrorKey,
  localToUtc,
  personOptions,
} from './deviation-display';
import {
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  fieldErrorKeys,
  severityLabelKey,
  sourceLabelKey,
  standardLabelKey,
} from './deviation-enums';
import { DynamicField, DynamicFieldOption } from './dynamic-field';
import { groupFieldsIntoSections } from './types/type-schema';
import { DeviationEventFacts } from './ui/event-facts-fields';
import { DeviationFormRow } from './ui/form-row';

/**
 * F8 links for a new deviation from the query string
 * (`?link_entity_type=inspection_finding&link_entity_id=<id>&link_type=caused_by`), so
 * other modules can open "Register a deviation" pre-linked to their record.
 */
export function linksFromParams(params: {
  get(name: string): string | null;
}): DeviationLinkInput[] {
  const entityType = params.get('link_entity_type');
  const entityId = params.get('link_entity_id');
  if (!entityType || !entityId || !/^[a-z][a-z0-9_]{0,31}$/.test(entityType)) {
    return [];
  }
  const raw = params.get('link_type') ?? 'relates_to';
  const linkType = (DEVIATION_LINK_TYPES as readonly string[]).includes(raw)
    ? (raw as DeviationLinkType)
    : 'relates_to';
  return [{ entity_type: entityType, entity_id: entityId, link_type: linkType }];
}

/**
 * "Nytt avvik" on the shared page frame. Step 1 picks the deviation type; step 2
 * is one form in three titled sections (audit finding 24): "Hva skjedde" (title,
 * description, when / where, the immediate action), "Klassifiser" (severity,
 * source, the requirements it affects, the type's own fields) and "Ansvar" (owner,
 * department, due date, visibility). Root cause is not asked for here: it comes
 * from the analysis on the case. Opened by "create from here" (a finding, a
 * customer complaint) or `?fromRequirement=`, the form is prefilled and links back
 * on save. A 422 maps back onto the type's fields.
 */
@Component({
  selector: 'app-deviation-new',
  imports: [
    TourStepDirective,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    Card,
    Button,
    Icon,
    Badge,
    Alert,
    AskAbout,
    DynamicField,
    DynamicForm,
    AiAssistButton,
    TeachingEmpty,
    FlowBanner,
    HelpStrip,
    LoadingState,
    PageHeader,
    DeviationClassificationFields,
    DeviationEventFacts,
    DeviationFormRow,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-28 sm:px-8 sm:pt-7 sm:pb-12">
      <app-page-header
        titleKey="deviations.new"
        descriptionKey="deviations.create.description"
        [breadcrumbs]="breadcrumbs"
        backLink="/deviations"
      />
      <app-help-strip scope="deviations" page="new" tour="new" lesson="good-deviation-report" />

      <div class="max-w-[760px]">
        <app-flow-banner [flow]="flow()" />

        @if (loadingTypes()) {
          <app-loading-state [rows]="3" />
        } @else if (types().length === 0) {
          <app-card>
            <app-teaching-empty
              scope="deviations"
              page="new"
              [showAction]="isAdmin()"
              (action)="goToTemplates()"
            >
              <div class="flex flex-col items-center gap-2 py-8 text-center">
                <app-icon name="alert" [size]="22" class="text-fg-subtle" />
                <p class="text-body font-semibold text-fg">
                  {{ 'deviations.create.noTypesTitle' | transloco }}
                </p>
                <p class="max-w-[420px] text-ui text-fg-muted">
                  {{ 'deviations.create.noTypesHint' | transloco }}
                </p>
              </div>
            </app-teaching-empty>
          </app-card>
        } @else {
          <app-card class="mb-5 block">
            <div class="flex flex-col gap-2" appTourStep="deviations-describe">
              <label for="dev-freetext" class="text-ui font-semibold text-fg-muted">
                {{ 'deviations.assist.describeLabel' | transloco }}
              </label>
              <textarea
                id="dev-freetext"
                rows="3"
                maxlength="8000"
                [ngModel]="freeText()"
                (ngModelChange)="freeText.set($event)"
                [placeholder]="'deviations.assist.describePlaceholder' | transloco"
                class="w-full rounded-tile border border-border bg-bg px-3 py-2.5 text-ui text-fg outline-none focus:border-accent"
              ></textarea>
              <div class="flex flex-wrap items-center gap-2">
                <app-ai-assist-button
                  assist="deviations.register_from_text"
                  labelKey="deviations.assist.registerFromText"
                  [input]="registerInput()"
                  [disabled]="freeText().trim().length < 10"
                  (result)="applyDraft($event)"
                />
                <span class="text-meta text-fg-muted">{{
                  'deviations.assist.describeHint' | transloco
                }}</span>
              </div>
              @if (draftMissing().length) {
                <p class="text-meta text-fg-muted" data-testid="draft-missing">
                  {{
                    'deviations.assist.missing' | transloco: { fields: draftMissing().join(', ') }
                  }}
                </p>
              }
            </div>
          </app-card>

          @if (!selectedType()) {
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{ 'deviations.create.pickType' | transloco }}
            </h2>
            <div class="grid gap-2.5 sm:grid-cols-2" data-testid="type-picker">
              @for (type of types(); track type.id) {
                <button
                  type="button"
                  (click)="selectType(type)"
                  class="flex flex-col gap-1.5 rounded-card border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <span class="flex flex-wrap items-center gap-2">
                    <span class="font-mono text-meta text-fg-subtle">{{ type.code_prefix }}</span>
                    <span class="text-body font-semibold text-fg">{{ type.name }}</span>
                    @if (type.record_type_id) {
                      <app-badge tone="accent">{{
                        'deviations.wf.workflowBadge' | transloco
                      }}</app-badge>
                    }
                  </span>
                  @if (type.description) {
                    <span class="text-meta text-fg-muted">{{ type.description }}</span>
                  }
                  @if (type.standards.length) {
                    <span class="mt-0.5 flex flex-wrap gap-1">
                      @for (std of type.standards; track std) {
                        <app-badge tone="neutral">{{
                          standardLabelKey(std) | transloco
                        }}</app-badge>
                      }
                    </span>
                  }
                </button>
              }
            </div>
          } @else {
            @let type = selectedType()!;
            <form class="flex flex-col gap-5" (ngSubmit)="submit()" novalidate>
              <div
                class="flex flex-wrap items-center gap-2 rounded-tile border border-border bg-surface-2 px-3 py-2"
              >
                <span class="text-meta text-fg-muted">{{
                  'deviations.create.typeLabel' | transloco
                }}</span>
                <span class="font-mono text-meta text-fg-subtle">{{ type.code_prefix }}</span>
                <span class="text-ui font-semibold text-fg">{{ type.name }}</span>
                <button
                  type="button"
                  (click)="changeType()"
                  class="ml-auto text-meta font-semibold text-accent hover:underline"
                >
                  {{ 'deviations.create.changeType' | transloco }}
                </button>
              </div>

              <app-card>
                <h2 class="mb-1 font-display text-section font-bold text-fg">
                  {{ 'deviations.create.sections.what' | transloco }}
                </h2>
                <p class="mb-4 text-meta text-fg-muted">
                  {{ 'deviations.create.sections.whatHint' | transloco }}
                </p>
                <div class="flex flex-col gap-4">
                  <app-deviation-form-row
                    labelKey="deviations.create.fields.title"
                    inputId="dev-title"
                    help="title"
                    [required]="true"
                    [errorKey]="titleError() ? 'deviations.create.titleRequired' : null"
                  >
                    <input
                      id="dev-title"
                      type="text"
                      name="title"
                      maxlength="255"
                      autocomplete="off"
                      [ngModel]="title()"
                      (ngModelChange)="title.set($event); titleError.set(false)"
                    />
                  </app-deviation-form-row>
                  <app-deviation-form-row
                    labelKey="deviations.create.fields.description"
                    inputId="dev-desc"
                    help="description"
                  >
                    <textarea
                      id="dev-desc"
                      name="description"
                      rows="3"
                      [ngModel]="description()"
                      (ngModelChange)="description.set($event)"
                    ></textarea>
                  </app-deviation-form-row>
                  <app-deviation-event-facts
                    idPrefix="dev"
                    [(occurred)]="occurred"
                    [(detected)]="detected"
                    [(location)]="location"
                    [(immediateAction)]="immediateAction"
                  />
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-1 font-display text-section font-bold text-fg">
                  {{ 'deviations.create.sections.classify' | transloco }}
                </h2>
                <p class="mb-4 text-meta text-fg-muted">
                  {{ 'deviations.create.sections.classifyHint' | transloco }}
                </p>
                <div class="flex flex-col gap-4">
                  <div class="grid gap-4 sm:grid-cols-2">
                    <app-deviation-form-row
                      labelKey="deviations.create.fields.severity"
                      inputId="dev-severity"
                      help="severity"
                    >
                      <app-ask-about
                        ask
                        field="severity"
                        [fieldLabel]="'deviations.create.fields.severity' | transloco"
                      />
                      <select
                        id="dev-severity"
                        name="severity"
                        [ngModel]="severity()"
                        (ngModelChange)="severity.set($event)"
                      >
                        @for (option of severityOptions; track option) {
                          <option [value]="option">
                            {{ severityLabelKey(option) | transloco }}
                          </option>
                        }
                      </select>
                    </app-deviation-form-row>
                    <app-deviation-form-row
                      labelKey="deviations.create.fields.source"
                      inputId="dev-source"
                      help="source"
                    >
                      <select
                        id="dev-source"
                        name="source"
                        [ngModel]="source()"
                        (ngModelChange)="source.set($event)"
                      >
                        @for (option of sourceOptions; track option) {
                          <option [value]="option">{{ sourceLabelKey(option) | transloco }}</option>
                        }
                      </select>
                    </app-deviation-form-row>
                  </div>
                  <app-deviation-classification-fields
                    idPrefix="dev"
                    [typical]="type.default_clauses ?? []"
                    [(refs)]="refs"
                    [(tags)]="tags"
                  />
                </div>
              </app-card>

              @if (recordVersion(); as version) {
                <app-card>
                  <h2 class="mb-3 font-display text-section font-bold text-fg">
                    {{ 'deviations.wf.fieldsTitle' | transloco }}
                  </h2>
                  <app-dynamic-form
                    [fields]="version.fields"
                    [layout]="version.layout"
                    [value]="data()"
                    [errors]="recordErrors()"
                    [people]="users()"
                    [departments]="departments()"
                    (valueChange)="setRecordData($event)"
                  />
                </app-card>
              } @else if (loadingRecordType()) {
                <app-loading-state [rows]="2" />
              }

              @if (schemaSections().length) {
                <app-card>
                  <h2 class="mb-4 font-display text-section font-bold text-fg">
                    {{ 'deviations.create.sections.typeFields' | transloco: { type: type.name } }}
                  </h2>
                  <div class="flex flex-col gap-6">
                    @for (section of schemaSections(); track section.title) {
                      <div class="flex flex-col gap-4">
                        @if (!section.isDefault) {
                          <h3 class="text-ui font-semibold text-fg-muted">{{ section.title }}</h3>
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

              <app-card>
                <h2 class="mb-1 font-display text-section font-bold text-fg">
                  {{ 'deviations.create.sections.who' | transloco }}
                </h2>
                <p class="mb-4 text-meta text-fg-muted">
                  {{ 'deviations.create.sections.whoHint' | transloco }}
                </p>
                <div class="grid gap-4 sm:grid-cols-2">
                  <app-deviation-form-row
                    labelKey="deviations.create.fields.owner"
                    inputId="dev-owner"
                    help="owner"
                  >
                    <select
                      id="dev-owner"
                      name="owner"
                      [ngModel]="ownerId()"
                      (ngModelChange)="ownerId.set($event)"
                    >
                      <option value="">{{ 'deviations.create.unassigned' | transloco }}</option>
                      @for (user of users(); track user.id) {
                        <option [value]="user.id">{{ user.name }}</option>
                      }
                    </select>
                  </app-deviation-form-row>
                  @if (departments().length) {
                    <app-deviation-form-row
                      labelKey="deviations.create.fields.department"
                      inputId="dev-dept"
                    >
                      <select
                        id="dev-dept"
                        name="department"
                        [ngModel]="departmentId()"
                        (ngModelChange)="departmentId.set($event)"
                      >
                        <option value="">{{ 'deviations.create.none' | transloco }}</option>
                        @for (dept of departments(); track dept.id) {
                          <option [value]="dept.id">{{ dept.name }}</option>
                        }
                      </select>
                    </app-deviation-form-row>
                  }
                  <app-deviation-form-row
                    labelKey="deviations.create.fields.due"
                    inputId="dev-due"
                    help="due"
                  >
                    <input
                      id="dev-due"
                      type="date"
                      name="due"
                      [ngModel]="dueAt()"
                      (ngModelChange)="dueAt.set($event)"
                    />
                  </app-deviation-form-row>
                  <app-deviation-form-row
                    labelKey="deviations.create.fields.visibility"
                    inputId="dev-visibility"
                    help="visibility"
                  >
                    <select
                      id="dev-visibility"
                      name="visibility"
                      [ngModel]="visibility()"
                      (ngModelChange)="visibility.set($event)"
                    >
                      <option value="organization">
                        {{ 'deviations.visibility.organization' | transloco }}
                      </option>
                      <option value="restricted">
                        {{ 'deviations.visibility.restricted' | transloco }}
                      </option>
                    </select>
                  </app-deviation-form-row>
                </div>
              </app-card>

              @if (links().length) {
                <app-alert tone="info">{{
                  'deviations.wf.linkedFrom' | transloco: { count: links().length }
                }}</app-alert>
              }

              <div
                class="sticky bottom-0 z-20 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
              >
                <a routerLink="/deviations" tabindex="-1">
                  <app-button type="button" variant="ghost">
                    {{ 'deviations.create.cancel' | transloco }}
                  </app-button>
                </a>
                <app-button type="submit" [loading]="saving()" data-testid="deviation-submit">
                  <app-icon name="check" [size]="15" />
                  {{ 'deviations.create.submit' | transloco }}
                </app-button>
              </div>
            </form>
          }
        }
      </div>
    </div>
  `,
})
export class DeviationNew {
  private readonly api = inject(DeviationsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly recordsApi = inject(RecordsApi);
  private readonly flows = inject(CreateFlowService);

  /** "Create from here" / `?fromRequirement=`: prefill and link back on save. */
  protected readonly flow = this.flows.consume(this.route, { targetType: 'deviation' });

  protected readonly breadcrumbs = [DEVIATIONS_ROOT_CRUMB, { labelKey: 'deviations.new' }];
  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly freeText = signal('');
  protected readonly draftMissing = signal<readonly string[]>([]);
  protected readonly registerInput = computed(() => ({
    text: this.freeText().trim(),
    ...(this.selectedType() ? { type_id: this.selectedType()!.id } : {}),
  }));
  protected readonly recordVersion = signal<RecordTypeVersion | null>(null);
  protected readonly loadingRecordType = signal(false);
  protected readonly recordErrors = signal<Readonly<Record<string, string>>>({});
  protected readonly links = signal<readonly DeviationLinkInput[]>([]);
  protected readonly isAdmin = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'deviations:admin'),
  );

  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly sourceOptions = SOURCE_OPTIONS;
  protected readonly severityLabelKey = severityLabelKey;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly standardLabelKey = standardLabelKey;

  protected readonly types = signal<readonly DeviationType[]>([]);
  protected readonly loadingTypes = signal(true);
  protected readonly selectedType = signal<DeviationType | null>(null);
  protected readonly saving = signal(false);

  protected readonly users = signal<readonly PersonOption[]>([]);
  protected readonly departments = signal<readonly { id: string; name: string }[]>([]);

  // What happened
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly occurred = signal('');
  protected readonly detected = signal('');
  protected readonly location = signal('');
  protected readonly immediateAction = signal('');
  // Classify
  protected readonly severity = signal<Severity>('medium');
  protected readonly source = signal<Source>('internal');
  protected readonly refs = signal<readonly string[]>([]);
  protected readonly tags = signal<readonly string[]>([]);
  // Who
  protected readonly ownerId = signal('');
  protected readonly departmentId = signal('');
  protected readonly dueAt = signal('');
  protected readonly visibility = signal<DeviationVisibility>('organization');

  protected readonly data = signal<Record<string, unknown>>({});
  protected readonly dataErrors = signal<Record<string, string>>({});
  protected readonly titleError = signal(false);

  protected readonly schemaSections = computed(() => {
    const type = this.selectedType();
    if (!type || type.record_type_id) {
      return [];
    }
    const defaultTitle = this.language.translate('deviations.create.detailsSection');
    return groupFieldsIntoSections(type.schema, defaultTitle);
  });

  private currentOrgId: string | null = null;
  private prefilled = false;

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'deviation',
      view: 'new',
      title: this.title().trim() || null,
      requirements: this.refs().length ? [...this.refs()] : undefined,
    }));
    this.links.set(linksFromParams(this.route.snapshot.queryParamMap));

    effect(() => {
      const orgId = this.orgId();
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigateByUrl('/deviations');
        return;
      }
      this.currentOrgId = orgId;
      if (orgId) {
        untracked(() => {
          this.loadTypes(orgId);
          this.loadSubjects(orgId);
        });
      }
    });

    // Prefill once from the flow (title, description, source, the requirement).
    effect(() => {
      const flow = this.flow();
      if (!flow || this.prefilled) {
        return;
      }
      this.prefilled = true;
      untracked(() => {
        const p = flow.prefill;
        if (typeof p.title === 'string' && !this.title()) {
          this.title.set(p.title.slice(0, 255));
        }
        if (typeof p.description === 'string' && !this.description()) {
          this.description.set(p.description);
        }
        const source = p['source'];
        if (typeof source === 'string' && (SOURCE_OPTIONS as readonly string[]).includes(source)) {
          this.source.set(source as Source);
        }
        if (flow.requirementRef) {
          const ref = flow.requirementRef.replace(/\.r\d+$/, '');
          const [clause] = clausesFromRefs([ref]);
          if (clause && !this.refs().includes(`${clause.standard}:${clause.clause}`)) {
            this.refs.set([...this.refs(), `${clause.standard}:${clause.clause}`]);
          }
        }
      });
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

  protected selectType(type: DeviationType, data: Record<string, unknown> = {}): void {
    this.selectedType.set(type);
    this.data.set(data);
    this.dataErrors.set({});
    this.recordErrors.set({});
    this.recordVersion.set(null);
    const orgId = this.orgId();
    if (orgId && type.record_type_id) {
      this.loadingRecordType.set(true);
      this.recordsApi.getRecordType(orgId, type.record_type_id).subscribe({
        next: (recordType) => {
          this.loadingRecordType.set(false);
          const version = recordType.current_version;
          this.recordVersion.set(version);
          if (version) {
            this.data.set({ ...defaultData(version.fields), ...this.data() });
          }
        },
        error: () => this.loadingRecordType.set(false),
      });
    }
  }

  protected changeType(): void {
    this.selectedType.set(null);
    this.dataErrors.set({});
    this.recordErrors.set({});
    this.recordVersion.set(null);
  }

  protected goToTemplates(): void {
    void this.router.navigateByUrl('/settings/modules/deviations/templates');
  }

  protected setRecordData(value: Record<string, unknown>): void {
    const errors = this.recordErrors();
    const stale = Object.keys(errors).filter((key) => value[key] !== this.data()[key]);
    if (stale.length) {
      const next = { ...errors };
      for (const key of stale) {
        delete next[key];
      }
      this.recordErrors.set(next);
    }
    this.data.set(value);
  }

  /** Fill the form from the drafted text (the user reviews before saving). */
  protected applyDraft(result: unknown): void {
    const draft = result as RegisterFromTextResult | null;
    if (!draft || typeof draft !== 'object') {
      return;
    }
    const type = this.types().find((t) => t.id === draft.type_id) ?? this.selectedType();
    const data = draft.data && typeof draft.data === 'object' ? draft.data : {};
    if (type && type.id !== this.selectedType()?.id) {
      this.selectType(type, { ...data });
    } else if (type) {
      this.data.set({ ...this.data(), ...data });
    }
    if (draft.title) {
      this.title.set(draft.title.slice(0, 255));
      this.titleError.set(false);
    }
    if (draft.description) {
      this.description.set(draft.description);
    }
    if (draft.severity) {
      this.severity.set(draft.severity);
    }
    if (draft.source) {
      this.source.set(draft.source);
    }
    this.draftMissing.set(Array.isArray(draft.missing) ? draft.missing : []);
    this.notifications.info('deviations.assist.draftApplied');
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
      this.notifications.error('deviations.create.fixTitle');
      document.getElementById('dev-title')?.focus();
      return;
    }
    const timeError = eventTimesErrorKey(this.occurred(), this.detected());
    if (timeError) {
      this.notifications.error(timeError);
      return;
    }
    this.titleError.set(false);

    const clauses = clausesFromRefs(this.refs());
    const body: CreateDeviationRequest = {
      type_id: type.id,
      title,
      description: this.description().trim() || undefined,
      standards: type.standards.length ? type.standards : undefined,
      clauses: clauses.length ? clauses : undefined,
      tags: this.tags().length ? this.tags() : undefined,
      severity: this.severity(),
      source: this.source(),
      owner_user_id: this.ownerId() || undefined,
      department_id: this.departmentId() || undefined,
      due_at: this.dueAt() || undefined,
      occurred_at: localToUtc(this.occurred()) ?? undefined,
      detected_at: localToUtc(this.detected()) ?? undefined,
      location: this.location().trim() || undefined,
      immediate_action: this.immediateAction().trim() || undefined,
      data: this.data(),
      visibility: this.visibility(),
      links: this.links().length ? this.links() : undefined,
    };

    this.saving.set(true);
    this.dataErrors.set({});
    this.api.createDeviation(orgId, body).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.notifications.success('deviations.create.createdToast');
        if (this.flow()) {
          this.flows.complete(created.id, 'deviation').subscribe();
        }
        void this.router.navigate(['/deviations', created.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.handleError(error);
      },
    });
  }

  private handleError(error: unknown): void {
    const recordFieldErrors = recordDataErrors(error);
    if (recordFieldErrors) {
      this.recordErrors.set(recordFieldErrors);
      this.notifications.error('deviations.create.validationToast');
      return;
    }
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
        const active = types.filter((t) => t.is_active);
        this.types.set(active);
        this.loadingTypes.set(false);
        // One type: skip the picker.
        if (active.length === 1 && !this.selectedType()) {
          this.selectType(active[0]);
        }
      },
      error: () => this.loadingTypes.set(false),
    });
  }

  private loadSubjects(orgId: string): void {
    this.api.listAccessSubjects(orgId).subscribe({
      next: (subjects) => {
        this.users.set(personOptions(subjects.users));
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name })));
        const me = this.auth.user()?.id;
        if (me && !this.ownerId() && subjects.users.some((u) => u.id === me)) {
          this.ownerId.set(me);
        }
      },
    });
  }
}
