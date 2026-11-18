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
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { pluralKey } from '../../shared/i18n/plural';
import { Subscription, catchError, of } from 'rxjs';
import { AiAvailability } from '../../core/ai/ai-availability';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { KitApi } from '../../core/kit/kit-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { AskPanelService } from '../ask/ask-panel.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, formatLocalDay } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  attentionBadge,
  classificationBadge,
  levelBadge,
  lifecycleBadge,
  localizedLabel,
  reviewDueBadge,
  reviewStatusBadge,
  stateCategoryBadge,
} from './data/asset-display';
import { assetErrorKey } from './data/asset-errors';
import {
  AssetDetail,
  AttentionCode,
  ChangeRequest,
  LocalizedLabel,
  SYSTEM_ASSET_TYPES,
} from './data/asset.models';
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
  supplier_id: 'assets.fields.supplier',
  model: 'assets.fields.model',
  serial_number: 'assets.fields.serialNumber',
  version: 'assets.fields.version',
  contains_personal_data: 'assets.fields.containsPersonalData',
  handling_rules: 'assets.fields.handlingRules',
  acquired_on: 'assets.fields.acquiredOn',
  warranty_until: 'assets.fields.warrantyUntil',
  end_of_life_on: 'assets.fields.endOfLifeOn',
  review_date: 'assets.fields.reviewDate',
  review_interval_months: 'assets.fields.reviewInterval',
  last_reviewed_at: 'assets.fields.lastReviewedAt',
  last_reviewed_by: 'assets.fields.lastReviewedBy',
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

/** The optional profile fields shown in "Detaljer" (only when filled in). */
const PROFILE_FIELDS = [
  { field: 'location', label: 'location' },
  { field: 'model', label: 'model' },
  { field: 'serial_number', label: 'serialNumber' },
  { field: 'version', label: 'version' },
  { field: 'category', label: 'category' },
] as const;

const DATE_FIELDS = [
  { field: 'acquired_on', label: 'acquiredOn' },
  { field: 'warranty_until', label: 'warrantyUntil' },
  { field: 'end_of_life_on', label: 'endOfLifeOn' },
  { field: 'retired_on', label: 'retiredOn' },
  { field: 'disposed_on', label: 'disposedOn' },
] as const;

/** What closes a follow-up flag on the asset page. */
export type AttentionActionKind =
  | 'calibrate'
  | 'impact'
  | 'review'
  | 'edit'
  | 'processing'
  | 'none';

export function attentionAction(code: AttentionCode): AttentionActionKind {
  switch (code) {
    case 'calibration_overdue_in_use':
      return 'calibrate';
    case 'calibration_impact_missing':
      return 'impact';
    case 'review_overdue':
      return 'review';
    case 'no_owner':
    case 'held_by_leaver':
      return 'edit';
    case 'personal_data_unlinked':
      return 'processing';
    default:
      return 'none';
  }
}

/** Whether the information-security fields (CIA, handling) say nothing yet. */
export function securityUnset(a: AssetDetail): boolean {
  return !a.confidentiality && !a.integrity && !a.availability && !a.handling_rules;
}

/**
 * An asset's page (`/assets/:id`; `?calibration=<id>` highlights a calibration and
 * `?calibrate=1` opens "Registrer kalibrering"). Up front: what needs follow-up (each
 * flag with the action that closes it) and, for an overdue instrument still in use,
 * "do not use for verification until calibrated" with "Merk som ute av bruk". Then
 * calibration for measuring equipment, classification and protection (with
 * criticality, personal data and the processing activities it is linked to), the
 * register review (who confirmed it and when, "Bekreft gjennomgang"), the details
 * that are filled in (supplier from the Suppliers register), the access reviews of a
 * system and its change requests. The aside shows the requirements the asset
 * documents and its connections; "Lag ny fra denne" creates a deviation, risk,
 * processing activity, change or access review from it.
 */
@Component({
  selector: 'app-asset-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Alert,
    AssetCalibrationPanel,
    Button,
    Card,
    ConfirmDialog,
    EntityChip,
    EntityTasks,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    RecordDetailLayout,
    StatusBadge,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8"><app-loading-state [rows]="6" /></div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/assets"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'assets.common.backToInventory' | transloco }}
          </a>
          <app-error-state
            titleKey="assets.detail.notFoundTitle"
            bodyKey="assets.detail.notFound"
            (retry)="reload()"
          />
        </div>
      }
      @default {
        @if (asset(); as a) {
          <app-record-detail-layout
            entityType="asset"
            [entityId]="a.id"
            [title]="a.name"
            [breadcrumbs]="[
              { labelKey: 'modules.names.assets', link: '/assets' },
              { label: a.name },
            ]"
            [tabs]="tabs"
            [counts]="{ tasks: a.open_tasks }"
            [canEdit]="canWrite()"
            [requirementsPanel]="true"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            backLink="/assets"
            backLabelKey="assets.common.backToInventory"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ a.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'assets.assetType.' + a.asset_type | transloco }}</span>
              <app-status-badge
                [meaning]="lifeBadge(a.lifecycle_status).meaning"
                [value]="lifeBadge(a.lifecycle_status).value"
                [labelKey]="'assets.lifecycle.' + a.lifecycle_status"
              />
              @if (a.criticality) {
                <app-status-badge
                  [meaning]="critBadge(a.criticality).meaning"
                  [value]="critBadge(a.criticality).value"
                  labelKey="assets.criticalityLabel"
                  [labelParams]="{ level: ('assets.criticality.' + a.criticality | transloco) }"
                />
              }
              <app-status-badge
                [meaning]="classBadge(a.classification).meaning"
                [value]="classBadge(a.classification).value"
                [labelKey]="'assets.classification.' + a.classification"
              />
            </ng-container>

            @if (canWrite() && !closed() && a.requires_calibration) {
              <app-button primary data-testid="header-calibrate" (click)="openCalibration()">
                {{ 'assets.calibration.record' | transloco }}
              </app-button>
            }
            @if (canWrite() && !closed() && !a.requires_calibration) {
              <app-button primary data-testid="header-review" (click)="reviewOpen.set(true)">
                {{ 'assets.review.confirm' | transloco }}
              </app-button>
            }
            @if (canWrite()) {
              <a
                secondary
                [routerLink]="['/assets', a.id, 'edit']"
                class="inline-flex h-9 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
              >
                {{ 'assets.common.edit' | transloco }}
              </a>
            }
            <app-watch-button secondary entityType="asset" [entityId]="a.id" />
            @if (canWrite() && !closed() && a.requires_calibration) {
              <button appMenuItem overflow type="button" (click)="reviewOpen.set(true)">
                {{ 'assets.review.confirm' | transloco }}
              </button>
            }
            @if (!ai.unavailable()) {
              <button appMenuItem overflow type="button" (click)="askSummary()">
                {{ 'assets.ai.summarise' | transloco }}
              </button>
            }
            @if (canManage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="confirmDelete.set(true)"
              >
                {{ 'assets.common.delete' | transloco }}
              </button>
            }

            <app-help-strip
              help
              scope="assets"
              [page]="a.requires_calibration ? 'detailInstrument' : 'detail'"
              [lesson]="a.requires_calibration ? 'calibration' : 'asset-inventory'"
              [subject]="a.name"
            />

            <div class="flex flex-col gap-5">
              @if (quarantineWarning()) {
                <app-alert tone="error">
                  <div
                    class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                    data-testid="quarantine-warning"
                  >
                    <span>
                      <strong>{{ 'assets.detail.doNotUseTitle' | transloco }}</strong>
                      {{ 'assets.detail.doNotUseBody' | transloco }}
                    </span>
                    @if (canWrite()) {
                      <app-button
                        size="sm"
                        variant="secondary"
                        [disabled]="busy()"
                        (click)="quarantine(a)"
                      >
                        {{ 'assets.detail.markOutOfUse' | transloco }}
                      </app-button>
                    }
                  </div>
                </app-alert>
              }

              @if (attention().length) {
                <app-card>
                  <div data-testid="attention-card">
                    <h2
                      class="mb-2 flex items-center gap-2 font-display text-card font-bold text-fg"
                    >
                      <app-icon name="alert" [size]="16" class="text-warn-ink" />
                      {{
                        'assets.detail.attentionTitle' | transloco: { count: attention().length }
                      }}
                    </h2>
                    <ul class="flex flex-col divide-y divide-border">
                      @for (code of attention(); track code) {
                        <li
                          class="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                          [attr.data-code]="code"
                        >
                          <div class="min-w-0 flex-1">
                            <app-status-badge
                              [meaning]="attnBadge(code).meaning"
                              [value]="attnBadge(code).value"
                              [labelKey]="'assets.attention.' + code"
                            />
                            <p class="mt-1 text-ui text-fg-muted">
                              {{ 'assets.attentionWhy.' + code | transloco }}
                            </p>
                          </div>
                          @if (canWrite()) {
                            @switch (actionFor(code)) {
                              @case ('calibrate') {
                                <app-button
                                  size="sm"
                                  variant="secondary"
                                  (click)="openCalibration()"
                                >
                                  {{ 'assets.calibration.record' | transloco }}
                                </app-button>
                              }
                              @case ('impact') {
                                <app-button
                                  size="sm"
                                  variant="secondary"
                                  (click)="scrollToCalibration()"
                                >
                                  {{ 'assets.attentionAction.' + code | transloco }}
                                </app-button>
                              }
                              @case ('review') {
                                <app-button
                                  size="sm"
                                  variant="secondary"
                                  (click)="reviewOpen.set(true)"
                                >
                                  {{ 'assets.review.confirm' | transloco }}
                                </app-button>
                              }
                              @case ('edit') {
                                <a
                                  [routerLink]="['/assets', a.id, 'edit']"
                                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
                                >
                                  {{ 'assets.attentionAction.' + code | transloco }}
                                </a>
                              }
                              @case ('processing') {
                                @if (flowEnabled('asset.to_processing')) {
                                  <app-button
                                    size="sm"
                                    variant="secondary"
                                    (click)="startFlow('asset.to_processing')"
                                  >
                                    {{ 'assets.attentionAction.' + code | transloco }}
                                  </app-button>
                                }
                              }
                            }
                          }
                        </li>
                      }
                    </ul>
                  </div>
                </app-card>
              }

              @if (a.requires_calibration) {
                <div id="asset-calibration">
                  <app-asset-calibration-panel
                    [asset]="a"
                    [canWrite]="canWrite()"
                    [canCreateDeviation]="flowEnabled('calibration.to_deviation') || canDeviate()"
                    [highlight]="calibration() ?? null"
                    [lang]="lang()"
                    (changed)="reload()"
                  />
                </div>
              }

              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'assets.detail.protection' | transloco }}
                  </h2>
                </div>
                <app-field-list [columns]="3">
                  <app-field-item labelKey="assets.fields.classification" [wide]="true">
                    {{ 'assets.classificationHelp.' + a.classification | transloco }}
                  </app-field-item>
                  <app-field-item labelKey="assets.fields.criticality">
                    @if (a.criticality) {
                      {{ 'assets.criticality.' + a.criticality | transloco }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="assets.fields.containsPersonalData">
                    {{
                      (a.contains_personal_data ? 'assets.common.yes' : 'assets.common.no')
                        | transloco
                    }}
                  </app-field-item>
                  @if (a.contains_personal_data) {
                    <app-field-item labelKey="assets.fields.processingActivities">
                      @if (a.processing_activities) {
                        {{
                          pluralKey('assets.detail.processingLinked', a.processing_activities)
                            | transloco: { count: a.processing_activities }
                        }}
                      } @else {
                        <span class="font-semibold text-warn-ink">{{
                          'assets.detail.processingNone' | transloco
                        }}</span>
                      }
                    </app-field-item>
                  }
                </app-field-list>
                @if (securityCollapsed()) {
                  <details
                    class="mt-4 rounded-tile border border-border px-3 py-2"
                    data-testid="security-optional"
                  >
                    <summary class="cursor-pointer text-ui font-semibold text-fg-muted">
                      {{ 'assets.detail.securityOptional' | transloco }}
                    </summary>
                    <p class="mt-2 text-meta text-fg-muted">
                      {{ 'assets.detail.securityOptionalHint' | transloco }}
                    </p>
                  </details>
                } @else {
                  <h3 class="mt-5 mb-2 text-ui font-semibold text-fg">
                    {{ 'assets.form.cia' | transloco }}
                  </h3>
                  <app-field-list [columns]="3">
                    @for (key of ciaKeys; track key) {
                      <app-field-item [labelKey]="'assets.fields.' + key">
                        @if (a[key]) {
                          {{ 'assets.level.' + a[key] | transloco }}
                        }
                      </app-field-item>
                    }
                    <app-field-item
                      labelKey="assets.fields.handlingRules"
                      [wide]="true"
                      empty="none"
                    >
                      @if (a.handling_rules) {
                        <div
                          class="cf-prose text-body"
                          [innerHTML]="a.handling_rules | appMarkdown"
                        ></div>
                      }
                    </app-field-item>
                  </app-field-list>
                }
              </app-card>

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'assets.review.title' | transloco }}
                  </h2>
                  @if (canWrite() && !closed()) {
                    <app-button size="sm" variant="secondary" (click)="reviewOpen.set(true)">
                      {{ 'assets.review.confirm' | transloco }}
                    </app-button>
                  }
                </div>
                <app-field-list [columns]="3">
                  <app-field-item labelKey="assets.fields.reviewDate">
                    @if (a.review_date) {
                      {{ a.review_date | localDay }}
                      @if (a.review_status && a.review_status !== 'ok') {
                        <app-status-badge
                          class="ml-1"
                          [meaning]="reviewBadge(a.review_status).meaning"
                          [value]="reviewBadge(a.review_status).value"
                          [labelKey]="'assets.reviewDue.' + a.review_status"
                        />
                      }
                    }
                  </app-field-item>
                  <app-field-item labelKey="assets.fields.lastReviewed" empty="none">
                    @if (a.last_reviewed_at) {
                      {{
                        'assets.review.lastBy'
                          | transloco
                            : {
                                date: (a.last_reviewed_at | localDate: 'mediumDate'),
                                name:
                                  a.last_reviewed_by?.name ?? ('assets.common.unknown' | transloco),
                              }
                      }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="assets.fields.reviewInterval">
                    {{
                      'assets.review.everyMonths'
                        | transloco: { months: a.review_interval_months ?? 12 }
                    }}
                  </app-field-item>
                </app-field-list>
                <p class="mt-3 text-meta text-fg-subtle">{{ 'assets.review.hint' | transloco }}</p>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'assets.detail.profile' | transloco }}
                </h2>
                @if (a.description) {
                  <div
                    class="cf-prose mb-4 text-body leading-relaxed text-fg"
                    [innerHTML]="a.description | appMarkdown"
                  ></div>
                }
                <app-field-list [columns]="3">
                  <app-field-item
                    labelKey="assets.fields.owner"
                    empty="none"
                    [value]="a.owner?.name"
                  />
                  @if (a.custodian) {
                    <app-field-item labelKey="assets.fields.custodian" [value]="a.custodian.name" />
                  }
                  @if (a.supplier || a.vendor) {
                    <app-field-item labelKey="assets.fields.supplier">
                      @if (a.supplier; as s) {
                        <app-entity-chip
                          [ref]="{
                            entity_type: 'supplier',
                            entity_id: s.id,
                            code: s.code,
                            title: s.name,
                            url: s.url,
                          }"
                        />
                      } @else {
                        {{ a.vendor }}
                      }
                    </app-field-item>
                  }
                  @for (key of profileFields; track key.field) {
                    @if (a[key.field]) {
                      <app-field-item
                        [labelKey]="'assets.fields.' + key.label"
                        [value]="a[key.field]"
                      />
                    }
                  }
                  @for (key of dateFields; track key.field) {
                    @if (a[key.field]) {
                      <app-field-item
                        [labelKey]="'assets.fields.' + key.label"
                        [value]="a[key.field] | localDay"
                      />
                    }
                  }
                  @if (a.disposal_method) {
                    <app-field-item
                      labelKey="assets.fields.disposalMethod"
                      [value]="a.disposal_method"
                    />
                  }
                </app-field-list>
                @if (missingDetails().length) {
                  <p class="mt-4 text-meta text-fg-subtle" data-testid="details-missing">
                    {{ 'assets.detail.notFilledIn' | transloco: { fields: missingDetails() } }}
                    @if (canWrite()) {
                      <a
                        [routerLink]="['/assets', a.id, 'edit']"
                        class="ml-1 font-semibold text-accent hover:underline"
                        >{{ 'assets.detail.addDetails' | transloco }}</a
                      >
                    }
                  </p>
                }
              </app-card>

              @if (showReviews()) {
                <app-card>
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="font-display text-card font-bold text-fg">
                      {{ 'assets.detail.reviews' | transloco }}
                    </h2>
                    @if (canManage()) {
                      <app-button size="sm" variant="secondary" (click)="planReview(a)">
                        {{ 'assets.detail.planReview' | transloco }}
                      </app-button>
                    }
                  </div>
                  @let ar = a.access_reviews;
                  <app-field-list [columns]="3">
                    <app-field-item labelKey="assets.detail.lastReview" empty="none">
                      @if (ar.last; as last) {
                        <a
                          [routerLink]="['/assets/access-reviews', last.id]"
                          class="text-accent hover:underline"
                        >
                          {{ last.code }}
                        </a>
                        @if (last.completed_at) {
                          · {{ last.completed_at | localDate: 'mediumDate' }}
                        }
                      }
                    </app-field-item>
                    <app-field-item labelKey="assets.detail.nextReview" empty="none">
                      @if (ar.next; as next) {
                        <a
                          [routerLink]="['/assets/access-reviews', next.id]"
                          class="text-accent hover:underline"
                        >
                          {{ next.code }}
                        </a>
                        ·
                        <span
                          [class.font-semibold]="next.overdue"
                          [class.text-warn-ink]="next.overdue"
                          >{{
                            'assets.reviews.dueOn' | transloco: { date: (next.due_on | localDay) }
                          }}</span
                        >
                      }
                    </app-field-item>
                    <app-field-item labelKey="assets.detail.openRevocations">
                      <span
                        [class.font-semibold]="ar.open_revocations > 0"
                        [class.text-warn-ink]="ar.open_revocations > 0"
                        >{{ ar.open_revocations }}</span
                      >
                    </app-field-item>
                  </app-field-list>
                  @if (ar.items.length) {
                    <ul class="mt-4 flex flex-col divide-y divide-border border-t border-border">
                      @for (r of ar.items; track r.id) {
                        <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                          <a
                            [routerLink]="['/assets/access-reviews', r.id]"
                            class="font-semibold text-fg hover:underline"
                          >
                            <span class="font-mono text-meta text-fg-muted">{{ r.code }}</span>
                            {{ r.title }}
                          </a>
                          <app-status-badge
                            [meaning]="revBadge(r.status).meaning"
                            [value]="revBadge(r.status).value"
                            [labelKey]="'assets.reviewStatus.' + r.status"
                          />
                          <span class="text-meta text-fg-subtle" [class.text-warn-ink]="r.overdue">
                            {{
                              'assets.reviews.dueOn' | transloco: { date: (r.due_on | localDay) }
                            }}
                          </span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="mt-3 text-ui text-fg-subtle">
                      {{ 'assets.detail.noReviews' | transloco }}
                    </p>
                  }
                </app-card>
              }

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'assets.detail.changes' | transloco }}
                  </h2>
                  <div class="flex flex-wrap items-center gap-2">
                    @if (canWrite()) {
                      <app-button size="sm" variant="secondary" (click)="raiseChange(a)">
                        {{ 'assets.detail.raiseChange' | transloco }}
                      </app-button>
                    }
                    <a
                      routerLink="/assets/changes"
                      class="text-meta font-semibold text-accent hover:underline"
                    >
                      {{ 'assets.detail.allChanges' | transloco }}
                    </a>
                  </div>
                </div>
                @if (changes().length) {
                  <ul class="flex flex-col divide-y divide-border">
                    @for (c of changes(); track c.id) {
                      <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                        <a
                          [routerLink]="['/assets/changes', c.id]"
                          class="font-semibold text-fg hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-muted">{{ c.code }}</span>
                          {{ c.title }}
                        </a>
                        <app-status-badge
                          [meaning]="catBadge(c.status_category).meaning"
                          [value]="catBadge(c.status_category).value"
                          [labelKey]="'assets.changeState.' + c.status"
                        />
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-ui text-fg-subtle">{{ 'assets.detail.noChanges' | transloco }}</p>
                }
              </app-card>

              @if (a.notes) {
                <app-card>
                  <h2 class="mb-2 font-display text-card font-bold text-fg">
                    {{ 'assets.fields.notes' | transloco }}
                  </h2>
                  <div class="cf-prose text-body text-fg" [innerHTML]="a.notes | appMarkdown"></div>
                </app-card>
              }

              <app-why-it-matters
                scope="assets"
                [page]="a.requires_calibration ? 'detailInstrument' : 'detail'"
              />
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="asset"
                [entityId]="a.id"
                [canCreate]="canWrite()"
                [entityLabel]="a.code + ' ' + a.name"
              />
            </div>
          </app-record-detail-layout>

          <app-prompt-dialog
            [open]="reviewOpen()"
            [title]="'assets.review.dialogTitle' | transloco: { name: a.name }"
            [message]="
              'assets.review.dialogMessage' | transloco: { months: a.review_interval_months ?? 12 }
            "
            [label]="'assets.review.noteLabel' | transloco"
            [placeholder]="'assets.review.notePlaceholder' | transloco"
            [confirmLabel]="'assets.review.confirm' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [maxLength]="1000"
            [busy]="busy()"
            (confirmed)="confirmReview(a, $event)"
            (cancelled)="reviewOpen.set(false)"
          />
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
  protected readonly pluralKey = pluralKey;
  private readonly api = inject(AssetsApi);
  private readonly kit = inject(KitApi);
  private readonly standards = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly options = inject(AssetOptionsService);
  private readonly flows = inject(CreateFlowService);
  private readonly router = inject(Router);
  protected readonly ai = inject(AiAvailability);

  readonly id = input.required<string>();
  /** `?calibration=<id>`: the calibration to highlight. */
  readonly calibration = input<string | undefined>(undefined);
  /** `?calibrate=1`: open "Registrer kalibrering" when the page loads. */
  readonly calibrate = input<string | undefined>(undefined);

  private readonly calibrationPanel = viewChild(AssetCalibrationPanel);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = ASSET_FIELD_LABELS;
  protected readonly ciaKeys = ['confidentiality', 'integrity', 'availability'] as const;
  protected readonly profileFields = PROFILE_FIELDS;
  protected readonly dateFields = DATE_FIELDS;
  protected readonly lifeBadge = lifecycleBadge;
  protected readonly critBadge = levelBadge;
  protected readonly classBadge = classificationBadge;
  protected readonly attnBadge = attentionBadge;
  protected readonly reviewBadge = reviewDueBadge;
  protected readonly revBadge = reviewStatusBadge;
  protected readonly catBadge = stateCategoryBadge;
  protected readonly actionFor = attentionAction;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly asset = signal<AssetDetail | null>(null);
  protected readonly changes = signal<readonly ChangeRequest[]>([]);
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly reviewOpen = signal(false);
  /** Keys of the create-from-here flows the caller can start from this asset. */
  private readonly flowKeys = signal<ReadonlySet<string>>(new Set());
  /** Confirmed requirement refs, for the assistant's page context. */
  private readonly requirementRefs = signal<readonly string[]>([]);
  private openCalibrationOnLoad = false;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('assets:write'));
  protected readonly canManage = computed(() => this.permissions().includes('assets:manage'));
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));
  protected readonly canDeviate = computed(() => this.permissions().includes('deviations:write'));
  protected readonly lang = computed(() => this.language.active());

  protected readonly closed = computed(() => {
    const status = this.asset()?.lifecycle_status;
    return status === 'retired' || status === 'disposed';
  });
  protected readonly attention = computed<readonly AttentionCode[]>(
    () => this.asset()?.attention ?? [],
  );
  /** An overdue instrument that is still marked as in use. */
  protected readonly quarantineWarning = computed(() => {
    const a = this.asset();
    return (
      !!a &&
      a.requires_calibration &&
      a.calibration_status === 'overdue' &&
      a.lifecycle_status === 'in_use'
    );
  });
  /** Measuring equipment and hardware without any security rating: fold the CIA block away. */
  protected readonly securityCollapsed = computed(() => {
    const a = this.asset();
    return (
      !!a &&
      securityUnset(a) &&
      (a.requires_calibration || a.asset_type === 'hardware' || a.asset_type === 'facility')
    );
  });
  protected readonly showReviews = computed(() => {
    const a = this.asset();
    return !!a && (SYSTEM_ASSET_TYPES.includes(a.asset_type) || a.access_reviews.total > 0);
  });
  /** Labels of the optional details that are still empty ("Modell, Serienummer"). */
  protected readonly missingDetails = computed(() => {
    const a = this.asset();
    if (!a) {
      return '';
    }
    const missing = PROFILE_FIELDS.filter((f) => !a[f.field]).map((f) =>
      this.language.translate(`assets.fields.${f.label}`),
    );
    if (!a.supplier && !a.vendor) {
      missing.unshift(this.language.translate('assets.fields.supplier'));
    }
    return missing.join(', ');
  });

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
        requirements: this.requirementRefs(),
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.openCalibrationOnLoad = !!this.calibrate();
        this.load(orgId, id, true);
        this.loadRelated(orgId, id);
      });
    });
  }

  protected label(value: LocalizedLabel): string {
    return localizedLabel(value, this.language.active());
  }

  protected flowEnabled(key: string): boolean {
    return this.flowKeys().has(key);
  }

  protected startFlow(key: string): void {
    const a = this.asset();
    if (a) {
      void this.flows.start(key, 'asset', a.id);
    }
  }

  protected openCalibration(): void {
    const panel = this.calibrationPanel();
    if (panel) {
      panel.openForm();
    }
  }

  protected scrollToCalibration(): void {
    document.getElementById('asset-calibration')?.scrollIntoView?.({ block: 'start' });
  }

  /** Plan an access review of this system: the create flow prefills it and links it back. */
  protected planReview(a: AssetDetail): void {
    if (this.flowEnabled('asset.to_access_review')) {
      this.startFlow('asset.to_access_review');
      return;
    }
    void this.router.navigate(['/assets/access-reviews/new'], { queryParams: { asset: a.id } });
  }

  protected raiseChange(a: AssetDetail): void {
    if (this.flowEnabled('asset.to_change')) {
      this.startFlow('asset.to_change');
      return;
    }
    void this.router.navigate(['/assets/changes/new'], { queryParams: { asset: a.id } });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.summarise'));
  }

  protected confirmReview(a: AssetDetail, note: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.confirmReview(orgId, a.id, { note: note.trim() || null }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.reviewOpen.set(false);
        this.asset.set(updated);
        this.notifications.success('assets.review.done', {
          date: formatLocalDay(updated.review_date, 'mediumDate', this.language.locale()),
        });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.reviewOpen.set(false);
        this.notifications.error(assetErrorKey(err));
      },
    });
  }

  /** "Merk som ute av bruk": an overdue instrument may not be used until it is calibrated. */
  protected quarantine(a: AssetDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .update(orgId, a.id, {
        lifecycle_status: 'quarantined',
        change_reason: this.language.translate('assets.detail.quarantineReason'),
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.asset.set(updated);
          this.notifications.success('assets.detail.quarantined', { code: a.code });
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.notifications.error(assetErrorKey(err));
        },
      });
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
        if (this.openCalibrationOnLoad && a.requires_calibration && this.canWrite()) {
          this.openCalibrationOnLoad = false;
          setTimeout(() => this.openCalibration());
        }
      },
      error: () => this.state.set('error'),
    });
  }

  private loadRelated(orgId: string | null, id: string): void {
    this.related.unsubscribe();
    this.changes.set([]);
    this.flowKeys.set(new Set());
    this.requirementRefs.set([]);
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
      this.kit
        .createFlows(orgId, 'asset', { entityId: id })
        .pipe(catchError(() => of({ items: [] })))
        .subscribe((res) =>
          this.flowKeys.set(new Set(res.items.filter((f) => f.enabled).map((f) => f.key))),
        ),
    );
    if (this.permissions().includes('standards:read')) {
      this.related.add(
        this.standards
          .listLinks(orgId, { entity_type: 'asset', entity_id: id })
          .pipe(catchError(() => of([])))
          .subscribe((links) =>
            this.requirementRefs.set(
              links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
            ),
          ),
      );
    }
  }
}
