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
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { TeachMe } from '../../shared/guidance/teach-me';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import {
  classificationTone,
  levelTone,
  lifecycleTone,
  localizedLabel,
  reviewStatusTone,
  stateCategoryTone,
} from './data/asset-display';
import { assetErrorKey } from './data/asset-errors';
import { AccessReview, AssetDetail, ChangeRequest, LocalizedLabel } from './data/asset.models';
import { AssetsApi } from './data/assets-api';
import { AssetCalibrationPanel } from './detail/calibration-panel';
import { AssetOptionsService } from './shared/asset-select';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key (the asset's controlled fields). */
export const ASSET_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'assets.fields.code',
  name: 'assets.fields.name',
  description: 'assets.fields.description',
  asset_type: 'assets.fields.assetType',
  category: 'assets.fields.category',
  classification: 'assets.fields.classification',
  confidentiality: 'assets.fields.confidentiality',
  integrity: 'assets.fields.integrity',
  availability: 'assets.fields.availability',
  criticality: 'assets.fields.criticality',
  lifecycle_status: 'assets.fields.lifecycle',
  owner_user_id: 'assets.fields.owner',
  custodian_user_id: 'assets.fields.custodian',
  department_id: 'assets.fields.department',
  location: 'assets.fields.location',
  vendor: 'assets.fields.vendor',
  model: 'assets.fields.model',
  serial_number: 'assets.fields.serialNumber',
  version: 'assets.fields.version',
  contains_personal_data: 'assets.fields.containsPersonalData',
  handling_rules: 'assets.fields.handlingRules',
  acquired_on: 'assets.fields.acquiredOn',
  warranty_until: 'assets.fields.warrantyUntil',
  end_of_life_on: 'assets.fields.endOfLifeOn',
  review_date: 'assets.fields.reviewDate',
  retired_on: 'assets.fields.retiredOn',
  disposed_on: 'assets.fields.disposedOn',
  disposal_method: 'assets.fields.disposalMethod',
  requires_calibration: 'assets.fields.requiresCalibration',
  calibration_interval_months: 'assets.fields.calibrationInterval',
  measurement_range: 'assets.fields.measurementRange',
  accuracy: 'assets.fields.accuracy',
  last_calibrated_on: 'assets.fields.lastCalibratedOn',
  next_calibration_due: 'assets.fields.nextCalibrationDue',
  notes: 'assets.fields.notes',
};

/**
 * An asset's page (`/assets/:id`, `?calibration=<id>` highlights a calibration):
 * classification and the confidentiality / integrity / availability ratings,
 * responsibility and location, lifecycle dates, calibration for measuring
 * equipment, the change requests and access reviews that concern it, and the
 * shared record tabs (tasks, related items, activity, comments, attachments,
 * revisions). Actions: edit, delete and ask the assistant.
 */
@Component({
  selector: 'app-asset-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    MarkdownPipe,
    Alert,
    AskAbout,
    AssetCalibrationPanel,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EntityTasks,
    GuideIntro,
    HasPermissionDirective,
    Icon,
    LessonView,
    RecordDetailLayout,
    SupportsRequirements,
    TeachMe,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="mx-auto max-w-[1180px] px-4 pt-7 text-[14px] text-fg-muted sm:px-8">
          {{ 'assets.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/assets"
            class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'assets.common.backToInventory' | transloco }}
          </a>
          <app-alert>{{ 'assets.detail.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (asset(); as a) {
          <app-record-detail-layout
            entityType="asset"
            [entityId]="a.id"
            [tabs]="tabs"
            [canEdit]="canWrite()"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            backLink="/assets"
            backLabelKey="assets.common.backToInventory"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <span class="font-mono text-[12.5px] text-fg-muted">{{ a.code }}</span>
                <app-badge [tone]="classTone(a.classification)">
                  {{ 'assets.classification.' + a.classification | transloco }}
                </app-badge>
                <app-badge [tone]="lifeTone(a.lifecycle_status)">
                  {{ 'assets.lifecycle.' + a.lifecycle_status | transloco }}
                </app-badge>
                @if (a.criticality) {
                  <app-badge [tone]="critTone(a.criticality)">
                    {{ 'assets.criticality.' + a.criticality | transloco }}
                  </app-badge>
                }
                @if (a.calibration_status === 'overdue') {
                  <app-badge tone="fail">{{
                    'assets.detail.calibrationOverdue' | transloco
                  }}</app-badge>
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ a.name }}
              </h1>
              <p class="mt-1 text-[13px] text-fg-muted">
                {{ 'assets.assetType.' + a.asset_type | transloco }}
                @if (a.category) {
                  · {{ a.category }}
                }
              </p>
            </div>

            <ng-container actions>
              <app-watch-button entityType="asset" [entityId]="a.id" />
              <app-button variant="ghost" size="sm" (click)="askSummary()">
                <app-icon name="spark" [size]="14" />
                {{ 'assets.ai.summarise' | transloco }}
              </app-button>
              @if (canWrite()) {
                <a
                  [routerLink]="['/assets', a.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'assets.common.edit' | transloco }}
                </a>
                <a
                  routerLink="/assets/changes/new"
                  [queryParams]="{ asset: a.id }"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'assets.detail.raiseChange' | transloco }}
                </a>
              }
              @if (canManage()) {
                <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'assets.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="assets" page="detail" />

              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'assets.detail.protection' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'assets.ai.prompts.controls' | transloco"
                    field="classification"
                  />
                </div>
                <dl
                  class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.classification' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ 'assets.classificationHelp.' + a.classification | transloco }}
                    </dd>
                  </div>
                  @for (key of ciaKeys; track key) {
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'assets.fields.' + key | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{
                          a[key]
                            ? ('assets.level.' + a[key] | transloco)
                            : ('assets.common.notSet' | transloco)
                        }}
                      </dd>
                    </div>
                  }
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.containsPersonalData' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        (a.contains_personal_data ? 'assets.common.yes' : 'assets.common.no')
                          | transloco
                      }}
                    </dd>
                  </div>
                  <div class="sm:col-span-2 lg:col-span-3">
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.handlingRules' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (a.handling_rules) {
                        <div
                          class="cf-prose text-[13.5px]"
                          [innerHTML]="a.handling_rules | appMarkdown"
                        ></div>
                      } @else {
                        <span class="text-fg-subtle">{{
                          'assets.detail.noHandlingRules' | transloco
                        }}</span>
                      }
                    </dd>
                  </div>
                </dl>
                @if (a.contains_personal_data) {
                  <p class="mt-4 rounded-tile bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted">
                    {{ 'assets.detail.personalDataHint' | transloco }}
                  </p>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'assets.detail.profile' | transloco }}
                </h2>
                @if (a.description) {
                  <div
                    class="cf-prose mb-4 text-[13.5px] leading-relaxed text-fg"
                    [innerHTML]="a.description | appMarkdown"
                  ></div>
                }
                <dl
                  class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ a.owner?.name ?? ('assets.common.nobody' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.custodian' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ a.custodian?.name ?? ('assets.common.nobody' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.location' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ a.location || '–' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.vendor' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ a.vendor || '–' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.model' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ a.model || '–' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.serialNumber' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ a.serial_number || '–' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.version' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ a.version || '–' }}</dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'assets.detail.lifecycle' | transloco }}
                </h2>
                <dl
                  class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  @for (key of dateKeys; track key.field) {
                    @if (key.always || a[key.field]) {
                      <div>
                        <dt class="text-[12px] text-fg-muted">
                          {{ 'assets.fields.' + key.label | transloco }}
                        </dt>
                        <dd class="text-fg">
                          {{ a[key.field] ? (a[key.field] | localDay) : '–' }}
                        </dd>
                      </div>
                    }
                  }
                  @if (a.disposal_method) {
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'assets.fields.disposalMethod' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ a.disposal_method }}</dd>
                    </div>
                  }
                </dl>
              </app-card>

              @if (a.requires_calibration) {
                <app-asset-calibration-panel
                  [asset]="a"
                  [canWrite]="canWrite()"
                  [highlight]="calibration() ?? null"
                  (changed)="reload()"
                />
              }

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'assets.detail.changes' | transloco }}
                  </h2>
                  <a
                    routerLink="/assets/changes"
                    class="text-[12.5px] font-semibold text-accent hover:underline"
                  >
                    {{ 'assets.detail.allChanges' | transloco }}
                  </a>
                </div>
                @if (changes().length) {
                  <ul class="flex flex-col divide-y divide-border">
                    @for (c of changes(); track c.id) {
                      <li class="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                        <a
                          [routerLink]="['/assets/changes', c.id]"
                          class="font-semibold text-fg hover:underline"
                        >
                          <span class="font-mono text-[12px] text-fg-muted">{{ c.code }}</span>
                          {{ c.title }}
                        </a>
                        <app-badge [tone]="catTone(c.status_category)">{{
                          label(c.status_label)
                        }}</app-badge>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-[13px] text-fg-subtle">
                    {{ 'assets.detail.noChanges' | transloco }}
                  </p>
                }
              </app-card>

              @if (a.asset_type === 'software' || a.asset_type === 'service' || reviews().length) {
                <app-card>
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="font-display text-[15px] font-bold text-fg">
                      {{ 'assets.detail.reviews' | transloco }}
                    </h2>
                    @if (canManage()) {
                      <a
                        routerLink="/assets/access-reviews/new"
                        [queryParams]="{ asset: a.id }"
                        class="text-[12.5px] font-semibold text-accent hover:underline"
                      >
                        {{ 'assets.detail.planReview' | transloco }}
                      </a>
                    }
                  </div>
                  @if (reviews().length) {
                    <ul class="flex flex-col divide-y divide-border">
                      @for (r of reviews(); track r.id) {
                        <li class="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                          <a
                            [routerLink]="['/assets/access-reviews', r.id]"
                            class="font-semibold text-fg hover:underline"
                          >
                            <span class="font-mono text-[12px] text-fg-muted">{{ r.code }}</span>
                            {{ r.title }}
                          </a>
                          <app-badge [tone]="revTone(r.status)">
                            {{ 'assets.reviewStatus.' + r.status | transloco }}
                          </app-badge>
                          <span class="text-fg-subtle" [class.text-fail]="r.overdue">
                            {{
                              'assets.reviews.dueOn' | transloco: { date: (r.due_on | localDay) }
                            }}
                          </span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-[13px] text-fg-subtle">
                      {{ 'assets.detail.noReviews' | transloco }}
                    </p>
                  }
                </app-card>
              }

              @if (a.notes) {
                <app-card>
                  <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                    {{ 'assets.fields.notes' | transloco }}
                  </h2>
                  <div
                    class="cf-prose text-[13.5px] text-fg"
                    [innerHTML]="a.notes | appMarkdown"
                  ></div>
                </app-card>
              }

              <app-why-it-matters scope="assets" page="detail" />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 font-display text-[14px] font-bold text-fg">
                  {{ 'assets.detail.learn' | transloco }}
                </h2>
                <div class="flex flex-col items-start gap-2">
                  <app-lesson scope="assets" lesson="asset-inventory" />
                  @if (a.requires_calibration) {
                    <app-lesson scope="assets" lesson="calibration" />
                  }
                  <app-teach-me topic="assets.detail" [subject]="a.name" />
                </div>
              </app-card>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="asset" [entityId]="a.id" />
              </app-card>
            </ng-container>

            <div tasks>
              <app-entity-tasks
                entityType="asset"
                [entityId]="a.id"
                [canCreate]="canWrite()"
                [entityLabel]="a.code + ' ' + a.name"
              />
            </div>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'assets.detail.deleteTitle' | transloco"
            [message]="'assets.detail.deleteMessage' | transloco: { code: a.code, name: a.name }"
            [confirmLabel]="'assets.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(a)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class AssetDetailPage {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly options = inject(AssetOptionsService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  /** `?calibration=<id>`: the calibration to highlight. */
  readonly calibration = input<string | undefined>(undefined);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = ASSET_FIELD_LABELS;
  protected readonly ciaKeys = ['confidentiality', 'integrity', 'availability'] as const;
  protected readonly dateKeys = [
    { field: 'acquired_on', label: 'acquiredOn', always: true },
    { field: 'warranty_until', label: 'warrantyUntil', always: false },
    { field: 'end_of_life_on', label: 'endOfLifeOn', always: false },
    { field: 'review_date', label: 'reviewDate', always: true },
    { field: 'retired_on', label: 'retiredOn', always: false },
    { field: 'disposed_on', label: 'disposedOn', always: false },
  ] as const;
  protected readonly classTone = classificationTone;
  protected readonly critTone = levelTone;
  protected readonly lifeTone = lifecycleTone;
  protected readonly revTone = reviewStatusTone;
  protected readonly catTone = stateCategoryTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly asset = signal<AssetDetail | null>(null);
  protected readonly changes = signal<readonly ChangeRequest[]>([]);
  protected readonly reviews = signal<readonly AccessReview[]>([]);
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('assets:write'));
  protected readonly canManage = computed(() => this.permissions().includes('assets:manage'));
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));

  private request = new Subscription();
  private related = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.related.unsubscribe();
    });
    providePageContext(() => {
      const a = this.asset();
      return {
        module: 'assets',
        entityType: 'asset',
        entityId: this.id(),
        view: 'detail',
        title: a ? `${a.code} ${a.name}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.load(orgId, id, true);
        this.loadRelated(orgId, id);
      });
    });
  }

  protected label(value: LocalizedLabel): string {
    return localizedLabel(value, this.language.active());
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.summarise'));
  }

  protected remove(a: AssetDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.delete(orgId, a.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.options.refresh();
        this.notifications.success('assets.detail.deleted', { code: a.code });
        void this.router.navigate(['/assets']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(assetErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, id: string, showLoading: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (showLoading) {
      this.state.set('loading');
    }
    this.request = this.api.get(orgId, id).subscribe({
      next: (a) => {
        this.asset.set(a);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private loadRelated(orgId: string | null, id: string): void {
    this.related.unsubscribe();
    this.changes.set([]);
    this.reviews.set([]);
    if (!orgId) {
      return;
    }
    this.related = new Subscription();
    this.related.add(
      this.api.listChanges(orgId, { asset_id: id, sort: '-updated_at', limit: 10 }).subscribe({
        next: (page) => this.changes.set(page.items),
        error: () => this.changes.set([]),
      }),
    );
    this.related.add(
      this.api.listReviews(orgId, { system_asset_id: id, sort: '-due_on', limit: 10 }).subscribe({
        next: (page) => this.reviews.set(page.items),
        error: () => this.reviews.set([]),
      }),
    );
  }
}
