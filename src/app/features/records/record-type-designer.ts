import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, map, of, switchMap } from 'rxjs';
import { hasAnyPermission } from '../../core/auth/permission';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { localize } from '../../core/records/localized';
import {
  DefinitionIssue,
  FieldIssue,
  FieldSpec,
  LayoutSection,
  RecordType,
  RecordTypeVersionSummary,
  Workflow,
  WorkflowAiDraft,
  WorkflowDefinition,
} from '../../core/records/record.models';
import {
  definitionIssues,
  fieldIssues,
  recordsErrorDetail,
  recordsErrorMessage,
} from '../../core/records/records-errors';
import { RecordsApi } from '../../core/records/records-api';
import { DynamicForm } from '../../shared/records/dynamic-form';
import { clientErrors, defaultData } from '../../shared/records/form-model';
import { WorkflowDiagram } from '../../shared/records/workflow-diagram';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { Switch } from '../../shared/ui/switch/switch';
import { AskPanelService } from '../ask/ask-panel.service';
import {
  CODE_PREFIX_RE,
  MODULE_KEYS,
  SectionDraft,
  TYPE_KEY_RE,
  assignSections,
  buildLayout,
  checkDefinition,
  checkFields,
  cleanFields,
  fingerprint,
  moduleLabelKey,
  sectionsFrom,
  slugify,
} from './designer-model';
import { AiDraftPanel } from './designer/ai-draft-panel';
import { FieldBuilder } from './designer/field-builder';
import { VersionEntry, VersionHistory } from './designer/version-history';
import { WorkflowEditor } from './designer/workflow-editor';
import { RecordDraftStore } from './draft-store';
import {
  RecordsFieldHelp,
  RecordsGuideIntro,
  RecordsLesson,
  RecordsWhy,
} from './guidance/records-guidance';
import { providePageContext } from './page-context';

type DesignerTab = 'fields' | 'workflow' | 'preview' | 'history';

/** A workflow drafted together with the type, created when the type is first published. */
interface PendingWorkflow {
  readonly key: string;
  readonly name: string;
  readonly definition: WorkflowDefinition;
}

/**
 * The record type designer (`/settings/record-types/new` and `/:id`): name,
 * key, module and code prefix; the field builder and layout; the workflow the
 * type runs on (an existing one, or one drafted with the assistant that is
 * created on first publish); a live preview of the dynamic form; and the
 * version history. Publishing creates a new immutable version — records keep
 * the version they started on. Read-only without `records:admin`, and while
 * an older version is being viewed.
 */
@Component({
  selector: 'app-record-type-designer',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    DynamicForm,
    WorkflowDiagram,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    Switch,
    AiDraftPanel,
    FieldBuilder,
    VersionHistory,
    WorkflowEditor,
    RecordsGuideIntro,
    RecordsWhy,
    RecordsLesson,
    RecordsFieldHelp,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/settings/record-types"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'records.backToList' | transloco }}
      </a>

      @if (loading()) {
        <p class="py-10 text-center text-[14px] text-fg-muted">
          {{ 'common.loading' | transloco }}
        </p>
      } @else if (notFound()) {
        <app-card>
          <p class="px-2 py-8 text-center text-[14px] text-fg-muted">
            {{ 'records.designer.notFound' | transloco }}
          </p>
        </app-card>
      } @else {
        <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div class="min-w-0">
            <h1 class="font-display text-[24px] font-bold tracking-[-0.025em] text-fg">
              {{
                isNew() ? ('records.designer.newTitle' | transloco) : name() || recordType()?.name
              }}
            </h1>
            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
              @if (recordType(); as rt) {
                <span class="font-mono text-[12px]">{{ rt.key }}</span>
                <app-badge tone="neutral">{{ moduleLabel(rt.module) | transloco }}</app-badge>
                @if (rt.current_version) {
                  <app-badge tone="accent">
                    {{
                      'records.versions.version'
                        | transloco: { version: rt.current_version.version }
                    }}
                  </app-badge>
                }
                @if (rt.template_key) {
                  <app-badge tone="info">{{
                    'records.designer.fromTemplate' | transloco
                  }}</app-badge>
                }
              } @else {
                {{ 'records.designer.newSubtitle' | transloco }}
              }
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <app-button variant="ghost" size="sm" (click)="askAbout()">
              <app-icon name="spark" [size]="15" />
              {{ 'records.designer.ask' | transloco }}
            </app-button>
            @if (canAdmin() && !viewingOld()) {
              <app-button variant="secondary" size="sm" (click)="aiOpen.set(true)">
                <app-icon name="spark" [size]="15" />
                {{ 'records.list.describe' | transloco }}
              </app-button>
            }
            <app-records-lesson lesson="designing-record-types" />
          </div>
        </div>

        <div class="mb-5">
          <app-records-guide-intro page="designer" />
        </div>

        @if (fromDraft()) {
          <div class="mb-4">
            <app-alert tone="info">{{ 'records.designer.draftLoaded' | transloco }}</app-alert>
          </div>
        }
        @if (viewingOld()) {
          <div class="mb-4 flex flex-wrap items-center gap-3">
            <app-alert tone="info">
              {{ 'records.designer.viewingOld' | transloco: { version: viewing() } }}
            </app-alert>
            <app-button variant="secondary" size="sm" (click)="viewVersion(currentVersion()!)">
              {{ 'records.designer.backToCurrent' | transloco }}
            </app-button>
          </div>
        }

        <div class="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div class="flex min-w-0 flex-col gap-5">
            <app-card>
              <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2" [disabled]="readonly()">
                <legend class="sr-only">{{ 'records.designer.basics' | transloco }}</legend>
                <app-form-field [label]="'records.designer.name' | transloco" inputId="rt-name">
                  <input
                    id="rt-name"
                    type="text"
                    maxlength="120"
                    autocomplete="off"
                    [ngModel]="name()"
                    (ngModelChange)="setName($event)"
                    aria-required="true"
                  />
                </app-form-field>
                <app-form-field [label]="'records.designer.module' | transloco" inputId="rt-module">
                  <select
                    id="rt-module"
                    [ngModel]="module()"
                    (ngModelChange)="setModule($event)"
                    [disabled]="!isNew() || readonly()"
                  >
                    @for (key of modules; track key) {
                      <option [value]="key">{{ moduleLabel(key) | transloco }}</option>
                    }
                  </select>
                  <app-records-field-help page="designer" field="module" />
                </app-form-field>
                <app-form-field [label]="'records.designer.key' | transloco" inputId="rt-key">
                  <input
                    id="rt-key"
                    type="text"
                    maxlength="64"
                    autocomplete="off"
                    class="font-mono"
                    [ngModel]="key()"
                    (ngModelChange)="key.set($event); keyTouched.set(true)"
                    [disabled]="!isNew() || readonly()"
                    [attr.aria-invalid]="keyInvalid() || null"
                  />
                  <app-records-field-help page="designer" field="key" />
                </app-form-field>
                <app-form-field
                  [label]="'records.designer.codePrefix' | transloco"
                  inputId="rt-prefix"
                >
                  <input
                    id="rt-prefix"
                    type="text"
                    maxlength="16"
                    autocomplete="off"
                    class="font-mono uppercase"
                    [ngModel]="codePrefix()"
                    (ngModelChange)="codePrefix.set(($event ?? '').toUpperCase())"
                    [attr.aria-invalid]="prefixInvalid() || null"
                    placeholder="NC"
                  />
                  <app-records-field-help page="designer" field="code_prefix" />
                </app-form-field>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'records.designer.description' | transloco"
                    inputId="rt-description"
                  >
                    <textarea
                      id="rt-description"
                      rows="2"
                      maxlength="5000"
                      [ngModel]="description()"
                      (ngModelChange)="description.set($event)"
                    ></textarea>
                  </app-form-field>
                </div>
                <div class="sm:col-span-2">
                  <app-switch
                    [checked]="isActive()"
                    (checkedChange)="!readonly() && isActive.set($event)"
                  >
                    {{ 'records.designer.active' | transloco }}
                  </app-switch>
                </div>
              </fieldset>
              @if (keyInvalid() || prefixInvalid()) {
                <div class="mt-3 flex flex-col gap-1 text-[12px] font-medium text-fail">
                  @if (keyInvalid()) {
                    <p>{{ 'records.designer.keyInvalid' | transloco }}</p>
                  }
                  @if (prefixInvalid()) {
                    <p>{{ 'records.designer.prefixInvalid' | transloco }}</p>
                  }
                </div>
              }
            </app-card>

            <div
              role="tablist"
              class="flex gap-1 overflow-x-auto border-b border-border"
              [attr.aria-label]="'records.designer.tabs' | transloco"
            >
              @for (t of tabs; track t) {
                <button
                  type="button"
                  role="tab"
                  [id]="'rt-tab-' + t"
                  [attr.aria-selected]="tab() === t"
                  [attr.aria-controls]="'rt-panel-' + t"
                  [attr.tabindex]="tab() === t ? 0 : -1"
                  class="-mb-px border-b-2 px-3 py-2 text-[13.5px] font-semibold whitespace-nowrap"
                  [class]="
                    tab() === t
                      ? 'border-accent text-fg'
                      : 'border-transparent text-fg-muted hover:text-fg'
                  "
                  (click)="tab.set(t)"
                  (keydown.arrowRight)="cycleTab(1)"
                  (keydown.arrowLeft)="cycleTab(-1)"
                >
                  {{ 'records.designer.tab.' + t | transloco }}
                  @if (t === 'fields' && fieldProblemCount()) {
                    <span class="ml-1 rounded-full bg-fail-soft px-1.5 text-[11px] text-fail">{{
                      fieldProblemCount()
                    }}</span>
                  }
                </button>
              }
            </div>

            <div
              role="tabpanel"
              [id]="'rt-panel-' + tab()"
              [attr.aria-labelledby]="'rt-tab-' + tab()"
            >
              @switch (tab()) {
                @case ('fields') {
                  <app-field-builder
                    [fields]="fields()"
                    [sections]="sections()"
                    [issues]="allFieldIssues()"
                    [readonly]="readonly()"
                    (fieldsChange)="fields.set($event)"
                    (sectionsChange)="sections.set($event)"
                  />
                }
                @case ('workflow') {
                  <div class="flex flex-col gap-4">
                    @if (pendingWorkflow(); as pw) {
                      <app-alert tone="info">{{
                        'records.designer.pendingWorkflow' | transloco: { name: pw.name }
                      }}</app-alert>
                      <app-workflow-editor
                        [definition]="pw.definition"
                        [issues]="workflowIssues()"
                        [fieldKeys]="fieldKeys()"
                        [userFieldKeys]="userFieldKeys()"
                        [readonly]="readonly()"
                        (definitionChange)="setPendingDefinition($event)"
                      />
                      @if (!readonly()) {
                        <div>
                          <app-button variant="ghost" size="sm" (click)="pendingWorkflow.set(null)">
                            {{ 'records.designer.dropPending' | transloco }}
                          </app-button>
                        </div>
                      }
                    } @else {
                      <app-form-field
                        [label]="'records.designer.workflow' | transloco"
                        inputId="rt-workflow"
                      >
                        <select
                          id="rt-workflow"
                          [ngModel]="workflowVersionId() ?? ''"
                          (ngModelChange)="workflowVersionId.set($event || null)"
                          [disabled]="readonly()"
                        >
                          <option value="">{{ 'records.designer.noWorkflow' | transloco }}</option>
                          @if (pinnedOlder()) {
                            <option [value]="workflowVersionId()">
                              {{ 'records.designer.olderVersion' | transloco }}
                            </option>
                          }
                          @for (wf of moduleWorkflows(); track wf.id) {
                            @if (wf.current_version; as v) {
                              <option [value]="v.id">
                                {{
                                  'records.designer.workflowOption'
                                    | transloco: { name: wf.name, version: v.version }
                                }}
                              </option>
                            }
                          }
                        </select>
                        <app-records-field-help page="designer" field="workflow" />
                      </app-form-field>
                      @if (pinnedOlder()) {
                        <p class="text-[12.5px] text-warn">
                          {{ 'records.designer.olderHint' | transloco }}
                        </p>
                      }
                      @if (boundWorkflow(); as wf) {
                        <app-workflow-diagram [definition]="wf.current_version!.definition" />
                        <div>
                          <a
                            [routerLink]="['/settings/record-types/workflows', wf.id]"
                            class="text-[13px] font-semibold text-accent hover:underline"
                          >
                            {{ 'records.designer.openWorkflow' | transloco: { name: wf.name } }}
                          </a>
                        </div>
                      } @else if (!workflowVersionId()) {
                        <p class="text-[13px] text-fg-muted">
                          {{ 'records.designer.noWorkflowHint' | transloco }}
                        </p>
                      }
                      @if (canAdmin()) {
                        <div>
                          <a
                            [routerLink]="['/settings/record-types/workflows/new']"
                            [queryParams]="{ module: module() }"
                          >
                            <app-button variant="secondary" size="sm">
                              <app-icon name="plus" [size]="14" />
                              {{ 'records.list.newWorkflow' | transloco }}
                            </app-button>
                          </a>
                        </div>
                      }
                    }
                  </div>
                }
                @case ('preview') {
                  <app-card>
                    <p class="mb-4 text-[13px] text-fg-muted">
                      {{ 'records.designer.previewIntro' | transloco }}
                    </p>
                    <app-dynamic-form
                      [fields]="fields()"
                      [layout]="layout()"
                      [value]="previewData()"
                      [errors]="previewErrors()"
                      (valueChange)="previewData.set($event)"
                    />
                    <div class="mt-4 flex flex-wrap gap-2">
                      <app-button variant="secondary" size="sm" (click)="checkPreview()">
                        {{ 'records.designer.checkPreview' | transloco }}
                      </app-button>
                      <app-button variant="ghost" size="sm" (click)="resetPreview()">
                        {{ 'records.designer.resetPreview' | transloco }}
                      </app-button>
                    </div>
                    @if (previewChecked()) {
                      <div class="mt-3">
                        <app-alert [tone]="previewOk() ? 'success' : 'error'">
                          {{
                            (previewOk()
                              ? 'records.designer.previewOk'
                              : 'records.designer.previewProblems'
                            ) | transloco
                          }}
                        </app-alert>
                      </div>
                    }
                  </app-card>
                }
                @case ('history') {
                  <app-card>
                    <app-version-history
                      [versions]="versionEntries()"
                      [current]="currentVersion()"
                      [viewing]="viewing()"
                      (view)="viewVersion($event)"
                    />
                  </app-card>
                }
              }
            </div>
          </div>

          <aside class="flex flex-col gap-4">
            @if (canAdmin() && !viewingOld()) {
              <app-card>
                <h2 class="mb-2 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
                  {{ 'records.designer.publish' | transloco }}
                </h2>
                <p class="mb-3 text-[12.5px] text-fg-muted">
                  {{
                    (dirtySchema() || isNew()
                      ? 'records.designer.publishHint'
                      : 'records.designer.upToDate'
                    ) | transloco
                  }}
                </p>
                <app-form-field
                  [label]="'records.designer.changeNote' | transloco"
                  inputId="rt-note"
                >
                  <textarea
                    id="rt-note"
                    rows="2"
                    maxlength="2000"
                    [ngModel]="changeNote()"
                    (ngModelChange)="changeNote.set($event)"
                    [placeholder]="'records.designer.changeNotePlaceholder' | transloco"
                  ></textarea>
                </app-form-field>
                @if (blockers().length) {
                  <ul class="mt-2 text-[12px] font-medium text-fail">
                    @for (b of blockers(); track b) {
                      <li>{{ b | transloco }}</li>
                    }
                  </ul>
                }
                <div class="mt-3">
                  <app-button
                    [full]="true"
                    [loading]="saving()"
                    [disabled]="!canSave()"
                    (click)="save()"
                  >
                    {{
                      (isNew() ? 'records.designer.create' : 'records.designer.save') | transloco
                    }}
                  </app-button>
                </div>
              </app-card>
            }
            <app-records-why page="designer" />
            @if (!isNew()) {
              <app-card>
                <app-version-history
                  [versions]="versionEntries().slice(0, 4)"
                  [current]="currentVersion()"
                  [viewing]="viewing()"
                  (view)="viewVersion($event)"
                />
              </app-card>
              @if (canAdmin()) {
                <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'records.designer.delete' | transloco }}
                </app-button>
              }
            }
          </aside>
        </div>
      }
    </div>

    <app-confirm-dialog
      [open]="confirmDelete()"
      [title]="'records.designer.deleteTitle' | transloco"
      [message]="'records.designer.deleteMessage' | transloco: { name: recordType()?.name ?? '' }"
      [confirmLabel]="'records.designer.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="saving()"
      (confirmed)="remove()"
      (cancelled)="confirmDelete.set(false)"
    />

    @if (canAdmin()) {
      <app-ai-draft-panel
        [open]="aiOpen()"
        [initialModule]="module()"
        [lockModule]="!isNew()"
        (closed)="aiOpen.set(false)"
        (use)="applyDraft($event.draft)"
      />
    }
  `,
})
export class RecordTypeDesigner {
  private readonly api = inject(RecordsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly drafts = inject(RecordDraftStore);
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = inject(LanguageService).active;

  protected readonly modules = MODULE_KEYS;
  protected readonly tabs: readonly DesignerTab[] = ['fields', 'workflow', 'preview', 'history'];

  private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });
  protected readonly isNew = computed(() => this.id() === null);

  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  protected readonly saving = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly aiOpen = signal(false);
  protected readonly fromDraft = signal(false);
  protected readonly tab = signal<DesignerTab>('fields');

  protected readonly recordType = signal<RecordType | null>(null);
  protected readonly versions = signal<readonly RecordTypeVersionSummary[]>([]);
  protected readonly viewing = signal<number | null>(null);
  protected readonly workflows = signal<readonly Workflow[]>([]);

  protected readonly module = signal<string>(
    this.route.snapshot.queryParamMap.get('module') ?? 'deviations',
  );
  protected readonly key = signal('');
  protected readonly keyTouched = signal(false);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly codePrefix = signal('');
  protected readonly isActive = signal(true);
  protected readonly fields = signal<FieldSpec[]>([]);
  protected readonly sections = signal<SectionDraft[]>([]);
  protected readonly workflowVersionId = signal<string | null>(null);
  protected readonly pendingWorkflow = signal<PendingWorkflow | null>(null);
  protected readonly changeNote = signal('');

  protected readonly serverFieldIssues = signal<readonly FieldIssue[]>([]);
  protected readonly serverWorkflowIssues = signal<readonly DefinitionIssue[]>([]);

  protected readonly previewData = signal<Record<string, unknown>>({});
  protected readonly previewErrors = signal<Record<string, string>>({});
  protected readonly previewChecked = signal(false);
  protected readonly previewOk = computed(() => Object.keys(this.previewErrors()).length === 0);

  /** What was last loaded / published, for the "unsaved changes" checks. */
  private readonly baseline = signal({ schema: '', meta: '' });

  protected readonly canAdmin = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'records:admin'),
  );
  protected readonly currentVersion = computed(
    () => this.recordType()?.current_version?.version ?? null,
  );
  protected readonly viewingOld = computed(
    () => this.viewing() !== null && this.viewing() !== this.currentVersion(),
  );
  protected readonly readonly = computed(() => !this.canAdmin() || this.viewingOld());

  protected readonly layout = computed<LayoutSection[]>(() =>
    buildLayout(this.fields(), this.sections()),
  );
  protected readonly fieldKeys = computed(() => this.fields().map((f) => f.key));
  protected readonly userFieldKeys = computed(() =>
    this.fields()
      .filter((f) => f.type === 'user')
      .map((f) => f.key),
  );

  protected readonly allFieldIssues = computed(() => [
    ...checkFields(this.fields()),
    ...this.serverFieldIssues(),
  ]);
  protected readonly fieldProblemCount = computed(
    () => new Set(this.allFieldIssues().map((i) => i.index)).size,
  );
  protected readonly workflowIssues = computed(() => {
    const pw = this.pendingWorkflow();
    return pw ? [...checkDefinition(pw.definition), ...this.serverWorkflowIssues()] : [];
  });

  protected readonly moduleWorkflows = computed(() =>
    this.workflows().filter((w) => w.module === this.module() && w.current_version),
  );
  protected readonly boundWorkflow = computed(() => {
    const id = this.workflowVersionId();
    return id ? (this.workflows().find((w) => w.current_version?.id === id) ?? null) : null;
  });
  /** The bound version is an older version of some workflow (not anyone's current one). */
  protected readonly pinnedOlder = computed(
    () => !!this.workflowVersionId() && !this.boundWorkflow(),
  );

  protected readonly keyInvalid = computed(
    () => this.isNew() && !!this.key() && !TYPE_KEY_RE.test(this.key()),
  );
  protected readonly prefixInvalid = computed(
    () => !!this.codePrefix() && !CODE_PREFIX_RE.test(this.codePrefix()),
  );

  private readonly schemaPrint = computed(() =>
    fingerprint({
      f: this.fields(),
      l: this.layout(),
      w: this.workflowVersionId(),
      p: this.pendingWorkflow(),
    }),
  );
  private readonly metaPrint = computed(() =>
    fingerprint({
      n: this.name(),
      d: this.description(),
      c: this.codePrefix(),
      a: this.isActive(),
    }),
  );
  protected readonly dirtySchema = computed(() => this.schemaPrint() !== this.baseline().schema);
  private readonly dirtyMeta = computed(() => this.metaPrint() !== this.baseline().meta);

  protected readonly blockers = computed(() => {
    const out: string[] = [];
    if (!this.name().trim()) out.push('records.designer.blockName');
    if (this.isNew() && !TYPE_KEY_RE.test(this.key())) out.push('records.designer.blockKey');
    if (this.prefixInvalid()) out.push('records.designer.blockPrefix');
    if (this.fields().length === 0) out.push('records.designer.blockFields');
    if (checkFields(this.fields()).length) out.push('records.designer.blockFieldIssues');
    if (this.pendingWorkflow() && checkDefinition(this.pendingWorkflow()!.definition).length) {
      out.push('records.designer.blockWorkflowIssues');
    }
    return out;
  });
  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.blockers().length === 0 &&
      (this.isNew() || this.dirtySchema() || this.dirtyMeta()),
  );

  protected readonly versionEntries = computed<VersionEntry[]>(() =>
    this.versions().map((v) => ({
      version: v.version,
      published_at: v.published_at,
      published_by_name: v.published_by_name,
      change_note: v.change_note,
      summary: this.transloco.translate('records.versions.fieldCount', { count: v.field_count }),
    })),
  );

  constructor() {
    providePageContext(() => ({
      module: 'records',
      entityType: this.isNew() ? null : 'record_type',
      entityId: this.id(),
      view: this.isNew() ? 'new' : this.canAdmin() ? 'edit' : 'detail',
      title: this.recordType()?.name ?? null,
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.id();
      untracked(() => this.init(orgId));
    });
  }

  protected moduleLabel(key: string): string {
    return moduleLabelKey(key);
  }

  protected setName(name: string): void {
    this.name.set(name);
    if (this.isNew() && !this.keyTouched()) {
      this.key.set(slugify(name));
    }
  }

  protected setModule(module: string): void {
    this.module.set(module);
    if (this.boundWorkflow()?.module !== module) {
      this.workflowVersionId.set(null);
    }
  }

  protected cycleTab(delta: 1 | -1): void {
    const index = (this.tabs.indexOf(this.tab()) + delta + this.tabs.length) % this.tabs.length;
    this.tab.set(this.tabs[index]);
    globalThis.document?.getElementById(`rt-tab-${this.tabs[index]}`)?.focus();
  }

  protected setPendingDefinition(definition: WorkflowDefinition): void {
    const pw = this.pendingWorkflow();
    if (pw) {
      this.pendingWorkflow.set({ ...pw, definition });
      this.serverWorkflowIssues.set([]);
    }
  }

  protected askAbout(): void {
    const name = this.name() || this.transloco.translate('records.designer.newTitle');
    const fields = this.fields()
      .map((f) => `${localize(f.label, this.lang())} (${f.type})`)
      .join(', ');
    this.ask.showWith(this.transloco.translate('records.designer.askPrompt', { name, fields }));
  }

  protected applyDraft(draft: WorkflowAiDraft): void {
    this.aiOpen.set(false);
    this.loadDraft(draft);
    this.notifications.success('records.designer.draftAppliedToast');
  }

  protected checkPreview(): void {
    this.previewChecked.set(true);
    this.previewErrors.set(clientErrors(this.fields(), this.previewData()));
    const orgId = this.selectedOrg.currentOrgId();
    const id = this.id();
    // The server check validates against the published version, so only when nothing is unsaved.
    if (orgId && id && !this.dirtySchema() && Object.keys(this.previewErrors()).length === 0) {
      this.api.validateRecordData(orgId, id, { data: this.previewData() }).subscribe({
        next: (res) => {
          this.previewErrors.set({ ...res.errors });
          this.previewData.set({ ...this.previewData(), ...res.data });
        },
        error: () => undefined,
      });
    }
  }

  protected resetPreview(): void {
    this.previewData.set(defaultData(this.fields()));
    this.previewErrors.set({});
    this.previewChecked.set(false);
  }

  protected viewVersion(version: number): void {
    const orgId = this.selectedOrg.currentOrgId();
    const id = this.id();
    const rt = this.recordType();
    if (!orgId || !id || !rt) {
      return;
    }
    if (version === this.currentVersion()) {
      this.applyType(rt);
      return;
    }
    this.api.getRecordTypeVersion(orgId, id, version).subscribe({
      next: (v) => {
        this.viewing.set(v.version);
        this.applySchema(v.fields, v.layout, v.workflow_version_id);
        this.tab.set('fields');
      },
      error: (error: unknown) => this.toast(error),
    });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.serverFieldIssues.set([]);
    this.serverWorkflowIssues.set([]);
    const fields = cleanFields(this.fields());
    const layout = this.layout();
    const note = this.changeNote().trim() || null;
    const id = this.id();

    const done = (rt: RecordType, toast: string) => {
      this.saving.set(false);
      this.changeNote.set('');
      this.pendingWorkflow.set(null);
      this.notifications.success(toast, { name: rt.name });
      if (!id) {
        void this.router.navigate(['/settings/record-types', rt.id], { replaceUrl: true });
        return;
      }
      this.applyType(rt);
      this.loadVersions(orgId, rt.id);
      this.loadWorkflows(orgId);
    };

    if (!id) {
      this.createPendingWorkflow(orgId)
        .pipe(
          switchMap((workflowVersionId) =>
            this.api.createRecordType(orgId, {
              module: this.module(),
              key: this.key(),
              name: this.name().trim(),
              description: this.description().trim() || null,
              code_prefix: this.codePrefix() || null,
              is_active: this.isActive(),
              fields,
              layout,
              workflow_version_id: workflowVersionId,
              change_note: note,
            }),
          ),
        )
        .subscribe({
          next: (rt) => done(rt, 'records.designer.createdToast'),
          error: (error: unknown) => this.saveFailed(error),
        });
      return;
    }

    const meta$: Observable<RecordType | null> = this.dirtyMeta()
      ? this.api.updateRecordType(orgId, id, {
          name: this.name().trim(),
          description: this.description().trim() || null,
          code_prefix: this.codePrefix() || null,
          is_active: this.isActive(),
        })
      : of(null);
    const publish = this.dirtySchema();
    meta$
      .pipe(
        switchMap(() => (publish ? this.createPendingWorkflow(orgId) : of(null))),
        switchMap((pendingVersionId) =>
          publish
            ? this.api
                .publishRecordTypeVersion(orgId, id, {
                  fields,
                  layout,
                  workflow_version_id: pendingVersionId ?? this.workflowVersionId(),
                  change_note: note,
                })
                .pipe(switchMap(() => this.api.getRecordType(orgId, id)))
            : this.api.getRecordType(orgId, id),
        ),
      )
      .subscribe({
        next: (rt) =>
          done(rt, publish ? 'records.designer.publishedToast' : 'records.designer.savedToast'),
        error: (error: unknown) => this.saveFailed(error),
      });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const id = this.id();
    if (!orgId || !id) {
      return;
    }
    this.saving.set(true);
    this.api.deleteRecordType(orgId, id).subscribe({
      next: () => {
        this.saving.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('records.designer.deletedToast');
        void this.router.navigate(['/settings/record-types']);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.confirmDelete.set(false);
        this.toast(error);
      },
    });
  }

  /** Creates the drafted workflow (if any) and resolves to its version id. */
  private createPendingWorkflow(orgId: string): Observable<string | null> {
    const pw = this.pendingWorkflow();
    if (!pw) {
      return of(this.workflowVersionId());
    }
    return this.api
      .createWorkflow(orgId, {
        module: this.module(),
        key: pw.key,
        name: pw.name,
        definition: pw.definition,
      })
      .pipe(
        map((wf) => {
          // Created even if the type fails next: bind to it so a retry doesn't duplicate it.
          const versionId = wf.current_version?.id ?? null;
          this.pendingWorkflow.set(null);
          this.workflowVersionId.set(versionId);
          this.workflows.update((list) => [...list, wf]);
          return versionId;
        }),
      );
  }

  private saveFailed(error: unknown): void {
    this.saving.set(false);
    const detail = recordsErrorDetail(error);
    this.serverFieldIssues.set(fieldIssues(error));
    this.serverWorkflowIssues.set(definitionIssues(error));
    if (detail.code === 'invalid_fields' || detail.code === 'invalid_layout') {
      this.tab.set('fields');
    } else if (detail.code === 'invalid_definition') {
      this.tab.set('workflow');
    }
    this.toast(error);
  }

  private toast(error: unknown): void {
    const message = recordsErrorMessage(error);
    if (message) {
      this.notifications.error(message.key, message.params);
    }
  }

  private init(orgId: string | null): void {
    if (!orgId) {
      return;
    }
    this.loadWorkflows(orgId);
    const id = this.id();
    if (!id) {
      const pending = this.route.snapshot.queryParamMap.has('draft') ? this.drafts.take() : null;
      if (pending) {
        this.module.set(pending.module);
        this.loadDraft(pending.draft);
        this.fromDraft.set(true);
      } else {
        const details = this.transloco.translate('records.layout.defaultLabel');
        this.sections.set([{ key: 'details', label: { en: details, nb: details }, columns: 1 }]);
      }
      this.baseline.set({ schema: '', meta: '' });
      return;
    }
    this.loading.set(true);
    this.api.getRecordType(orgId, id).subscribe({
      next: (rt) => {
        this.loading.set(false);
        this.applyType(rt);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        if (recordsErrorDetail(error).status === 404) {
          this.notFound.set(true);
        } else {
          this.toast(error);
        }
      },
    });
    this.loadVersions(orgId, id);
  }

  private loadVersions(orgId: string, id: string): void {
    this.api.listRecordTypeVersions(orgId, id).subscribe({
      next: (versions) => this.versions.set([...versions].sort((a, b) => b.version - a.version)),
      error: () => this.versions.set([]),
    });
  }

  private loadWorkflows(orgId: string): void {
    this.api.listWorkflows(orgId).subscribe({
      next: (workflows) => this.workflows.set(workflows),
      error: () => this.workflows.set([]),
    });
  }

  private loadDraft(draft: WorkflowAiDraft): void {
    this.name.set(draft.name);
    if (this.isNew()) {
      this.key.set(draft.key && TYPE_KEY_RE.test(draft.key) ? draft.key : slugify(draft.name));
      this.keyTouched.set(true);
    }
    this.description.set(draft.description ?? '');
    if (draft.code_prefix && CODE_PREFIX_RE.test(draft.code_prefix)) {
      this.codePrefix.set(draft.code_prefix);
    }
    this.applySchema(draft.fields, draft.layout, this.workflowVersionId());
    this.pendingWorkflow.set({
      key: slugify(`${draft.key || draft.name}_workflow`),
      name: draft.name,
      definition: draft.workflow,
    });
    this.tab.set('fields');
  }

  private applyType(rt: RecordType): void {
    this.recordType.set(rt);
    this.viewing.set(rt.current_version?.version ?? null);
    this.module.set(rt.module);
    this.key.set(rt.key);
    this.name.set(rt.name);
    this.description.set(rt.description ?? '');
    this.codePrefix.set(rt.code_prefix ?? '');
    this.isActive.set(rt.is_active);
    const v = rt.current_version;
    this.applySchema(v?.fields ?? [], v?.layout ?? [], v?.workflow_version_id ?? null);
    this.baseline.set({ schema: this.schemaPrint(), meta: this.metaPrint() });
  }

  private applySchema(
    fields: readonly FieldSpec[],
    layout: readonly LayoutSection[],
    workflowVersionId: string | null,
  ): void {
    const details = this.transloco.translate('records.layout.defaultLabel');
    const sections = sectionsFrom(fields, layout, { en: details, nb: details });
    this.sections.set(sections);
    this.fields.set(assignSections(fields, layout, sections));
    this.workflowVersionId.set(workflowVersionId);
    this.previewData.set(defaultData(fields));
    this.previewErrors.set({});
    this.previewChecked.set(false);
    this.serverFieldIssues.set([]);
  }
}
