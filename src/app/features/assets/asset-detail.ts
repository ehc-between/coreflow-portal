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
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { KitApi } from '../../core/kit/kit-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { AskPanelService } from '../ask/ask-panel.service';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe, formatLocalDay } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  levelBadge,
  lifecycleBadge,
  reviewStatusBadge,
  stateCategoryBadge,
} from './data/asset-display';
import { assetErrorKey } from './data/asset-errors';
import { AssetDetail, AttentionCode, ChangeRequest, SYSTEM_ASSET_TYPES } from './data/asset.models';
import { AssetsApi } from './data/assets-api';
import { CustomerChip } from '../../shared/customers';
import { AssetCalibrationPanel } from './detail/calibration-panel';
import { AssetOptionsService } from './shared/asset-select';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
  'tasks',
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

/** The optional text fields shown in "Flere detaljer" (empty ones are hidden). */
const PROFILE_FIELDS = [
  { field: 'category', label: 'category' },
  { field: 'model', label: 'model' },
  { field: 'serial_number', label: 'serialNumber' },
  { field: 'version', label: 'version' },
] as const;

/** Dates of the asset's life; the disposal dates only once it is taken out of use. */
const DATE_FIELDS = [
  { field: 'acquired_on', label: 'acquiredOn' },
  { field: 'warranty_until', label: 'warrantyUntil' },
  { field: 'end_of_life_on', label: 'endOfLifeOn' },
] as const;
const CLOSED_DATE_FIELDS = [
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

/** The status sentence of an asset ("I bruk – …"): i18n key under `assets.detail.statusLine`. */
export interface AssetStatusLine {
  readonly key: string;
  readonly tone: StatusLineTone;
}

/**
 * How the asset stands, in one sentence (docs/ux-guide.md §2.7): measuring equipment by
 * its calibration, everything else by its lifecycle and the register review. An overdue
 * instrument still in use is the one red line (do not use it for checks).
 */
export function assetStatusLine(a: AssetDetail): AssetStatusLine {
  const line = (key: string, tone: StatusLineTone): AssetStatusLine => ({
    key: `assets.detail.statusLine.${key}`,
    tone,
  });
  const status = a.lifecycle_status;
  if (status === 'retired' || status === 'disposed') {
    return line(status, 'neutral');
  }
  if (status === 'quarantined') {
    return line('quarantined', 'warn');
  }
  if (a.requires_calibration) {
    switch (a.calibration_status) {
      case 'overdue':
        return status === 'in_use'
          ? line('calibrationOverdueInUse', 'fail')
          : line('calibrationOverdue', 'warn');
      case 'due_soon':
        return line('calibrationDueSoon', 'warn');
      case 'ok':
        return line('calibrated', 'pass');
      default:
        return line('calibrationNotScheduled', 'warn');
    }
  }
  if (a.review_status === 'overdue') {
    return line('reviewOverdue', 'warn');
  }
  if (status === 'planned' || status === 'maintenance') {
    return line(status, 'neutral');
  }
  return a.last_reviewed_at ? line('reviewed', 'pass') : line('notReviewed', 'neutral');
}

/** The handlers the asset page offers its "Oppfølging" lines. */
export interface AssetMissingHandlers {
  readonly calibrate: (() => void) | null;
  readonly impact: (() => void) | null;
  readonly review: (() => void) | null;
  readonly processing: (() => void) | null;
}

/**
 * What the asset still needs ("Oppfølging"): one actionable line per follow-up flag from
 * the backend, each with the action that closes it (empty main fields are listed in the lead).
 */
export function assetMissing(
  a: AssetDetail,
  editLink: readonly unknown[],
  handlers: AssetMissingHandlers,
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  for (const code of a.attention) {
    const labelKey = `assets.detail.missing.${code}`;
    switch (attentionAction(code)) {
      case 'calibrate':
        if (handlers.calibrate) {
          items.push({ key: code, labelKey, action: handlers.calibrate });
        }
        break;
      case 'impact':
        if (handlers.impact) {
          items.push({ key: code, labelKey, action: handlers.impact });
        }
        break;
      case 'review':
        if (handlers.review) {
          items.push({ key: code, labelKey, action: handlers.review });
        }
        break;
      case 'processing':
        if (handlers.processing) {
          items.push({ key: code, labelKey, action: handlers.processing });
        }
        break;
      case 'edit':
        items.push({ key: code, labelKey, link: editLink });
        break;
    }
  }
  return items;
}

/**
 * An asset's page (`/assets/:id`; `?calibration=<id>` highlights a calibration and
 * `?calibrate=1` opens "Registrer kalibrering"), on the detail-page anatomy
 * (docs/ux-guide.md §2.7). Hovedinformasjon: how the asset stands (calibration for
 * measuring equipment, otherwise lifecycle and register review; an overdue instrument
 * still in use offers "Merk som ute av bruk"), what it is, how sensitive it is (or its
 * next calibration), who is responsible and, when it holds personal data, whether it is
 * in the processing register. Flere detaljer holds the rest with empty fields hidden,
 * then the calibrations, the access reviews of a system and its change requests, each
 * as a linked line (type, code, title, status). One Oppfølging card holds the follow-up
 * flags with the action that closes each, the requirements, the connections and the
 * register review dates.
 */
@Component({
  selector: 'app-asset-detail',
  imports: [
    CustomerChip,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    AssetCalibrationPanel,
    Button,
    ConfirmDialog,
    EntityChip,
    EntityTasks,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    StatusBadge,
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
          @let line = statusLine();
          <app-record-detail-layout
            [anatomy]="true"
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
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ a.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'assets.assetType.' + a.asset_type | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="lifeBadge(a.lifecycle_status).meaning"
                [value]="lifeBadge(a.lifecycle_status).value"
                [labelKey]="'assets.lifecycle.' + a.lifecycle_status"
              />
              @if (a.review_status === 'overdue' && !closed()) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="assets.attention.review_overdue"
                />
              }
            </ng-container>

            @if (canWrite() && !closed() && a.requires_calibration) {
              <app-button primary data-testid="header-calibrate" (click)="openCalibration()">
                {{ 'assets.calibration.record' | transloco }}
              </app-button>
            }
            @if (canWrite() && !closed() && a.requires_calibration) {
              <app-button secondary variant="secondary" data-testid="header-edit" (click)="edit()">
                {{ 'assets.common.edit' | transloco }}
              </app-button>
            }
            @if (canWrite() && (closed() || !a.requires_calibration)) {
              <app-button primary data-testid="header-edit" (click)="edit()">
                {{ 'assets.common.edit' | transloco }}
              </app-button>
            }
            @if (canWrite() && !closed() && reviewDue()) {
              <app-button
                secondary
                variant="secondary"
                data-testid="header-review"
                (click)="reviewOpen.set(true)"
              >
                {{ 'assets.review.confirm' | transloco }}
              </app-button>
            }
            @if (canWrite() && !closed() && !reviewDue()) {
              <button
                appMenuItem
                overflow
                type="button"
                data-testid="header-review"
                (click)="reviewOpen.set(true)"
              >
                {{ 'assets.review.confirm' | transloco }}
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

            <button appMenuItem ask type="button" (click)="askAi('summarise')">
              <app-icon name="spark" [size]="15" />
              {{ 'assets.ai.summarise' | transloco }}
            </button>
            @if (!a.requires_calibration) {
              <button appMenuItem ask type="button" (click)="askAi('classification')">
                <app-icon name="spark" [size]="15" />
                {{ 'assets.ai.askClassification' | transloco }}
              </button>
            }
            @if (!a.requires_calibration) {
              <button appMenuItem ask type="button" (click)="askAi('controls')">
                <app-icon name="spark" [size]="15" />
                {{ 'assets.ai.askControls' | transloco }}
              </button>
            }

            <app-help-strip
              help
              scope="assets"
              [page]="a.requires_calibration ? 'detailInstrument' : 'detail'"
              [lesson]="a.requires_calibration ? 'calibration' : 'asset-inventory'"
              [subject]="a.name"
            />

            <app-record-lead record-lead [fillLink]="canWrite() ? editLink() : null">
              <app-record-status-line status [tone]="line.tone" data-testid="asset-status-line">
                <span
                  class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  [attr.data-testid]="quarantineWarning() ? 'quarantine-warning' : null"
                >
                  <span>{{
                    line.key
                      | transloco
                        : {
                            date: a.next_calibration_due ? (a.next_calibration_due | localDay) : '',
                          }
                  }}</span>
                  @if (quarantineWarning() && canWrite()) {
                    <app-button
                      size="sm"
                      variant="secondary"
                      [disabled]="busy()"
                      (click)="quarantine(a)"
                    >
                      {{ 'assets.detail.markOutOfUse' | transloco }}
                    </app-button>
                  }
                </span>
              </app-record-status-line>
              <app-field-item size="lead" labelKey="assets.detail.lead.what" [wide]="true">
                @if (a.description) {
                  <div class="cf-prose" [innerHTML]="a.description | appMarkdown"></div>
                }
              </app-field-item>
              @if (a.requires_calibration) {
                <app-field-item size="lead" labelKey="assets.detail.lead.calibration">
                  @if (a.next_calibration_due) {
                    <span
                      [class.font-semibold]="a.calibration_status === 'overdue'"
                      [class.text-warn-ink]="a.calibration_status === 'overdue'"
                      >{{ a.next_calibration_due | localDay }}</span
                    >
                    @if (a.calibration_interval_months; as months) {
                      <span class="mt-0.5 block text-ui text-fg-muted">{{
                        'assets.review.everyMonths' | transloco: { months }
                      }}</span>
                    }
                  }
                </app-field-item>
              } @else {
                <app-field-item size="lead" labelKey="assets.detail.lead.sensitivity">
                  {{ 'assets.classificationHelp.' + a.classification | transloco }}
                  @if (a.criticality) {
                    <span class="mt-1.5 block">
                      <app-status-badge
                        [meaning]="critBadge(a.criticality).meaning"
                        [value]="critBadge(a.criticality).value"
                        labelKey="assets.criticalityLabel"
                        [labelParams]="{
                          level: ('assets.criticality.' + a.criticality | transloco),
                        }"
                      />
                    </span>
                  }
                </app-field-item>
              }
              <app-field-item size="lead" labelKey="assets.detail.lead.responsible">
                @if (a.owner) {
                  {{ a.owner.name }}
                }
                @if (a.owner && a.custodian && a.custodian.id !== a.owner.id) {
                  <span class="mt-0.5 block text-ui text-fg-muted">{{
                    'assets.detail.lead.custodian' | transloco: { name: a.custodian.name }
                  }}</span>
                }
              </app-field-item>
              @if (a.contains_personal_data) {
                <app-field-item size="lead" labelKey="assets.detail.lead.personalData">
                  @if (a.processing_activities) {
                    {{
                      pluralKey('assets.detail.lead.personalDataLinked', a.processing_activities)
                        | transloco: { count: a.processing_activities }
                    }}
                  } @else {
                    <span class="text-warn-ink">{{
                      'assets.detail.lead.personalDataUnlinked' | transloco
                    }}</span>
                  }
                </app-field-item>
              } @else if (a.requires_calibration) {
                <app-field-item
                  size="lead"
                  labelKey="assets.fields.location"
                  [value]="a.location"
                />
              }
            </app-record-lead>

            <div class="flex flex-col gap-8">
              @if (a.requires_calibration) {
                <div id="asset-calibration" class="scroll-mt-20">
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

              <app-record-details [columns]="3" [fillLink]="canWrite() ? editLink() : null">
                @if (!a.requires_calibration) {
                  <app-field-item labelKey="assets.fields.location" [value]="a.location" />
                } @else {
                  <app-field-item
                    labelKey="assets.fields.measurementRange"
                    [value]="a.measurement_range"
                  />
                  <app-field-item labelKey="assets.fields.accuracy" [value]="a.accuracy" />
                }
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
                      [showType]="false"
                    />
                  } @else if (a.vendor) {
                    {{ a.vendor }}
                  }
                </app-field-item>
                @if (a.customer; as c) {
                  <app-field-item labelKey="assets.fields.customer">
                    <app-customer-chip [ref]="c" data-testid="asset-customer-chip" />
                  </app-field-item>
                }
                @for (key of profileFields; track key.field) {
                  <app-field-item
                    [labelKey]="'assets.fields.' + key.label"
                    [value]="a[key.field]"
                  />
                }
                @if (a.requires_calibration) {
                  <app-field-item
                    labelKey="assets.fields.classification"
                    [value]="'assets.classification.' + a.classification | transloco"
                  />
                  <app-field-item labelKey="assets.fields.criticality">
                    @if (a.criticality) {
                      {{ 'assets.criticality.' + a.criticality | transloco }}
                    }
                  </app-field-item>
                }
                @for (key of dateFields(); track key.field) {
                  <app-field-item
                    [labelKey]="'assets.fields.' + key.label"
                    [value]="a[key.field] ? (a[key.field] | localDay) : null"
                  />
                }
                @if (closed()) {
                  <app-field-item
                    labelKey="assets.fields.disposalMethod"
                    [value]="a.disposal_method"
                  />
                }
                @if (!securityCollapsed()) {
                  @for (key of ciaKeys; track key) {
                    <app-field-item [labelKey]="'assets.detail.cia.' + key">
                      @if (a[key]) {
                        {{ 'assets.level.' + a[key] | transloco }}
                      }
                    </app-field-item>
                  }
                  <app-field-item labelKey="assets.fields.handlingRules" [wide]="true">
                    @if (a.handling_rules) {
                      <div
                        class="cf-prose text-body"
                        [innerHTML]="a.handling_rules | appMarkdown"
                      ></div>
                    }
                  </app-field-item>
                }
                <app-field-item labelKey="assets.fields.notes" [wide]="true">
                  @if (a.notes) {
                    <div class="cf-prose text-body" [innerHTML]="a.notes | appMarkdown"></div>
                  }
                </app-field-item>
              </app-record-details>

              @if (showReviews()) {
                @let ar = a.access_reviews;
                <section aria-labelledby="asset-reviews-title" data-testid="asset-reviews">
                  <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 id="asset-reviews-title" class="font-display text-card font-bold text-fg">
                      {{ 'assets.detail.reviews' | transloco }}
                    </h2>
                    @if (canManage()) {
                      <app-button size="sm" variant="secondary" (click)="planReview(a)">
                        {{ 'assets.detail.planReview' | transloco }}
                      </app-button>
                    }
                  </div>
                  @if (ar.open_revocations > 0) {
                    <p class="mb-2 text-ui font-semibold text-warn-ink">
                      {{
                        pluralKey('assets.detail.revocationsLeft', ar.open_revocations)
                          | transloco: { count: ar.open_revocations }
                      }}
                    </p>
                  }
                  @if (ar.items.length) {
                    <ul
                      class="flex flex-col divide-y divide-border rounded-card border border-border bg-surface"
                    >
                      @for (r of ar.items; track r.id) {
                        <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                          <app-icon name="shield" [size]="15" class="flex-none text-fg-subtle" />
                          <a
                            [routerLink]="['/assets/access-reviews', r.id]"
                            class="min-w-0 flex-1 text-ui font-semibold text-fg hover:text-accent hover:underline"
                          >
                            <span class="mr-1.5 font-mono text-meta font-normal text-fg-muted">{{
                              r.code
                            }}</span>
                            {{ r.title }}
                          </a>
                          <app-status-badge
                            [meaning]="revBadge(r.status).meaning"
                            [value]="revBadge(r.status).value"
                            [labelKey]="'assets.reviewStatus.' + r.status"
                          />
                          <span
                            class="text-meta text-fg-subtle"
                            [class.font-semibold]="r.overdue"
                            [class.text-warn-ink]="r.overdue"
                          >
                            @if (r.completed_at) {
                              {{
                                'assets.detail.completedOn'
                                  | transloco: { date: (r.completed_at | localDate: 'mediumDate') }
                              }}
                            } @else {
                              {{
                                'assets.reviews.dueOn' | transloco: { date: (r.due_on | localDay) }
                              }}
                            }
                          </span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-ui text-fg-subtle">
                      {{ 'assets.detail.noReviews' | transloco }}
                    </p>
                  }
                </section>
              }

              <section aria-labelledby="asset-changes-title" data-testid="asset-changes">
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="asset-changes-title" class="font-display text-card font-bold text-fg">
                    {{ 'assets.detail.changes' | transloco }}
                  </h2>
                  <div class="flex flex-wrap items-center gap-3">
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
                  <ul
                    class="flex flex-col divide-y divide-border rounded-card border border-border bg-surface"
                  >
                    @for (c of changes(); track c.id) {
                      <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                        <app-icon name="history" [size]="15" class="flex-none text-fg-subtle" />
                        <a
                          [routerLink]="['/assets/changes', c.id]"
                          class="min-w-0 flex-1 text-ui font-semibold text-fg hover:text-accent hover:underline"
                        >
                          <span class="mr-1.5 font-mono text-meta font-normal text-fg-muted">{{
                            c.code
                          }}</span>
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
              </section>
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="asset"
                [entityId]="a.id"
                [canCreate]="canWrite()"
                [entityLabel]="a.code + ' ' + a.name"
              />
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item layout="inline" labelKey="assets.fields.reviewInterval">
                {{
                  'assets.review.everyMonths'
                    | transloco: { months: a.review_interval_months ?? 12 }
                }}
              </app-field-item>
              <app-field-item layout="inline" labelKey="assets.fields.lastReviewed">
                @if (a.last_reviewed_at) {
                  {{
                    'assets.review.lastBy'
                      | transloco
                        : {
                            date: (a.last_reviewed_at | localDate: 'mediumDate'),
                            name: a.last_reviewed_by?.name ?? ('assets.common.unknown' | transloco),
                          }
                  }}
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="assets.fields.reviewDate"
                [keepEmpty]="!closed()"
                emptyKey="kit.detail.meta.notPlanned"
                emptyActionKey="kit.detail.meta.plan"
                [emptyLink]="canWrite() ? editLink() : null"
              >
                @if (a.review_date) {
                  <span [class.text-warn-ink]="a.review_status === 'overdue'">{{
                    a.review_date | localDay
                  }}</span>
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="assets.detail.updated"
                [value]="a.updated_at | localDate"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters
                scope="assets"
                [page]="a.requires_calibration ? 'detailInstrument' : 'detail'"
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
  protected readonly lifeBadge = lifecycleBadge;
  protected readonly critBadge = levelBadge;
  protected readonly revBadge = reviewStatusBadge;
  protected readonly catBadge = stateCategoryBadge;

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

  protected readonly editLink = computed<readonly unknown[]>(() => ['/assets', this.id(), 'edit']);

  protected readonly closed = computed(() => {
    const status = this.asset()?.lifecycle_status;
    return status === 'retired' || status === 'disposed';
  });
  /** The register review is due or overdue: "Bekreft gjennomgang" goes next to Rediger. */
  protected readonly reviewDue = computed(() => {
    const status = this.asset()?.review_status;
    return status === 'overdue' || status === 'due_soon';
  });
  protected readonly statusLine = computed(() => {
    const a = this.asset();
    return a ? assetStatusLine(a) : { key: '', tone: 'neutral' as const };
  });
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
  /** Measuring equipment and hardware without any security rating: leave the CIA fields out. */
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
  protected readonly dateFields = computed(() =>
    this.closed() ? [...DATE_FIELDS, ...CLOSED_DATE_FIELDS] : DATE_FIELDS,
  );

  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const a = this.asset();
    if (!a || !this.canWrite()) {
      return [];
    }
    const open = !this.closed();
    return assetMissing(a, this.editLink(), {
      calibrate: open ? () => this.openCalibration() : null,
      impact: () => this.scrollToCalibration(),
      review: open ? () => this.reviewOpen.set(true) : null,
      processing: this.flowEnabled('asset.to_processing')
        ? () => this.startFlow('asset.to_processing')
        : null,
    });
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

  protected flowEnabled(key: string): boolean {
    return this.flowKeys().has(key);
  }

  protected startFlow(key: string): void {
    const a = this.asset();
    if (a) {
      void this.flows.start(key, 'asset', a.id);
    }
  }

  protected edit(): void {
    void this.router.navigate(this.editLink());
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

  protected askAi(kind: 'summarise' | 'classification' | 'controls'): void {
    this.ask.showWith(this.language.translate(`assets.ai.prompts.${kind}`));
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
