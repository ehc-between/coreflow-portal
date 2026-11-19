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
import { FieldHelp } from '../../../shared/guidance/field-help';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AskPanelService } from '../../ask/ask-panel.service';
import { ClauseRefs } from '../components/clause-refs';
import { QuestionPreview } from '../components/question-preview';
import { groupBySection } from '../data/answer-model';
import {
  StatusSentence,
  templateMissing,
  templateStatusSentence,
} from '../data/inspection-anatomy';
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
 * A checklist template (`/settings/modules/inspections/templates/:id`), on the
 * detail-page anatomy (docs/ux-guide.md §2.7). The header is code · type · status
 * with one primary action (plan an inspection, or publish a draft), "Rediger" next to
 * it and the assistant in "Spør KI". "Hovedinformasjon" says whether it can be used
 * and shows what it is for, what it checks (questions, sections, standards), when an
 * inspection passes and when findings become deviations. The Details tab shows the
 * questions by section and the other fields. The "Oppfølging" card lists what is
 * missing, the requirements it documents (narrowed to its standards), its connections,
 * a link to the inspections that used it and the version metadata. Recurring plans,
 * duplicate, archive and delete are under "Mer".
 */
@Component({
  selector: 'app-template-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    WhyItMatters,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalPercentPipe,
    SupportsRequirements,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    FieldItem,
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
        [anatomy]="true"
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
        [missing]="missing()"
        backLink="/settings/modules/inspections/templates"
        backLabelKey="inspections.templates.backToTemplates"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="template-code">{{ t.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'inspections.templates.typeLabel' | transloco }}</span>
          <span aria-hidden="true">·</span>
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

        @if (editLink(); as link) {
          <a secondary [routerLink]="link">
            <app-button variant="secondary" data-testid="edit-template">
              {{ 'inspections.actions.edit' | transloco }}
            </app-button>
          </a>
        }

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

        <button appMenuItem ask type="button" (click)="askImprove()" data-testid="ask-improve">
          <app-icon name="spark" [size]="15" />
          {{ 'inspections.templates.askImproveLabel' | transloco }}
        </button>

        <app-help-strip help scope="inspections" page="templateDetail" lesson="inspection-basics" />

        <app-record-lead record-lead [fillLink]="editLink()">
          @let line = statusLine();
          <app-record-status-line status [tone]="line.tone" data-testid="template-status-line">
            {{ line.key | transloco: line.params }}
          </app-record-status-line>
          <app-field-item
            size="lead"
            labelKey="inspections.templates.lead.purpose"
            [value]="t.description"
            [wide]="true"
            [multiline]="true"
          />
          <app-field-item size="lead" labelKey="inspections.templates.lead.checks">
            @if (t.question_count > 0) {
              {{ questionsText() }}
              @if (frameworkNames()) {
                <span class="block text-ui text-fg-muted">{{
                  'inspections.templates.lead.standards' | transloco: { names: frameworkNames() }
                }}</span>
              }
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="inspections.templates.lead.passes">
            {{
              t.pass_threshold === null
                ? ('inspections.templates.lead.passesAll' | transloco)
                : ('inspections.templates.lead.passesAt'
                  | transloco: { value: (t.pass_threshold | localPercent) })
            }}
          </app-field-item>
          <app-field-item
            size="lead"
            labelKey="inspections.templates.lead.deviations"
            [wide]="true"
          >
            <span data-testid="auto-deviation-value">
              @if (t.auto_deviation) {
                {{
                  'inspections.templates.lead.deviationsAuto'
                    | transloco
                      : {
                          severity: (severityKey(t.deviation_min_severity ?? 'high') | transloco),
                          type:
                            deviationTypeName() ??
                            ('inspections.templates.defaultType' | transloco),
                        }
                }}
              } @else {
                {{ 'inspections.templates.lead.deviationsManual' | transloco }}
              }
            </span>
          </app-field-item>
        </app-record-lead>

        <div class="flex flex-col gap-6">
          <app-card>
            <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-card font-bold text-fg">
                {{ 'inspections.templates.questions' | transloco: { count: t.question_count } }}
              </h2>
            </div>
            @if (t.clause_refs?.length) {
              <p class="mb-3 flex flex-wrap items-center gap-1.5 text-meta text-fg-muted">
                <app-clause-refs [refs]="t.clause_refs" labelKey="inspections.templates.covers" />
              </p>
            }
            <app-question-preview [questions]="t.questions" />
          </app-card>

          <app-record-details [columns]="2" [fillLink]="editLink()">
            <app-field-item labelKey="inspections.fields.category" [value]="categoryText()" />
          </app-record-details>
        </div>

        <app-supports-requirements
          aside-requirements
          [entityType]="entityType"
          [entityId]="t.id"
          [canEdit]="canDesign()"
          [frameworks]="t.frameworks"
        />

        <p follow-up-connections class="mt-3 text-meta">
          @if (t.inspection_count > 0) {
            <a
              routerLink="/inspections"
              [queryParams]="{ template: t.id }"
              class="inline-flex min-h-6 items-center gap-1 font-semibold text-accent hover:underline"
              data-testid="inspection-count"
              >{{
                (t.inspection_count === 1
                  ? 'inspections.templates.usedInOne'
                  : 'inspections.templates.usedIn'
                ) | transloco: { count: t.inspection_count }
              }}
              <span aria-hidden="true">→</span></a
            >
          } @else {
            <span class="text-fg-muted">{{ 'inspections.templates.notUsedYet' | transloco }}</span>
          }
        </p>

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="inspections.fields.version"
            [value]="'inspections.templates.versionShort' | transloco: { version: t.version }"
          />
          <app-field-item
            layout="inline"
            labelKey="inspections.fields.publishedAt"
            [value]="t.published_at ? (t.published_at | localDate: 'mediumDate') : null"
          />
          <app-field-item
            layout="inline"
            labelKey="inspections.fields.updatedAt"
            [value]="
              t.updated_by?.name
                ? ('inspections.detail.completedBy'
                  | transloco
                    : { date: (t.updated_at | localDate: 'mediumDate'), name: t.updated_by?.name })
                : (t.updated_at | localDate: 'mediumDate')
            "
          />
          <span class="flex justify-end">
            <app-field-help scope="inspections" page="templateDetail" field="version" />
          </span>
        </app-record-meta>

        <div aside-learn>
          <app-why-it-matters scope="inspections" page="templateDetail" />
        </div>
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
  private readonly askPanel = inject(AskPanelService);

  readonly id = input.required<string>();

  protected readonly entityType = TEMPLATE_ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = TEMPLATE_FIELD_LABELS;
  protected readonly statusKey = templateStatusKey;
  protected readonly severityKey = severityKey;

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

  /** The builder ("Rediger", "Fyll ut"), unless archived or not allowed. */
  protected readonly editLink = computed<readonly unknown[] | null>(() => {
    const t = this.template();
    return t && this.canDesign() && t.status !== 'archived'
      ? ['/settings/modules/inspections/templates', t.id, 'edit']
      : null;
  });

  /** "I bruk – versjon 1 kan brukes til nye inspeksjoner." */
  protected readonly statusLine = computed<StatusSentence>(() => {
    const t = this.template();
    return t
      ? templateStatusSentence(t)
      : { key: 'inspections.templates.status.draft', tone: 'neutral' };
  });

  /** The "Oppfølging" card's to-dos. */
  protected readonly missing = computed<RecordMissingItem[]>(() => {
    const t = this.template();
    return t
      ? templateMissing(t, {
          editLink: this.editLink(),
          publish: this.canDesign() ? () => this.pending.set('publish') : null,
        })
      : [];
  });

  /** "8 spørsmål i 3 deler". */
  protected readonly questionsText = computed(() => {
    const t = this.template();
    if (!t) {
      return '';
    }
    const parts = groupBySection(t.questions).filter((g) => !!g.title).length;
    return this.language.translate(
      parts > 1
        ? 'inspections.templates.lead.questionsInParts'
        : 'inspections.templates.lead.questionsCount',
      { count: t.question_count, parts },
    );
  });

  protected readonly categoryText = computed(() => {
    const category = this.template()?.category;
    const key = categoryKey(category);
    return key ? this.language.translate(key) : (category ?? null);
  });

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

  /** "Spør KI" → how the questions can be better. */
  protected askImprove(): void {
    const t = this.template();
    if (!t) {
      return;
    }
    this.askPanel.askAbout(
      this.language.translate('inspections.templates.askImprove', { title: t.title }),
      { field: this.language.translate('inspections.fields.questions') },
      { requirements: t.clause_refs ?? [] },
    );
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
