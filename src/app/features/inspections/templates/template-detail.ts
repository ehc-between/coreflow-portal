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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ClauseRefs } from '../components/clause-refs';
import { QuestionPreview } from '../components/question-preview';
import { categoryKey, severityKey, templateStatusKey } from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences } from '../data/inspection-references';
import {
  INSPECTIONS_MODULE,
  TEMPLATE_ENTITY_TYPE,
  TemplateDetail,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> i18n key (revisions tab). */
export const TEMPLATE_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'inspections.fields.code',
  title: 'inspections.fields.title',
  description: 'inspections.fields.description',
  category: 'inspections.fields.category',
  frameworks: 'inspections.fields.frameworks',
  status: 'inspections.fields.status',
  version: 'inspections.fields.version',
  questions: 'inspections.fields.questions',
  pass_threshold: 'inspections.fields.passThreshold',
  auto_deviation: 'inspections.fields.autoDeviation',
  deviation_min_severity: 'inspections.fields.deviationMinSeverity',
  deviation_type_id: 'inspections.fields.deviationType',
};

type PendingAction = 'publish' | 'archive';

/**
 * A checklist template (`/settings/modules/inspections/templates/:id`): the header says what it is
 * (code · version · category · status) with one primary action (plan an inspection,
 * or publish a draft); the questions show by section with their pass rules and the
 * clauses they cover; the aside shows the requirements it documents (narrowed to its
 * standards), its connections, and how it scores and when findings become
 * deviations, with a link to the inspections that used it. Edit and follow sit next
 * to the primary action; recurring plans, duplicate, archive and delete are under
 * "Mer".
 */
@Component({
  selector: 'app-template-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    FieldHelp,
    WhyItMatters,
    RecordDetailLayout,
    LocalDatePipe,
    LocalPercentPipe,
    SupportsRequirements,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    StatusBadge,
    ClauseRefs,
    QuestionPreview,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (template(); as t) {
      <app-record-detail-layout
        [entityType]="entityType"
        [entityId]="t.id"
        [title]="t.title"
        [breadcrumbs]="[
          { labelKey: 'nav.settings', link: '/settings' },
          { labelKey: 'modules.names.inspections' },
          {
            labelKey: 'inspections.templates.title',
            link: '/settings/modules/inspections/templates',
          },
          { label: t.title },
        ]"
        [tabs]="tabs"
        [canEdit]="canDesign()"
        [fieldLabels]="fieldLabels"
        backLink="/settings/modules/inspections/templates"
        backLabelKey="inspections.templates.backToTemplates"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="template-code">{{ t.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{
            'inspections.templates.versionShort' | transloco: { version: t.version }
          }}</span>
          @if (categoryLabel(t.category); as cat) {
            <span aria-hidden="true">·</span>
            <span>{{ cat | transloco }}</span>
          } @else if (t.category) {
            <span aria-hidden="true">·</span>
            <span>{{ t.category }}</span>
          }
          <app-status-badge
            meaning="lifecycle"
            [value]="t.status"
            [labelKey]="statusKey(t.status)"
          />
          <span class="sr-only" data-testid="template-title">{{ t.title }}</span>
        </ng-container>

        @if (t.status === 'active' && canWrite()) {
          <a
            primary
            [routerLink]="['/inspections/new']"
            [queryParams]="{ template: t.id }"
            data-testid="plan-from-template"
          >
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'inspections.templates.plan' | transloco }}
            </app-button>
          </a>
        } @else if (t.status === 'draft' && canDesign()) {
          <app-button primary (click)="pending.set('publish')" data-testid="publish-template">
            {{ 'inspections.templates.publish' | transloco }}
          </app-button>
        }

        <ng-container ngProjectAs="[secondary]">
          @if (canDesign() && t.status !== 'archived') {
            <a [routerLink]="['/settings/modules/inspections/templates', t.id, 'edit']">
              <app-button variant="secondary" data-testid="edit-template">
                {{ 'inspections.actions.edit' | transloco }}
              </app-button>
            </a>
          }
          <app-watch-button [entityType]="entityType" [entityId]="t.id" />
        </ng-container>

        <ng-container ngProjectAs="[overflow]">
          @if (t.status === 'active' && canManage()) {
            <button appMenuItem type="button" (click)="schedule()" data-testid="schedule-template">
              {{ 'inspections.templates.schedule' | transloco }}
            </button>
          }
          @if (canDesign()) {
            <button appMenuItem type="button" (click)="duplicate()" data-testid="duplicate">
              {{ 'inspections.templates.duplicate' | transloco }}
            </button>
            @if (t.status === 'active') {
              <button
                appMenuItem
                type="button"
                (click)="pending.set('archive')"
                data-testid="archive"
              >
                {{ 'inspections.templates.archive' | transloco }}
              </button>
            }
          }
          @if (canManage()) {
            <button
              appMenuItem
              type="button"
              [danger]="true"
              (click)="confirmDelete.set(true)"
              data-testid="delete"
            >
              {{ 'inspections.actions.delete' | transloco }}
            </button>
          }
        </ng-container>

        <app-help-strip help scope="inspections" page="templateDetail" lesson="inspection-basics" />

        <div aside-requirements>
          <app-supports-requirements
            [entityType]="entityType"
            [entityId]="t.id"
            [canEdit]="canDesign()"
            [frameworks]="t.frameworks"
          />
        </div>

        <div class="flex flex-col gap-5">
          @if (t.status === 'draft') {
            <app-alert tone="info">{{ 'inspections.templates.draftNotice' | transloco }}</app-alert>
          } @else if (t.status === 'archived') {
            <app-alert tone="info">{{
              'inspections.templates.archivedNotice' | transloco
            }}</app-alert>
          }
          @if (t.description) {
            <app-card>
              <h2 class="mb-1 text-card font-bold text-fg">
                {{ 'inspections.fields.description' | transloco }}
              </h2>
              <p class="text-body whitespace-pre-line text-fg">{{ t.description }}</p>
            </app-card>
          }
          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-card font-bold text-fg">
                {{ 'inspections.templates.questions' | transloco: { count: t.question_count } }}
              </h2>
              <app-ask-about
                [prompt]="'inspections.templates.askImprove' | transloco: { title: t.title }"
                field="questions"
                [fieldLabel]="'inspections.fields.questions' | transloco"
                [requirements]="t.clause_refs ?? []"
                labelKey="inspections.templates.askImproveLabel"
              />
            </div>
            @if (t.clause_refs?.length) {
              <p class="mb-3 flex flex-wrap items-center gap-1.5 text-meta text-fg-muted">
                <app-clause-refs [refs]="t.clause_refs" labelKey="inspections.templates.covers" />
              </p>
            }
            <app-question-preview [questions]="t.questions" />
          </app-card>
          <app-why-it-matters scope="inspections" page="templateDetail" />
        </div>

        <ng-container ngProjectAs="[aside]">
          <app-card>
            <div class="mb-2 flex items-center gap-1.5">
              <h2 class="text-card font-bold text-fg">
                {{ 'inspections.templates.settings' | transloco }}
              </h2>
              <app-field-help scope="inspections" page="templateDetail" field="version" />
            </div>
            <dl class="flex flex-col gap-2 text-ui">
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'inspections.detail.passMark' | transloco }}</dt>
                <dd class="text-right text-fg">
                  {{
                    t.pass_threshold === null
                      ? ('inspections.templates.noPassMarkShort' | transloco)
                      : (t.pass_threshold | localPercent)
                  }}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">
                  {{ 'inspections.templates.autoDeviation' | transloco }}
                </dt>
                <dd class="text-right text-fg" data-testid="auto-deviation-value">
                  @if (t.auto_deviation) {
                    {{
                      'inspections.templates.fromSeverity'
                        | transloco
                          : {
                              severity:
                                (severityKey(t.deviation_min_severity ?? 'high') | transloco),
                            }
                    }}
                  } @else {
                    {{ 'inspections.templates.manualOnly' | transloco }}
                  }
                </dd>
              </div>
              @if (t.auto_deviation) {
                <div class="flex justify-between gap-2">
                  <dt class="text-fg-muted">
                    {{ 'inspections.fields.deviationType' | transloco }}
                  </dt>
                  <dd class="text-right text-fg">
                    {{ deviationTypeName() ?? ('inspections.templates.defaultType' | transloco) }}
                  </dd>
                </div>
              }
              @if (t.frameworks.length) {
                <div class="flex justify-between gap-2">
                  <dt class="text-fg-muted">{{ 'inspections.fields.frameworks' | transloco }}</dt>
                  <dd class="text-right text-fg">{{ frameworkNames() }}</dd>
                </div>
              }
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">
                  {{ 'inspections.templates.inspectionCount' | transloco }}
                </dt>
                <dd>
                  @if (t.inspection_count > 0) {
                    <a
                      routerLink="/inspections"
                      [queryParams]="{ template: t.id }"
                      class="font-semibold text-accent hover:underline"
                      data-testid="inspection-count"
                      >{{
                        'inspections.templates.inspectionCountLink'
                          | transloco: { count: t.inspection_count }
                      }}</a
                    >
                  } @else {
                    <span class="text-fg-muted">{{
                      'inspections.templates.noInspections' | transloco
                    }}</span>
                  }
                </dd>
              </div>
              @if (t.published_at) {
                <div class="flex justify-between gap-2">
                  <dt class="text-fg-muted">{{ 'inspections.fields.publishedAt' | transloco }}</dt>
                  <dd class="text-right text-fg">{{ t.published_at | localDate }}</dd>
                </div>
              }
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'inspections.fields.updatedAt' | transloco }}</dt>
                <dd class="text-right text-fg">{{ t.updated_at | localDate }}</dd>
              </div>
            </dl>
          </app-card>
        </ng-container>
      </app-record-detail-layout>

      <app-prompt-dialog
        [open]="pending() !== null"
        [title]="'inspections.templates.' + (pending() ?? 'publish') + 'Title' | transloco"
        [message]="'inspections.templates.' + (pending() ?? 'publish') + 'Message' | transloco"
        [label]="'inspections.fields.changeReason' | transloco"
        [confirmLabel]="'inspections.templates.' + (pending() ?? 'publish') | transloco"
        [cancelLabel]="'inspections.actions.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="runPending($event)"
        (cancelled)="pending.set(null)"
      />
      <app-confirm-dialog
        [open]="confirmDelete()"
        [title]="'inspections.templates.deleteTitle' | transloco"
        [message]="'inspections.templates.deleteMessage' | transloco: { title: t.title }"
        [confirmLabel]="'inspections.actions.delete' | transloco"
        [cancelLabel]="'inspections.actions.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="confirmDelete.set(false)"
      />
    } @else if (notFound()) {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-empty-state
          icon="search"
          titleKey="inspections.templates.notFoundTitle"
          bodyKey="inspections.templates.notFound"
          ctaKey="inspections.templates.backToTemplates"
          ctaLink="/settings/modules/inspections/templates"
        />
      </div>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    }
  `,
})
export class TemplateDetailPage {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly references = inject(InspectionReferences);
  private readonly language = inject(LanguageService);

  readonly id = input.required<string>();

  protected readonly entityType = TEMPLATE_ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = TEMPLATE_FIELD_LABELS;
  protected readonly statusKey = templateStatusKey;
  protected readonly severityKey = severityKey;
  protected readonly categoryLabel = categoryKey;

  protected readonly template = signal<TemplateDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly pending = signal<PendingAction | null>(null);
  protected readonly confirmDelete = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canDesign = computed(() =>
    this.permissions().includes('inspections:templates'),
  );
  protected readonly canManage = computed(() => this.permissions().includes('inspections:manage'));
  protected readonly canWrite = computed(() => this.permissions().includes('inspections:write'));

  protected readonly deviationTypeName = computed(() => {
    const id = this.template()?.deviation_type_id;
    return id ? (this.references.deviationTypes().find((t) => t.id === id)?.name ?? null) : null;
  });

  protected readonly frameworkNames = computed(() =>
    (this.template()?.frameworks ?? [])
      .map((fw) => this.language.translate(`inspections.frameworks.${fw}`))
      .join(', '),
  );

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: TEMPLATE_ENTITY_TYPE,
      entityId: this.id(),
      view: 'detail',
      title: this.template()?.title ?? null,
      requirements: this.template()?.clause_refs ?? [],
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() => this.load(orgId, id));
      }
    });
    this.references.ensureDeviationTypes();
  }

  private load(orgId: string, id: string): void {
    this.api.getTemplate(orgId, id).subscribe({
      next: (t) => {
        this.notFound.set(false);
        this.template.set(t);
      },
      error: () => this.notFound.set(true),
    });
  }

  protected schedule(): void {
    const t = this.template();
    if (t) {
      void this.router.navigate(['/inspections/schedules'], {
        queryParams: { template: t.id, new: 1 },
      });
    }
  }

  protected runPending(reason: string): void {
    const action = this.pending();
    const orgId = this.selectedOrg.currentOrgId();
    const t = this.template();
    if (!action || !orgId || !t) {
      return;
    }
    this.busy.set(true);
    const call =
      action === 'publish'
        ? this.api.publishTemplate(orgId, t.id, reason)
        : this.api.archiveTemplate(orgId, t.id, reason);
    call.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.pending.set(null);
        this.template.set(updated);
        this.references.ensureTemplates(true);
        this.notifications.success(
          action === 'publish' ? 'inspections.notices.published' : 'inspections.notices.archived',
        );
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }

  protected duplicate(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const t = this.template();
    if (!orgId || !t) {
      return;
    }
    this.busy.set(true);
    this.api.duplicateTemplate(orgId, t.id).subscribe({
      next: (copy) => {
        this.busy.set(false);
        this.notifications.success('inspections.notices.duplicated');
        void this.router.navigate(['/settings/modules/inspections/templates', copy.id, 'edit']);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const t = this.template();
    if (!orgId || !t) {
      return;
    }
    this.busy.set(true);
    this.api.deleteTemplate(orgId, t.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.references.ensureTemplates(true);
        this.notifications.success('inspections.notices.templateDeleted');
        void this.router.navigate(['/settings/modules/inspections/templates']);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }
}
