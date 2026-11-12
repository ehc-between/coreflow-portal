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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { QuestionPreview } from '../components/question-preview';
import { categoryKey, templateStatusKey, templateStatusTone } from '../data/inspection-display';
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
  'revisions',
  'comments',
  'attachments',
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
  deviation_type_id: 'inspections.fields.deviationType',
};

type PendingAction = 'publish' | 'archive';

/**
 * A checklist template (`/inspections/templates/:id`): its questions by section, the
 * scoring and deviation settings, the clauses it supports, and the record kit tabs
 * (related items, timeline, revisions, comments, attachments). Designers
 * (`inspections:templates`) edit, publish, archive and duplicate it; managers also
 * delete it. An active template can be used to plan an inspection or a schedule.
 */
@Component({
  selector: 'app-template-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    LocalDatePipe,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    PromptDialog,
    QuestionPreview,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (template(); as t) {
      <app-record-detail-layout
        [entityType]="entityType"
        [entityId]="t.id"
        [tabs]="tabs"
        [canEdit]="canDesign()"
        [fieldLabels]="fieldLabels"
        backLink="/inspections/templates"
        backLabelKey="inspections.templates.backToTemplates"
      >
        <div header>
          <p class="font-mono text-[12px] text-fg-subtle">{{ t.code }}</p>
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            data-testid="template-title"
          >
            {{ t.title }}
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <app-badge [tone]="statusTone(t.status)">{{
              statusKey(t.status) | transloco
            }}</app-badge>
            <app-badge tone="neutral">{{
              'inspections.templates.version' | transloco: { version: t.version }
            }}</app-badge>
            @if (categoryLabel(t.category); as cat) {
              <app-badge tone="info">{{ cat | transloco }}</app-badge>
            } @else if (t.category) {
              <app-badge tone="info">{{ t.category }}</app-badge>
            }
            @for (fw of t.frameworks; track fw) {
              <app-badge tone="neutral">{{ 'inspections.frameworks.' + fw | transloco }}</app-badge>
            }
          </div>
        </div>

        <ng-container ngProjectAs="[actions]">
          <app-watch-button [entityType]="entityType" [entityId]="t.id" />
          @if (t.status === 'active' && canWrite()) {
            <a [routerLink]="['/inspections/new']" [queryParams]="{ template: t.id }">
              <app-button size="sm" data-testid="plan-from-template">
                <app-icon name="plus" [size]="14" />
                {{ 'inspections.templates.plan' | transloco }}
              </app-button>
            </a>
          }
          @if (t.status === 'active' && canManage()) {
            <a [routerLink]="['/inspections/schedules']" [queryParams]="{ template: t.id, new: 1 }">
              <app-button variant="secondary" size="sm">
                <app-icon name="calendar" [size]="14" />
                {{ 'inspections.templates.schedule' | transloco }}
              </app-button>
            </a>
          }
          @if (canDesign()) {
            @if (t.status !== 'archived') {
              <a [routerLink]="['/inspections/templates', t.id, 'edit']">
                <app-button variant="secondary" size="sm" data-testid="edit-template">
                  {{ 'inspections.actions.edit' | transloco }}
                </app-button>
              </a>
            }
            @if (t.status === 'draft') {
              <app-button size="sm" (click)="pending.set('publish')" data-testid="publish-template">
                {{ 'inspections.templates.publish' | transloco }}
              </app-button>
            }
            @if (t.status === 'active') {
              <app-button variant="ghost" size="sm" (click)="pending.set('archive')">
                {{ 'inspections.templates.archive' | transloco }}
              </app-button>
            }
            <app-button variant="secondary" size="sm" [loading]="busy()" (click)="duplicate()">
              {{ 'inspections.templates.duplicate' | transloco }}
            </app-button>
            @if (canManage()) {
              <app-button variant="danger" size="sm" (click)="confirmDelete.set(true)">
                <app-icon name="trash" [size]="14" />
                {{ 'inspections.actions.delete' | transloco }}
              </app-button>
            }
          }
        </ng-container>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="inspections" page="templateDetail" />
          @if (t.status === 'draft') {
            <app-alert tone="info">{{ 'inspections.templates.draftNotice' | transloco }}</app-alert>
          } @else if (t.status === 'archived') {
            <app-alert tone="info">{{
              'inspections.templates.archivedNotice' | transloco
            }}</app-alert>
          }
          @if (t.description) {
            <app-card>
              <h2 class="mb-1 text-[15px] font-bold text-fg">
                {{ 'inspections.fields.description' | transloco }}
              </h2>
              <p class="text-[13.5px] whitespace-pre-line text-fg">{{ t.description }}</p>
            </app-card>
          }
          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-[15px] font-bold text-fg">
                {{ 'inspections.templates.questions' | transloco: { count: t.question_count } }}
              </h2>
              <app-ask-about
                [prompt]="'inspections.templates.askImprove' | transloco: { title: t.title }"
                field="questions"
              />
            </div>
            <app-question-preview [questions]="t.questions" />
          </app-card>
          <app-why-it-matters scope="inspections" page="templateDetail" />
        </div>

        <ng-container ngProjectAs="[aside]">
          <app-card>
            <h2 class="mb-2 text-[14px] font-bold text-fg">
              {{ 'inspections.templates.settings' | transloco }}
            </h2>
            <dl class="flex flex-col gap-2 text-[13px]">
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'inspections.fields.passThreshold' | transloco }}</dt>
                <dd class="text-right text-fg">
                  {{
                    t.pass_threshold === null
                      ? ('inspections.templates.noPassMark' | transloco)
                      : t.pass_threshold + ' %'
                  }}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'inspections.fields.autoDeviation' | transloco }}</dt>
                <dd class="text-right text-fg">
                  {{
                    (t.auto_deviation ? 'inspections.common.yes' : 'inspections.common.no')
                      | transloco
                  }}
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
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">
                  {{ 'inspections.templates.inspectionCount' | transloco }}
                </dt>
                <dd class="text-fg">{{ t.inspection_count }}</dd>
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
            <app-field-help
              class="mt-2 block"
              scope="inspections"
              page="templateDetail"
              field="version"
            />
          </app-card>
          <app-supports-requirements [entityType]="entityType" [entityId]="t.id" />
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
      <div class="mx-auto max-w-[720px] px-4 py-10 sm:px-8">
        <app-alert tone="error">{{ 'inspections.templates.notFound' | transloco }}</app-alert>
        <a routerLink="/inspections/templates" class="mt-3 inline-block font-semibold text-accent">
          {{ 'inspections.templates.backToTemplates' | transloco }}
        </a>
      </div>
    } @else {
      <p class="px-8 py-10 text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
    }
  `,
})
export class TemplateDetailPage {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly references = inject(InspectionReferences);

  readonly id = input.required<string>();

  protected readonly entityType = TEMPLATE_ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = TEMPLATE_FIELD_LABELS;
  protected readonly statusKey = templateStatusKey;
  protected readonly statusTone = templateStatusTone;
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

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: TEMPLATE_ENTITY_TYPE,
      entityId: this.id(),
      view: 'detail',
      title: this.template()?.title ?? null,
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
        void this.router.navigate(['/inspections/templates', copy.id, 'edit']);
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
        void this.router.navigate(['/inspections/templates']);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }
}
