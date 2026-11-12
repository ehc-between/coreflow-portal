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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { groupBySection } from '../data/answer-model';
import {
  findingStatusKey,
  findingStatusTone,
  inspectionStatusKey,
  inspectionStatusTone,
  resultKey,
  resultTone,
  severityKey,
  severityTone,
} from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences } from '../data/inspection-references';
import {
  ASSIST_SUMMARISE_RESULTS,
  Finding,
  INSPECTIONS_MODULE,
  INSPECTION_ENTITY_TYPE,
  InspectionDetail,
  InspectionResponse,
  Question,
  Signature,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';
import { FindingForm } from '../findings/finding-form';
import { FindingPanel } from '../findings/finding-panel';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'revisions',
  'comments',
  'attachments',
];

/** Revision snapshot field -> i18n key (revisions tab). */
export const INSPECTION_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'inspections.fields.code',
  title: 'inspections.fields.title',
  status: 'inspections.fields.status',
  result: 'inspections.fields.result',
  location: 'inspections.fields.location',
  notes: 'inspections.fields.notes',
  summary: 'inspections.fields.summary',
  inspector_user_id: 'inspections.fields.inspector',
  owner_user_id: 'inspections.fields.owner',
  department_id: 'inspections.fields.department',
  due_at: 'inspections.fields.dueAt',
  started_at: 'inspections.fields.startedAt',
  completed_at: 'inspections.fields.completedAt',
  score_pct: 'inspections.fields.score',
  responses: 'inspections.fields.responses',
  signature: 'inspections.fields.signature',
  cancel_reason: 'inspections.fields.cancelReason',
};

/**
 * An inspection (`/inspections/:id`, `?finding=<id>` opens a finding): planning facts,
 * progress or the result and score, every answer by section (failed ones marked),
 * the summary and signature, and its findings with their deviations. The inspector
 * starts or continues it on the run page; editors change the plan or cancel it;
 * managers delete it. The assistant summarises the results; the record kit tabs
 * hold related items, the timeline, revisions, comments and photo evidence.
 */
@Component({
  selector: 'app-inspection-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    LocalPercentPipe,
    MarkdownPipe,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    ProgressBar,
    PromptDialog,
    SlideOver,
    FindingForm,
    FindingPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (inspection(); as ins) {
      <app-record-detail-layout
        [entityType]="entityType"
        [entityId]="ins.id"
        [tabs]="tabs"
        [canEdit]="ins.permissions.can_edit || ins.permissions.can_perform"
        [fieldLabels]="fieldLabels"
        backLink="/inspections"
        backLabelKey="inspections.list.back"
      >
        <div header>
          <p class="font-mono text-[12px] text-fg-subtle">{{ ins.code }}</p>
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            data-testid="inspection-title"
          >
            {{ ins.title }}
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <app-badge [tone]="statusTone(ins.status)">{{
              statusKey(ins.status) | transloco
            }}</app-badge>
            @if (ins.result) {
              <app-badge [tone]="resultTone(ins.result)" data-testid="result-badge">
                {{ resultKey(ins.result) | transloco }}
              </app-badge>
            }
            @if (ins.is_overdue) {
              <app-badge tone="fail">{{ 'inspections.list.overdue' | transloco }}</app-badge>
            }
            @if (ins.schedule_id) {
              <app-badge tone="neutral">
                <app-icon name="calendar" [size]="12" />
                {{ 'inspections.detail.scheduled' | transloco }}
              </app-badge>
            }
          </div>
        </div>

        <ng-container ngProjectAs="[actions]">
          <app-watch-button [entityType]="entityType" [entityId]="ins.id" />
          @if (ins.status !== 'planned' && ins.status !== 'cancelled') {
            <app-ai-assist-button
              [assist]="summariseAssist"
              labelKey="inspections.ai.summarise"
              [input]="{ inspection_id: ins.id }"
              [entityType]="entityType"
              [entityId]="ins.id"
              (text)="summaryText.set($event)"
            />
          }
          @if (isOpen() && ins.permissions.can_perform) {
            <a [routerLink]="['/inspections', ins.id, 'run']">
              <app-button size="sm" data-testid="run-inspection">
                <app-icon name="checkcircle" [size]="14" />
                {{
                  (ins.status === 'planned'
                    ? 'inspections.detail.start'
                    : 'inspections.detail.continue'
                  ) | transloco
                }}
              </app-button>
            </a>
          }
          @if (isOpen() && ins.permissions.can_edit) {
            <a [routerLink]="['/inspections', ins.id, 'edit']">
              <app-button variant="secondary" size="sm">
                {{ 'inspections.actions.edit' | transloco }}
              </app-button>
            </a>
            <app-button variant="ghost" size="sm" (click)="cancelOpen.set(true)">
              {{ 'inspections.detail.cancel' | transloco }}
            </app-button>
          }
          @if (ins.permissions.can_manage) {
            <app-button variant="danger" size="sm" (click)="confirmDelete.set(true)">
              <app-icon name="trash" [size]="14" />
              {{ 'inspections.actions.delete' | transloco }}
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="inspections" page="detail" />
          @if (summaryText()) {
            <app-card>
              <h2 class="mb-1 flex items-center gap-1.5 text-[14px] font-bold text-fg">
                <app-icon name="spark" [size]="14" />
                {{ 'inspections.ai.summaryTitle' | transloco }}
              </h2>
              <div class="text-[13.5px] text-fg" [innerHTML]="summaryText() | appMarkdown"></div>
            </app-card>
          }
          @if (ins.status === 'cancelled') {
            <app-alert tone="info">
              {{ 'inspections.detail.cancelledNotice' | transloco }}
              @if (ins.cancel_reason) {
                — {{ ins.cancel_reason }}
              }
            </app-alert>
          }

          <app-card>
            <h2 class="mb-3 text-[15px] font-bold text-fg">
              {{ 'inspections.detail.overview' | transloco }}
            </h2>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt class="cf-dt">{{ 'inspections.fields.template' | transloco }}</dt>
                <dd>
                  @if (ins.template; as t) {
                    <a
                      [routerLink]="['/inspections/templates', t.id]"
                      class="text-accent hover:underline"
                    >
                      {{ t.title }}
                    </a>
                    <span class="text-fg-muted">
                      · {{ 'inspections.templates.version' | transloco: { version: t.version } }}
                    </span>
                  } @else {
                    —
                  }
                </dd>
              </div>
              <div>
                <dt class="cf-dt">{{ 'inspections.fields.location' | transloco }}</dt>
                <dd class="text-fg">{{ ins.location || '—' }}</dd>
              </div>
              <div>
                <dt class="cf-dt">{{ 'inspections.fields.inspector' | transloco }}</dt>
                <dd class="text-fg">
                  {{ ins.inspector?.name ?? ('inspections.list.noInspector' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="cf-dt">{{ 'inspections.fields.owner' | transloco }}</dt>
                <dd class="text-fg">{{ ins.owner?.name ?? '—' }}</dd>
              </div>
              <div>
                <dt class="cf-dt">{{ 'inspections.fields.department' | transloco }}</dt>
                <dd class="text-fg">{{ departmentName() ?? '—' }}</dd>
              </div>
              <div>
                <dt class="cf-dt">{{ 'inspections.fields.dueAt' | transloco }}</dt>
                <dd [class.text-fail]="ins.is_overdue" class="text-fg">
                  {{ ins.due_at ? (ins.due_at | localDay) : '—' }}
                </dd>
              </div>
              @if (ins.started_at) {
                <div>
                  <dt class="cf-dt">{{ 'inspections.fields.startedAt' | transloco }}</dt>
                  <dd class="text-fg">{{ ins.started_at | localDate: 'medium' }}</dd>
                </div>
              }
              @if (ins.completed_at) {
                <div>
                  <dt class="cf-dt">{{ 'inspections.fields.completedAt' | transloco }}</dt>
                  <dd class="text-fg">
                    {{ ins.completed_at | localDate: 'medium' }}
                    @if (ins.completed_by?.name) {
                      · {{ ins.completed_by?.name }}
                    }
                  </dd>
                </div>
              }
              @if (ins.notes) {
                <div class="sm:col-span-2">
                  <dt class="cf-dt">{{ 'inspections.fields.notes' | transloco }}</dt>
                  <dd class="whitespace-pre-line text-fg">{{ ins.notes }}</dd>
                </div>
              }
            </dl>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-[15px] font-bold text-fg">
                {{ 'inspections.detail.answers' | transloco }}
              </h2>
              <app-ask-about
                [prompt]="'inspections.detail.askExplain' | transloco: { code: ins.code }"
                field="responses"
              />
            </div>
            @if (ins.status === 'planned') {
              <p class="text-[13px] text-fg-muted">
                {{ 'inspections.detail.notStarted' | transloco }}
              </p>
            }
            @for (group of sections(); track $index) {
              <section class="mb-4 last:mb-0">
                @if (group.title) {
                  <h3 class="mb-2 text-[12.5px] font-bold tracking-wide text-fg-subtle uppercase">
                    {{ group.title }}
                  </h3>
                }
                <ol class="flex flex-col divide-y divide-border">
                  @for (q of group.items; track q.id) {
                    @let r = responseOf(q.id);
                    <li
                      class="flex flex-wrap items-start gap-2 py-2"
                      [attr.data-testid]="'response-' + q.id"
                    >
                      <span class="font-mono text-[12px] text-fg-subtle"
                        >{{ numberOf(q.id) }}.</span
                      >
                      <span class="min-w-0 flex-1 basis-[220px] text-[13.5px] text-fg">
                        {{ q.text }}
                        @if (r?.note) {
                          <span
                            class="mt-0.5 block text-[12.5px] whitespace-pre-line text-fg-muted"
                            >{{ r?.note }}</span
                          >
                        }
                      </span>
                      <span class="flex flex-wrap items-center gap-1.5 text-[13px]">
                        @if (!r) {
                          <span class="text-fg-subtle">{{
                            'inspections.detail.unanswered' | transloco
                          }}</span>
                        } @else if (r.is_na) {
                          <app-badge tone="neutral">{{
                            'inspections.answers.na' | transloco
                          }}</app-badge>
                        } @else {
                          <span
                            class="font-semibold"
                            [class.text-fail]="r.failed"
                            [class.text-fg]="!r.failed"
                          >
                            {{ answerLabel(q, r) }}
                          </span>
                          @if (r.failed) {
                            <app-badge tone="fail">{{
                              'inspections.run.failed' | transloco
                            }}</app-badge>
                          }
                        }
                      </span>
                    </li>
                  }
                </ol>
              </section>
            }
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-[15px] font-bold text-fg">
                {{ 'inspections.detail.findings' | transloco: { count: ins.findings.length } }}
              </h2>
              @if (canRaise()) {
                <app-button
                  size="sm"
                  variant="secondary"
                  (click)="findingFormOpen.set(true)"
                  data-testid="add-finding"
                >
                  <app-icon name="plus" [size]="14" />
                  {{ 'inspections.findings.add' | transloco }}
                </app-button>
              }
            </div>
            <app-field-help scope="inspections" page="detail" field="findings" />
            <ul class="mt-2 flex flex-col divide-y divide-border" data-testid="finding-list">
              @for (f of ins.findings; track f.id) {
                <li>
                  <button
                    type="button"
                    class="flex w-full flex-wrap items-center gap-2 py-2.5 text-left hover:bg-surface-2"
                    (click)="openFinding(f.id)"
                  >
                    <span class="w-[76px] flex-none font-mono text-[12px] text-fg-subtle">{{
                      f.code
                    }}</span>
                    <span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">{{
                      f.title
                    }}</span>
                    <app-badge [tone]="severityTone(f.severity)">{{
                      severityKey(f.severity) | transloco
                    }}</app-badge>
                    <app-badge [tone]="findingStatusTone(f.status)">{{
                      findingStatusKey(f.status) | transloco
                    }}</app-badge>
                    @if (f.deviation; as dev) {
                      <app-badge tone="accent"
                        ><app-icon name="flag" [size]="12" /> {{ dev.code }}</app-badge
                      >
                    }
                  </button>
                </li>
              } @empty {
                <li class="py-2 text-[13px] text-fg-muted">
                  {{ 'inspections.detail.noFindings' | transloco }}
                </li>
              }
            </ul>
          </app-card>
          <app-why-it-matters scope="inspections" page="detail" />
        </div>

        <ng-container ngProjectAs="[aside]">
          <app-card>
            <h2 class="mb-2 text-[14px] font-bold text-fg">
              {{ 'inspections.detail.score' | transloco }}
            </h2>
            @if (ins.status === 'completed') {
              <p
                class="font-display text-[30px] leading-none font-bold"
                [class.text-pass]="ins.result === 'passed'"
                [class.text-fail]="ins.result === 'failed'"
              >
                {{ ins.score_pct === null ? '—' : (ins.score_pct | localPercent) }}
              </p>
              @if (ins.score_possible) {
                <p class="mt-1 text-[12.5px] text-fg-muted">
                  {{
                    'inspections.detail.points'
                      | transloco: { earned: ins.score_earned, possible: ins.score_possible }
                  }}
                </p>
              }
            } @else {
              <app-progress-bar
                [value]="ins.question_count ? (100 * ins.answered_count) / ins.question_count : 0"
                [label]="'inspections.run.progressLabel' | transloco"
              />
              <p class="mt-1.5 text-[12.5px] text-fg-muted">
                {{
                  'inspections.run.progress'
                    | transloco: { answered: ins.answered_count, total: ins.question_count }
                }}
              </p>
            }
            <dl class="mt-3 flex flex-col gap-1.5 text-[13px]">
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'inspections.fields.passThreshold' | transloco }}</dt>
                <dd class="text-fg">
                  {{
                    ins.pass_threshold === null
                      ? ('inspections.templates.noPassMark' | transloco)
                      : (ins.pass_threshold | localPercent)
                  }}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'inspections.detail.failedAnswers' | transloco }}</dt>
                <dd class="text-fg">{{ ins.failed_count }}</dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-fg-muted">{{ 'inspections.detail.openFindings' | transloco }}</dt>
                <dd class="text-fg">{{ ins.open_finding_count }}</dd>
              </div>
            </dl>
            <app-field-help class="mt-2 block" scope="inspections" page="detail" field="score" />
          </app-card>
          @if (ins.summary || ins.signature) {
            <app-card>
              @if (ins.summary) {
                <h2 class="mb-1 text-[14px] font-bold text-fg">
                  {{ 'inspections.fields.summary' | transloco }}
                </h2>
                <p class="mb-3 text-[13px] whitespace-pre-line text-fg">{{ ins.summary }}</p>
              }
              @if (ins.signature; as sig) {
                <h2 class="mb-1 text-[14px] font-bold text-fg">
                  {{ 'inspections.fields.signature' | transloco }}
                </h2>
                @if (sig.image) {
                  <img
                    [src]="sig.image"
                    [alt]="'inspections.signature.imageAlt' | transloco: { name: sig.name }"
                    class="mb-1 h-[64px] rounded border border-border bg-white"
                  />
                }
                <p class="text-[13px] text-fg">
                  {{ sig.name }}
                  @if (sig.signed_at) {
                    <span class="text-fg-muted"> · {{ sig.signed_at | localDate: 'medium' }}</span>
                  }
                </p>
              }
            </app-card>
          }
          <app-supports-requirements [entityType]="entityType" [entityId]="ins.id" />
        </ng-container>
      </app-record-detail-layout>

      <app-slide-over
        [open]="!!openFindingId()"
        [title]="'inspections.findings.panelTitle' | transloco"
        [closeLabel]="'inspections.actions.close' | transloco"
        [width]="580"
        (closed)="closeFinding()"
      >
        @if (selectedFinding(); as f) {
          <app-finding-panel
            [finding]="f"
            [permissions]="ins.permissions"
            (changed)="onFindingChanged($event)"
            (deleted)="onFindingDeleted($event)"
          />
        } @else if (openFindingId()) {
          <p class="text-[13px] text-fg-muted">{{ 'inspections.findings.notFound' | transloco }}</p>
        }
      </app-slide-over>

      <app-slide-over
        [open]="findingFormOpen()"
        [title]="'inspections.findings.addTitle' | transloco"
        [closeLabel]="'inspections.actions.close' | transloco"
        [width]="560"
        (closed)="findingFormOpen.set(false)"
      >
        @if (findingFormOpen()) {
          <app-finding-form
            [inspection]="ins"
            (saved)="onFindingRaised($event)"
            (cancelled)="findingFormOpen.set(false)"
          />
        }
      </app-slide-over>

      <app-prompt-dialog
        [open]="cancelOpen()"
        [title]="'inspections.detail.cancelTitle' | transloco"
        [message]="'inspections.detail.cancelMessage' | transloco"
        [label]="'inspections.fields.cancelReason' | transloco"
        [confirmLabel]="'inspections.detail.cancel' | transloco"
        [cancelLabel]="'inspections.actions.back' | transloco"
        confirmVariant="danger"
        [busy]="busy()"
        (confirmed)="cancelInspection($event)"
        (cancelled)="cancelOpen.set(false)"
      />
      <app-confirm-dialog
        [open]="confirmDelete()"
        [title]="'inspections.detail.deleteTitle' | transloco"
        [message]="'inspections.detail.deleteMessage' | transloco: { code: ins.code }"
        [confirmLabel]="'inspections.actions.delete' | transloco"
        [cancelLabel]="'inspections.actions.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="confirmDelete.set(false)"
      />
    } @else if (notFound()) {
      <div class="mx-auto max-w-[720px] px-4 py-10 sm:px-8">
        <app-alert tone="error">{{ 'inspections.detail.notFound' | transloco }}</app-alert>
        <a routerLink="/inspections" class="mt-3 inline-block font-semibold text-accent">
          {{ 'inspections.list.back' | transloco }}
        </a>
      </div>
    } @else {
      <p class="px-8 py-10 text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
    }
  `,
  styles: [
    `
      .cf-dt {
        margin-bottom: 2px;
        font-size: 12px;
        font-weight: 600;
        color: var(--fg-muted);
      }
    `,
  ],
})
export class InspectionDetailPage {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);
  private readonly references = inject(InspectionReferences);
  private readonly language = inject(LanguageService);

  readonly id = input.required<string>();
  /** `?finding=<id>` (the finding's URL) opens it in the side panel. */
  readonly finding = input<string | undefined>(undefined);

  protected readonly entityType = INSPECTION_ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = INSPECTION_FIELD_LABELS;
  protected readonly summariseAssist = ASSIST_SUMMARISE_RESULTS;
  protected readonly statusKey = inspectionStatusKey;
  protected readonly statusTone = inspectionStatusTone;
  protected readonly resultKey = resultKey;
  protected readonly resultTone = resultTone;
  protected readonly severityKey = severityKey;
  protected readonly severityTone = severityTone;
  protected readonly findingStatusKey = findingStatusKey;
  protected readonly findingStatusTone = findingStatusTone;

  protected readonly inspection = signal<InspectionDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly findingFormOpen = signal(false);
  protected readonly summaryText = signal('');
  protected readonly openFindingId = signal<string | null>(null);

  protected readonly isOpen = computed(() => {
    const s = this.inspection()?.status;
    return s === 'planned' || s === 'in_progress';
  });

  protected readonly canRaise = computed(() => {
    const ins = this.inspection();
    return (
      !!ins &&
      (ins.status === 'in_progress' || ins.status === 'completed') &&
      (ins.permissions.can_perform || ins.permissions.can_edit) &&
      (this.selectedOrg.currentOrg()?.permissions.includes('inspections:write') ?? false)
    );
  });

  protected readonly sections = computed(() => groupBySection(this.inspection()?.questions ?? []));
  private readonly numbers = computed(
    () => new Map((this.inspection()?.questions ?? []).map((q, i) => [q.id, i + 1] as const)),
  );
  private readonly responses = computed(
    () => new Map((this.inspection()?.responses ?? []).map((r) => [r.question_id, r] as const)),
  );

  protected readonly selectedFinding = computed<Finding | null>(() => {
    const id = this.openFindingId();
    return id ? (this.inspection()?.findings.find((f) => f.id === id) ?? null) : null;
  });

  protected readonly departmentName = computed(() =>
    this.references.departmentName(this.inspection()?.department_id),
  );

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: this.openFindingId() ? 'inspection_finding' : INSPECTION_ENTITY_TYPE,
      entityId: this.openFindingId() ?? this.id(),
      view: 'detail',
      title: this.inspection()?.title ?? null,
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() => this.load(orgId, id));
      }
    });

    effect(() => {
      const fid = this.finding();
      untracked(() => this.openFindingId.set(fid || null));
    });

    this.references.ensurePeople();
  }

  private load(orgId: string, id: string): void {
    this.api.get(orgId, id).subscribe({
      next: (ins) => {
        this.notFound.set(false);
        this.inspection.set(ins);
      },
      error: () => this.notFound.set(true),
    });
  }

  private reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    if (orgId && ins) {
      this.load(orgId, ins.id);
    }
  }

  protected numberOf(id: string): number {
    return this.numbers().get(id) ?? 0;
  }

  protected responseOf(id: string): InspectionResponse | undefined {
    return this.responses().get(id);
  }

  /** A short display of an answer (translated yes/no, score, number with unit, ...). */
  protected answerLabel(q: Question, r: InspectionResponse): string {
    switch (q.type) {
      case 'photo':
        return `${r.attachment_ids.length} ×`;
      case 'signature':
        return (r.value as Signature | null)?.name ?? '';
      case 'score':
        return `${r.value} / ${q.scale_max}`;
      case 'number':
        return `${r.value}${q.unit ? ' ' + q.unit : ''}`;
      case 'yes_no':
        return this.yesNo(String(r.value));
      default:
        return String(r.value ?? '');
    }
  }

  private readonly yesNoLabels = computed(() => ({
    yes: this.language.translate('inspections.answers.yes'),
    no: this.language.translate('inspections.answers.no'),
  }));

  private yesNo(value: string): string {
    const labels = this.yesNoLabels();
    return value === 'yes' ? labels.yes : value === 'no' ? labels.no : value;
  }

  protected openFinding(id: string): void {
    this.openFindingId.set(id);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { finding: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected closeFinding(): void {
    this.openFindingId.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { finding: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onFindingChanged(f: Finding): void {
    this.inspection.update((ins) =>
      ins ? { ...ins, findings: ins.findings.map((x) => (x.id === f.id ? f : x)) } : ins,
    );
    this.reload();
  }

  protected onFindingDeleted(id: string): void {
    this.closeFinding();
    this.inspection.update((ins) =>
      ins ? { ...ins, findings: ins.findings.filter((x) => x.id !== id) } : ins,
    );
    this.reload();
  }

  protected onFindingRaised(f: Finding): void {
    this.findingFormOpen.set(false);
    this.inspection.update((ins) => (ins ? { ...ins, findings: [...ins.findings, f] } : ins));
    this.reload();
  }

  protected cancelInspection(reason: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    if (!orgId || !ins) {
      return;
    }
    this.busy.set(true);
    this.api.cancel(orgId, ins.id, reason).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.inspection.set(updated);
        this.notifications.success('inspections.notices.cancelled', { code: updated.code });
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    if (!orgId || !ins) {
      return;
    }
    this.busy.set(true);
    this.api.delete(orgId, ins.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('inspections.notices.deleted', { code: ins.code });
        void this.router.navigate(['/inspections']);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }
}
