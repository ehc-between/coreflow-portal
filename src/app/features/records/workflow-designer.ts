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
  RecordType,
  Workflow,
  WorkflowAiDraft,
  WorkflowDefinition,
  WorkflowVersionSummary,
} from '../../core/records/record.models';
import {
  definitionIssues,
  recordsErrorDetail,
  recordsErrorMessage,
} from '../../core/records/records-errors';
import { RecordsApi } from '../../core/records/records-api';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { AskPanelService } from '../ask/ask-panel.service';
import {
  MODULE_KEYS,
  TYPE_KEY_RE,
  checkDefinition,
  fingerprint,
  moduleLabelKey,
  slugify,
  starterDefinition,
} from './designer-model';
import { AiDraftPanel } from './designer/ai-draft-panel';
import { VersionEntry, VersionHistory } from './designer/version-history';
import { WorkflowEditor } from './designer/workflow-editor';
import {
  RecordsFieldHelp,
  RecordsGuideIntro,
  RecordsLesson,
  RecordsWhy,
} from './guidance/records-guidance';
import { providePageContext } from './page-context';

/**
 * The workflow designer (`/settings/record-types/workflows/new` and `/:id`):
 * name, key and module; the visual editor (diagram, states, transitions with
 * roles, approvals, tasks, notifications, SLAs); "Describe your process" to
 * have the assistant draft a definition; the record types that run on it;
 * and the version history. Publishing creates a new immutable version.
 */
@Component({
  selector: 'app-workflow-designer',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    AiDraftPanel,
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
        [queryParams]="{ tab: 'workflows' }"
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
            {{ 'records.workflow.notFound' | transloco }}
          </p>
        </app-card>
      } @else {
        <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div class="min-w-0">
            <h1 class="font-display text-[24px] font-bold tracking-[-0.025em] text-fg">
              {{ isNew() ? ('records.workflow.newTitle' | transloco) : name() || workflow()?.name }}
            </h1>
            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
              @if (workflow(); as wf) {
                <span class="font-mono text-[12px]">{{ wf.key }}</span>
                <app-badge tone="neutral">{{ moduleLabel(wf.module) | transloco }}</app-badge>
                @if (wf.current_version) {
                  <app-badge tone="accent">
                    {{
                      'records.versions.version'
                        | transloco: { version: wf.current_version.version }
                    }}
                  </app-badge>
                }
              } @else {
                {{ 'records.workflow.newSubtitle' | transloco }}
              }
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <app-button variant="ghost" size="sm" (click)="askAbout()">
              <app-icon name="spark" [size]="15" />
              {{ 'records.workflow.ask' | transloco }}
            </app-button>
            @if (canAdmin() && !viewingOld()) {
              <app-button variant="secondary" size="sm" (click)="aiOpen.set(true)">
                <app-icon name="spark" [size]="15" />
                {{ 'records.list.describe' | transloco }}
              </app-button>
            }
            <app-records-lesson lesson="workflows-101" />
          </div>
        </div>

        <div class="mb-5">
          <app-records-guide-intro page="workflow" />
        </div>

        @if (viewingOld()) {
          <div class="mb-4 flex flex-wrap items-center gap-3">
            <app-alert tone="info">{{
              'records.designer.viewingOld' | transloco: { version: viewing() }
            }}</app-alert>
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
                <app-form-field [label]="'records.workflow.name' | transloco" inputId="wf-name">
                  <input
                    id="wf-name"
                    type="text"
                    maxlength="120"
                    autocomplete="off"
                    [ngModel]="name()"
                    (ngModelChange)="setName($event)"
                    aria-required="true"
                  />
                </app-form-field>
                <app-form-field [label]="'records.designer.module' | transloco" inputId="wf-module">
                  <select
                    id="wf-module"
                    [ngModel]="module()"
                    (ngModelChange)="module.set($event)"
                    [disabled]="!isNew() || readonly()"
                  >
                    @for (key of modules; track key) {
                      <option [value]="key">{{ moduleLabel(key) | transloco }}</option>
                    }
                  </select>
                </app-form-field>
                <app-form-field [label]="'records.designer.key' | transloco" inputId="wf-key">
                  <input
                    id="wf-key"
                    type="text"
                    maxlength="64"
                    autocomplete="off"
                    class="font-mono"
                    [ngModel]="key()"
                    (ngModelChange)="key.set($event); keyTouched.set(true)"
                    [disabled]="!isNew() || readonly()"
                  />
                  <app-records-field-help page="designer" field="key" />
                </app-form-field>
                <app-form-field
                  [label]="'records.designer.description' | transloco"
                  inputId="wf-description"
                >
                  <textarea
                    id="wf-description"
                    rows="2"
                    maxlength="5000"
                    [ngModel]="description()"
                    (ngModelChange)="description.set($event)"
                  ></textarea>
                </app-form-field>
              </fieldset>
            </app-card>

            <app-workflow-editor
              [definition]="definition()"
              [issues]="issues()"
              [readonly]="readonly()"
              (definitionChange)="setDefinition($event)"
            />
          </div>

          <aside class="flex flex-col gap-4">
            @if (canAdmin() && !viewingOld()) {
              <app-card>
                <h2 class="mb-2 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
                  {{ 'records.designer.publish' | transloco }}
                </h2>
                <p class="mb-3 text-[12.5px] text-fg-muted">
                  {{
                    (dirtyDefinition() || isNew()
                      ? 'records.workflow.publishHint'
                      : 'records.designer.upToDate'
                    ) | transloco
                  }}
                </p>
                <app-form-field
                  [label]="'records.designer.changeNote' | transloco"
                  inputId="wf-note"
                >
                  <textarea
                    id="wf-note"
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

            <app-records-why page="workflow" />

            @if (!isNew()) {
              <app-card>
                <h2 class="mb-2 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
                  {{ 'records.workflow.usedBy' | transloco }}
                </h2>
                @if (usedBy().length) {
                  <ul class="flex flex-col gap-1.5">
                    @for (rt of usedBy(); track rt.id) {
                      <li>
                        <a
                          [routerLink]="['/settings/record-types', rt.id]"
                          class="text-[13px] font-semibold text-accent hover:underline"
                        >
                          {{ rt.name }}
                        </a>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-[12.5px] text-fg-muted">
                    {{ 'records.workflow.unused' | transloco }}
                  </p>
                }
              </app-card>
              <app-card>
                <app-version-history
                  [versions]="versionEntries()"
                  [current]="currentVersion()"
                  [viewing]="viewing()"
                  (view)="viewVersion($event)"
                />
              </app-card>
              @if (canAdmin()) {
                <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'records.workflow.delete' | transloco }}
                </app-button>
              }
            }
          </aside>
        </div>
      }
    </div>

    <app-confirm-dialog
      [open]="confirmDelete()"
      [title]="'records.workflow.deleteTitle' | transloco"
      [message]="'records.workflow.deleteMessage' | transloco: { name: workflow()?.name ?? '' }"
      [confirmLabel]="'records.workflow.delete' | transloco"
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
        mode="workflow"
        (closed)="aiOpen.set(false)"
        (use)="applyDraft($event.draft)"
      />
    }
  `,
})
export class WorkflowDesigner {
  private readonly api = inject(RecordsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly lang = this.language.active;

  protected readonly modules = MODULE_KEYS;

  private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });
  protected readonly isNew = computed(() => this.id() === null);

  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  protected readonly saving = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly aiOpen = signal(false);

  protected readonly workflow = signal<Workflow | null>(null);
  protected readonly versions = signal<readonly WorkflowVersionSummary[]>([]);
  protected readonly recordTypes = signal<readonly RecordType[]>([]);
  protected readonly viewing = signal<number | null>(null);

  protected readonly module = signal(
    this.route.snapshot.queryParamMap.get('module') ?? 'deviations',
  );
  protected readonly key = signal('');
  protected readonly keyTouched = signal(false);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly definition = signal<WorkflowDefinition>(starterDefinition());
  protected readonly changeNote = signal('');
  protected readonly serverIssues = signal<readonly DefinitionIssue[]>([]);

  private readonly baseline = signal({ definition: '', meta: '' });

  protected readonly canAdmin = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'records:admin'),
  );
  protected readonly currentVersion = computed(
    () => this.workflow()?.current_version?.version ?? null,
  );
  protected readonly viewingOld = computed(
    () => this.viewing() !== null && this.viewing() !== this.currentVersion(),
  );
  protected readonly readonly = computed(() => !this.canAdmin() || this.viewingOld());

  protected readonly issues = computed(() => [
    ...checkDefinition(this.definition()),
    ...this.serverIssues(),
  ]);
  private readonly definitionPrint = computed(() => fingerprint(this.definition()));
  private readonly metaPrint = computed(() =>
    fingerprint({ n: this.name(), d: this.description() }),
  );
  protected readonly dirtyDefinition = computed(
    () => this.definitionPrint() !== this.baseline().definition,
  );
  private readonly dirtyMeta = computed(() => this.metaPrint() !== this.baseline().meta);

  protected readonly blockers = computed(() => {
    const out: string[] = [];
    if (!this.name().trim()) out.push('records.designer.blockName');
    if (this.isNew() && !TYPE_KEY_RE.test(this.key())) out.push('records.designer.blockKey');
    if (checkDefinition(this.definition()).length) out.push('records.designer.blockWorkflowIssues');
    return out;
  });
  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.blockers().length === 0 &&
      (this.isNew() || this.dirtyDefinition() || this.dirtyMeta()),
  );

  /** Record types whose current version runs on any version of this workflow. */
  protected readonly usedBy = computed(() => {
    const ids = new Set(this.versions().map((v) => v.id));
    return this.recordTypes().filter(
      (rt) =>
        !!rt.current_version?.workflow_version_id &&
        ids.has(rt.current_version.workflow_version_id),
    );
  });

  protected readonly versionEntries = computed<VersionEntry[]>(() =>
    this.versions().map((v) => ({
      version: v.version,
      published_at: v.published_at,
      published_by_name: v.published_by_name,
      change_note: v.change_note,
      summary: this.language.translate('records.versions.workflowCount', {
        states: v.state_count,
        transitions: v.transition_count,
      }),
    })),
  );

  constructor() {
    providePageContext(() => ({
      module: 'records',
      entityType: this.isNew() ? null : 'workflow_definition',
      entityId: this.id(),
      view: this.isNew() ? 'new' : this.canAdmin() ? 'edit' : 'detail',
      title: this.workflow()?.name ?? null,
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

  protected setDefinition(definition: WorkflowDefinition): void {
    this.definition.set(definition);
    this.serverIssues.set([]);
  }

  protected askAbout(): void {
    const def = this.definition();
    const states = def.states.map((s) => localize(s.label, this.lang()) || s.key).join(' → ');
    const name = this.name() || this.transloco.translate('records.workflow.newTitle');
    this.ask.showWith(this.transloco.translate('records.workflow.askPrompt', { name, states }));
  }

  protected applyDraft(draft: WorkflowAiDraft): void {
    this.aiOpen.set(false);
    this.definition.set(draft.workflow);
    if (!this.name().trim()) {
      this.setName(draft.name);
    }
    if (!this.description().trim() && draft.description) {
      this.description.set(draft.description);
    }
    this.notifications.success('records.designer.draftAppliedToast');
  }

  protected viewVersion(version: number): void {
    const orgId = this.selectedOrg.currentOrgId();
    const id = this.id();
    const wf = this.workflow();
    if (!orgId || !id || !wf) {
      return;
    }
    if (version === this.currentVersion()) {
      this.applyWorkflow(wf);
      return;
    }
    this.api.getWorkflowVersion(orgId, id, version).subscribe({
      next: (v) => {
        this.viewing.set(v.version);
        this.definition.set(v.definition);
        this.serverIssues.set([]);
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
    this.serverIssues.set([]);
    const note = this.changeNote().trim() || null;
    const id = this.id();

    const done = (wf: Workflow, toast: string) => {
      this.saving.set(false);
      this.changeNote.set('');
      this.notifications.success(toast, { name: wf.name });
      if (!id) {
        void this.router.navigate(['/settings/record-types/workflows', wf.id], {
          replaceUrl: true,
        });
        return;
      }
      this.applyWorkflow(wf);
      this.loadVersions(orgId, wf.id);
    };

    if (!id) {
      this.api
        .createWorkflow(orgId, {
          module: this.module(),
          key: this.key(),
          name: this.name().trim(),
          description: this.description().trim() || null,
          definition: this.definition(),
          change_note: note,
        })
        .subscribe({
          next: (wf) => done(wf, 'records.workflow.createdToast'),
          error: (error: unknown) => this.saveFailed(error),
        });
      return;
    }

    const publish = this.dirtyDefinition();
    const meta$: Observable<unknown> = this.dirtyMeta()
      ? this.api.updateWorkflow(orgId, id, {
          name: this.name().trim(),
          description: this.description().trim() || null,
        })
      : of(null);
    meta$
      .pipe(
        switchMap(() =>
          publish ? this.api.publishWorkflowVersion(orgId, id, this.definition(), note) : of(null),
        ),
        switchMap(() => this.api.getWorkflow(orgId, id)),
      )
      .subscribe({
        next: (wf) =>
          done(wf, publish ? 'records.workflow.publishedToast' : 'records.designer.savedToast'),
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
    this.api.deleteWorkflow(orgId, id).subscribe({
      next: () => {
        this.saving.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('records.workflow.deletedToast');
        void this.router.navigate(['/settings/record-types'], {
          queryParams: { tab: 'workflows' },
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.confirmDelete.set(false);
        this.toast(error);
      },
    });
  }

  private saveFailed(error: unknown): void {
    this.saving.set(false);
    this.serverIssues.set(definitionIssues(error));
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
    const id = this.id();
    if (!id) {
      this.definition.set(starterDefinition());
      this.baseline.set({ definition: '', meta: '' });
      return;
    }
    this.loading.set(true);
    this.api.getWorkflow(orgId, id).subscribe({
      next: (wf) => {
        this.loading.set(false);
        this.applyWorkflow(wf);
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
    this.api.listRecordTypes(orgId).subscribe({
      next: (types) => this.recordTypes.set(types),
      error: () => this.recordTypes.set([]),
    });
  }

  private loadVersions(orgId: string, id: string): void {
    this.api.listWorkflowVersions(orgId, id).subscribe({
      next: (versions) => this.versions.set([...versions].sort((a, b) => b.version - a.version)),
      error: () => this.versions.set([]),
    });
  }

  private applyWorkflow(wf: Workflow): void {
    this.workflow.set(wf);
    this.viewing.set(wf.current_version?.version ?? null);
    this.module.set(wf.module);
    this.key.set(wf.key);
    this.name.set(wf.name);
    this.description.set(wf.description ?? '');
    this.definition.set(wf.current_version?.definition ?? starterDefinition());
    this.serverIssues.set([]);
    this.baseline.set({
      definition: wf.current_version ? this.definitionPrint() : '',
      meta: this.metaPrint(),
    });
  }
}
