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
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RevisionHistory } from '../../../shared/kit/revision-history';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RiskApi } from '../data/risk-api';
import { implementationValue, saveBlob, standardDisplayName } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  EntityRef,
  IMPLEMENTATION_STATUSES,
  INCLUSION_REASONS,
  ImplementationStatus,
  InclusionReason,
  Soa,
  SoaBulkUpdate,
  SoaEntry,
  SoaEntryUpdate,
  SoaVersion,
} from '../data/risk.models';
import { PersonSelect } from '../shared/person-select';
import { RiskField } from '../shared/risk-field';
import { RiskNav } from '../shared/risk-nav';
import { RiskPermissions } from '../shared/risk-permissions';
import { SoaProgress } from '../shared/soa-progress';
import { SubjectPicker } from '../shared/subject-picker';

export type ApplicableFilter = 'all' | 'yes' | 'no' | 'missing';

/** Record types that can document a control. */
const DOCUMENTATION_TYPES = ['document', 'policy', 'external_document'] as const;

interface EntryForm {
  readonly applicable: boolean;
  readonly implementation_status: ImplementationStatus;
  readonly justification: string;
  readonly inclusion_reasons: readonly InclusionReason[];
  readonly implementation_notes: string;
  readonly owner_user_id: string;
  readonly reviewed: boolean;
  readonly change_reason: string;
}

const EMPTY_ENTRY_FORM: EntryForm = {
  applicable: true,
  implementation_status: 'not_started',
  justification: '',
  inclusion_reasons: [],
  implementation_notes: '',
  owner_user_id: '',
  reviewed: false,
  change_reason: '',
};

/** The bulk panel: '' means "leave as it is". */
export interface BulkForm {
  readonly applicable: '' | 'yes' | 'no';
  readonly implementation_status: ImplementationStatus | '';
  readonly inclusion_reasons: readonly InclusionReason[];
  readonly justification: string;
  readonly reviewed: boolean;
  readonly change_reason: string;
}

const EMPTY_BULK: BulkForm = {
  applicable: '',
  implementation_status: '',
  inclusion_reasons: [],
  justification: '',
  reviewed: false,
  change_reason: '',
};

function entryToForm(e: SoaEntry): EntryForm {
  return {
    applicable: e.applicable,
    implementation_status: e.implementation_status,
    justification: e.justification ?? '',
    inclusion_reasons: e.inclusion_reasons,
    implementation_notes: e.implementation_notes ?? '',
    owner_user_id: e.owner?.id ?? '',
    reviewed: false,
    change_reason: '',
  };
}

/** The PATCH body: only changed fields (plus `reviewed` / `change_reason` when set). */
export function soaEntryPatch(entry: SoaEntry, f: EntryForm): SoaEntryUpdate {
  const before = entryToForm(entry);
  const out: Record<string, unknown> = {};
  if (f.applicable !== before.applicable) out['applicable'] = f.applicable;
  if (f.implementation_status !== before.implementation_status) {
    out['implementation_status'] = f.implementation_status;
  }
  if (f.justification.trim() !== before.justification.trim()) {
    out['justification'] = f.justification.trim() || null;
  }
  if (
    JSON.stringify([...f.inclusion_reasons].sort()) !==
    JSON.stringify([...before.inclusion_reasons].sort())
  ) {
    out['inclusion_reasons'] = f.inclusion_reasons;
  }
  if (f.implementation_notes.trim() !== before.implementation_notes.trim()) {
    out['implementation_notes'] = f.implementation_notes.trim() || null;
  }
  if (f.owner_user_id !== before.owner_user_id) out['owner_user_id'] = f.owner_user_id || null;
  if (f.reviewed) out['reviewed'] = true;
  if (f.change_reason.trim()) out['change_reason'] = f.change_reason.trim();
  return out as SoaEntryUpdate;
}

/** The bulk body: only what the user chose to change. */
export function soaBulkBody(ids: readonly string[], f: BulkForm): SoaBulkUpdate {
  return {
    entry_ids: [...ids],
    ...(f.applicable ? { applicable: f.applicable === 'yes' } : {}),
    ...(f.implementation_status ? { implementation_status: f.implementation_status } : {}),
    ...(f.inclusion_reasons.length ? { inclusion_reasons: f.inclusion_reasons } : {}),
    ...(f.justification.trim() ? { justification: f.justification.trim() } : {}),
    ...(f.reviewed ? { reviewed: true } : {}),
    ...(f.change_reason.trim() ? { change_reason: f.change_reason.trim() } : {}),
  };
}

/** Whether a bulk form changes anything. */
export function bulkHasChange(f: BulkForm): boolean {
  return Object.keys(soaBulkBody([], f)).some((k) => k !== 'entry_ids' && k !== 'change_reason');
}

const SOA_FIELD_LABELS: Readonly<Record<string, string>> = {
  applicable: 'risk.soa.fields.applicable',
  implementation_status: 'risk.soa.fields.implementation',
  justification: 'risk.soa.fields.justification',
  inclusion_reasons: 'risk.soa.fields.reasons',
  implementation_notes: 'risk.soa.fields.notes',
  owner_user_id: 'risk.fields.owner',
  reviewed_at: 'risk.soa.fields.reviewedAt',
  control_ref: 'risk.soa.fields.control',
};

/**
 * One Statement of Applicability: every Annex A control with its decision
 * (applicable or excluded, and why), inclusion reasons, implementation status,
 * owner, the documents that show it is in place ("Dokumentert i") and the risks
 * that cite it. Managers decide controls one by one in a side panel ("Neste uten
 * begrunnelse" walks through the open ones) or many at once, then approve a fixed
 * version (snapshot, approver, date) once every control is justified. Everyone
 * can export a version-stamped CSV. `?control=<number>` opens that control.
 */
@Component({
  selector: 'app-soa-view',
  imports: [
    TourStepDirective,
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    WhyItMatters,
    EntityChip,
    RevisionHistory,
    LocalDayPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    MenuItem,
    PageHeader,
    SlideOver,
    StatusBadge,
    PersonSelect,
    RiskField,
    RiskNav,
    SoaProgress,
    SubjectPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [title]="name()"
        [titleKey]="'risk.soa.title'"
        descriptionKey="risk.soa.viewSubtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.risk', link: '/risk' },
          { labelKey: 'risk.soa.title', link: '/risk/soa' },
          { label: name() },
        ]"
      >
        <ng-container ngProjectAs="[meta]">
          @if (soa(); as s) {
            @if (s.latest_version; as v) {
              <span data-testid="soa-latest-version">
                {{
                  'risk.soa.version.latest'
                    | transloco
                      : {
                          version: v.version_no,
                          date: (v.approved_at | localDay),
                          name: v.approved_by?.name ?? ('risk.common.unknown' | transloco),
                        }
                }}
              </span>
              @if (s.changed_since_version) {
                <app-badge tone="warn">{{ 'risk.soa.version.changed' | transloco }}</app-badge>
              }
            } @else if (s.generated) {
              <span>{{ 'risk.soa.version.none' | transloco }}</span>
            }
          }
        </ng-container>
        @if (soa()?.generated && perms.canManage()) {
          <app-button
            primary
            size="sm"
            [disabled]="!canApprove()"
            [attr.title]="canApprove() ? null : ('risk.soa.version.blocked' | transloco)"
            (click)="openApprove()"
            data-testid="soa-approve"
          >
            <app-icon name="checkcircle" [size]="14" />
            {{ 'risk.soa.version.approve' | transloco }}
          </app-button>
        }
        @if (soa()?.generated) {
          <app-button
            secondary
            size="sm"
            variant="secondary"
            [loading]="exporting()"
            (click)="exportCsv()"
          >
            <app-icon name="upload" [size]="14" />
            {{ 'risk.soa.export' | transloco }}
          </app-button>
        }
        @if (soa()?.generated) {
          <button appMenuItem overflow (click)="openVersions()">
            {{ 'risk.soa.version.history' | transloco }}
          </button>
        }
        @if (perms.canManage()) {
          <button appMenuItem overflow (click)="generate()">
            {{ (soa()?.generated ? 'risk.soa.addMissing' : 'risk.soa.generate') | transloco }}
          </button>
        }
      </app-page-header>
      <app-risk-nav />
      <app-help-strip scope="risk" page="soaView" lesson="statement-of-applicability" tour="soa" />

      @if (state() === 'error') {
        <app-error-state [bodyKey]="loadErrorKey()" (retry)="reload()" />
      } @else if (soa(); as s) {
        @if (!s.generated) {
          <app-card>
            <app-empty-state
              icon="shield"
              [titleKey]="perms.canManage() ? 'risk.soa.notGenerated' : 'risk.soa.askManager'"
              [ctaKey]="perms.canManage() ? 'risk.soa.generate' : null"
              (cta)="generate()"
            />
          </app-card>
        } @else {
          @if (!canApprove() && perms.canManage()) {
            <p class="mb-4 rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg-muted">
              {{
                'risk.soa.version.blockedHint' | transloco: { count: s.stats.missing_justification }
              }}
            </p>
          }
          <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <app-card>
              <app-soa-progress
                [total]="s.stats.total"
                [justified]="justifiedCount()"
                [applicable]="s.stats.applicable"
                [implemented]="s.stats.implemented"
              />
            </app-card>
            <section
              class="grid grid-cols-2 gap-3 md:grid-cols-4"
              [attr.aria-label]="'risk.soa.stats' | transloco"
              [appTourStep]="'risk-soa-stats'"
            >
              <app-kpi-tile
                [label]="'risk.soa.statApplicable' | transloco"
                [value]="s.stats.applicable"
                [delta]="'risk.soa.ofTotal' | transloco: { total: s.stats.total }"
              />
              <app-kpi-tile
                [label]="'risk.soa.statExcluded' | transloco"
                [value]="s.stats.excluded"
                [delta]="'risk.soa.excludedDelta' | transloco"
                deltaTone="neutral"
              />
              <app-kpi-tile
                [label]="'risk.soa.statImplemented' | transloco"
                [value]="s.stats.implemented"
                tone="pass"
                [delta]="'risk.soa.partialCount' | transloco: { count: s.stats.partial }"
              />
              <button
                type="button"
                class="block w-full rounded-card p-0 text-left align-top focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                (click)="applicable.set('missing')"
                [attr.aria-label]="'risk.soa.showMissing' | transloco"
              >
                <app-kpi-tile
                  [label]="'risk.soa.statMissing' | transloco"
                  [value]="s.stats.missing_justification"
                  [tone]="s.stats.missing_justification > 0 ? 'warn' : 'neutral'"
                  [delta]="'risk.soa.showMissingShort' | transloco"
                  deltaTone="accent"
                />
              </button>
            </section>
          </div>

          <div class="mb-3 flex flex-wrap items-center gap-2" [appTourStep]="'risk-soa-filters'">
            <label class="sr-only" for="soa-q">{{ 'risk.soa.search' | transloco }}</label>
            <input
              id="soa-q"
              type="search"
              class="h-10 min-w-[200px] flex-1 rounded-tile border border-border bg-bg px-3 text-body text-fg"
              [placeholder]="'risk.soa.searchPlaceholder' | transloco"
              [value]="q()"
              (input)="q.set($any($event.target).value)"
            />
            <label class="sr-only" for="soa-applicable">{{
              'risk.soa.fields.applicable' | transloco
            }}</label>
            <select
              id="soa-applicable"
              class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
              (change)="applicable.set($any($event.target).value)"
            >
              @for (a of applicableFilters; track a) {
                <option [value]="a" [selected]="a === applicable()">
                  {{ 'risk.soa.applicableFilters.' + a | transloco }}
                </option>
              }
            </select>
            <label class="sr-only" for="soa-impl">{{
              'risk.soa.fields.implementation' | transloco
            }}</label>
            <select
              id="soa-impl"
              class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
              (change)="implementation.set($any($event.target).value)"
            >
              <option value="" [selected]="!implementation()">
                {{ 'risk.soa.allStatuses' | transloco }}
              </option>
              @for (i of implementationStatuses; track i) {
                <option [value]="i" [selected]="i === implementation()">
                  {{ 'risk.soa.implementation.' + i | transloco }}
                </option>
              }
            </select>
            @if (themes().length > 1) {
              <label class="sr-only" for="soa-theme">{{
                'risk.soa.fields.theme' | transloco
              }}</label>
              <select
                id="soa-theme"
                class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                (change)="theme.set($any($event.target).value)"
              >
                <option value="" [selected]="!theme()">
                  {{ 'risk.soa.allThemes' | transloco }}
                </option>
                @for (t of themes(); track t) {
                  <option [value]="t" [selected]="t === theme()">
                    {{ knownThemes.has(t) ? ('standards.themes.' + t | transloco) : t }}
                  </option>
                }
              </select>
            }
          </div>

          @if (perms.canManage() && selectedIds().length > 0) {
            <div
              class="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-tile border border-accent/40 bg-accent-soft px-3 py-2 text-ui"
              role="region"
              [attr.aria-label]="'risk.soa.bulk.label' | transloco"
              data-testid="soa-bulk-bar"
            >
              <span class="min-w-0 flex-1 font-semibold text-fg">
                {{ 'risk.soa.bulk.selected' | transloco: { count: selectedIds().length } }}
              </span>
              <app-button size="sm" (click)="openBulk()">
                {{ 'risk.soa.bulk.edit' | transloco }}
              </app-button>
              <app-button size="sm" variant="ghost" (click)="clearSelection()">
                {{ 'risk.soa.bulk.clear' | transloco }}
              </app-button>
            </div>
          }

          <app-card [padded]="false">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[860px] text-left text-ui">
                <caption class="sr-only">
                  {{
                    name()
                  }}
                </caption>
                <thead class="border-b border-border text-meta text-fg-muted">
                  <tr>
                    @if (perms.canManage()) {
                      <th scope="col" class="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          [checked]="allVisibleSelected()"
                          [indeterminate]="someVisibleSelected()"
                          [attr.aria-label]="'risk.soa.bulk.selectAll' | transloco"
                          (change)="toggleAll($any($event.target).checked)"
                        />
                      </th>
                    }
                    <th scope="col" class="px-3 py-2 font-semibold">
                      {{ 'risk.soa.fields.control' | transloco }}
                    </th>
                    <th scope="col" class="px-2 py-2 font-semibold">
                      {{ 'risk.soa.fields.applicable' | transloco }}
                    </th>
                    <th scope="col" class="px-2 py-2 font-semibold">
                      {{ 'risk.soa.fields.implementation' | transloco }}
                    </th>
                    <th scope="col" class="px-2 py-2 font-semibold">
                      {{ 'risk.soa.fields.reasons' | transloco }}
                    </th>
                    <th scope="col" class="px-2 py-2 font-semibold">
                      {{ 'risk.soa.fields.documentedIn' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 font-semibold">
                      {{ 'risk.soa.fields.risks' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  @for (e of visible(); track e.id) {
                    <tr
                      class="align-top hover:bg-surface-2"
                      [class.bg-accent-soft]="e.id === selected()?.id"
                    >
                      @if (perms.canManage()) {
                        <td class="px-3 py-2.5">
                          <input
                            type="checkbox"
                            [checked]="isSelected(e.id)"
                            [attr.aria-label]="
                              'risk.soa.bulk.select' | transloco: { control: e.control_ref }
                            "
                            (change)="toggle(e.id, $any($event.target).checked)"
                          />
                        </td>
                      }
                      <td class="px-3 py-2.5">
                        <button
                          type="button"
                          class="text-left hover:underline"
                          (click)="open(e)"
                          [attr.data-testid]="'soa-' + e.control_ref"
                        >
                          <span class="font-mono text-meta text-fg-subtle">{{
                            e.control_ref
                          }}</span>
                          <span class="block font-semibold text-fg">{{ titleOf(e) }}</span>
                        </button>
                        @if (e.needs_justification) {
                          <span class="mt-0.5 block text-meta font-semibold text-warn-ink">
                            {{ 'risk.soa.needsJustification' | transloco }}
                          </span>
                        }
                      </td>
                      <td class="px-2 py-2.5">
                        <app-status-badge
                          meaning="compliance"
                          [value]="e.applicable ? 'in_scope' : 'not_applicable'"
                          [labelKey]="e.applicable ? 'risk.soa.yes' : 'risk.soa.excluded'"
                        />
                      </td>
                      <td class="px-2 py-2.5">
                        @if (e.applicable) {
                          <app-status-badge
                            meaning="compliance"
                            [value]="implValue(e.implementation_status)"
                            [labelKey]="'risk.soa.implementation.' + e.implementation_status"
                          />
                        } @else {
                          <span class="text-fg-subtle">{{ 'common.empty.dash' | transloco }}</span>
                        }
                      </td>
                      <td class="px-2 py-2.5 text-meta text-fg-muted">
                        @for (r of e.inclusion_reasons; track r; let last = $last) {
                          {{ 'risk.soa.reasons.' + r | transloco }}{{ last ? '' : ', ' }}
                        } @empty {
                          <span class="text-fg-subtle">{{ 'common.empty.dash' | transloco }}</span>
                        }
                      </td>
                      <td class="max-w-[220px] px-2 py-2.5 text-meta">
                        @for (d of (e.documentation ?? []).slice(0, 2); track d.entity_id) {
                          <app-entity-chip class="block truncate" [ref]="d" [showType]="false" />
                        } @empty {
                          <span class="text-fg-subtle">{{ 'common.empty.dash' | transloco }}</span>
                        }
                        @if ((e.documentation ?? []).length > 2) {
                          <span class="text-fg-subtle"
                            >+{{ (e.documentation ?? []).length - 2 }}</span
                          >
                        }
                      </td>
                      <td class="px-3 py-2.5 text-meta">
                        @for (r of e.risks.slice(0, 3); track r.id) {
                          <a
                            [routerLink]="['/risk/risks', r.id]"
                            class="mr-1.5 font-mono text-accent hover:underline"
                            [title]="r.title"
                            >{{ r.code }}</a
                          >
                        } @empty {
                          <span class="text-fg-subtle">{{ 'common.empty.dash' | transloco }}</span>
                        }
                        @if (e.risks.length > 3) {
                          <span class="text-fg-subtle">+{{ e.risks.length - 3 }}</span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td [attr.colspan]="perms.canManage() ? 7 : 6">
                        <app-empty-state
                          icon="search"
                          titleKey="ui.empty.noResults"
                          ctaKey="risk.filters.clear"
                          ctaVariant="secondary"
                          [compact]="true"
                          (cta)="clearFilters()"
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </app-card>
          <app-why-it-matters class="mt-8 block" scope="risk" page="soaView" />
        }
      } @else {
        <app-loading-state [rows]="8" />
      }
    </div>

    <app-slide-over
      [open]="selected() !== null"
      [title]="panelTitle()"
      [subtitle]="name()"
      [closeLabel]="'risk.common.close' | transloco"
      [width]="560"
      (closed)="close()"
    >
      @if (selected(); as e) {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
          <fieldset [disabled]="!perms.canManage()" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <label class="inline-flex min-h-8 items-center gap-2 text-body font-semibold text-fg">
                <input
                  type="checkbox"
                  [checked]="form().applicable"
                  (change)="set('applicable', $any($event.target).checked)"
                />
                {{ 'risk.soa.applicableLabel' | transloco }}
              </label>
              <p class="text-meta text-fg-muted">{{ 'risk.soa.applicableHint' | transloco }}</p>
            </div>

            <fieldset>
              <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
                {{ 'risk.soa.fields.reasons' | transloco }}
              </legend>
              <div class="flex flex-wrap gap-x-4 gap-y-1.5">
                @for (r of reasons; track r) {
                  <label class="inline-flex min-h-8 items-center gap-1.5 text-ui text-fg">
                    <input
                      type="checkbox"
                      [checked]="form().inclusion_reasons.includes(r)"
                      (change)="toggleReason(r, $any($event.target).checked)"
                    />
                    {{ 'risk.soa.reasons.' + r | transloco }}
                  </label>
                }
              </div>
            </fieldset>

            <app-risk-field
              inputId="soa-justification"
              labelKey="risk.soa.fields.justification"
              [required]="!form().applicable"
              helpPage="soaView"
              helpField="justification"
              [error]="justificationMissing() ? 'risk.errors.justification_required' : null"
            >
              <textarea
                id="soa-justification"
                rows="4"
                [value]="form().justification"
                [attr.aria-invalid]="justificationMissing() || null"
                (input)="set('justification', $any($event.target).value)"
              ></textarea>
            </app-risk-field>
            @if (perms.canManage()) {
              <div>
                <app-ai-assist-button
                  assist="risk.soa_justification"
                  labelKey="risk.ai.draftJustification"
                  [input]="{ entry_id: e.id }"
                  entityType="soa_entry"
                  [entityId]="e.id"
                  (text)="set('justification', $event)"
                />
                <p class="mt-1 text-meta text-fg-subtle">
                  {{ 'risk.ai.justificationHint' | transloco }}
                </p>
              </div>
            }

            <app-risk-field inputId="soa-impl-status" labelKey="risk.soa.fields.implementation">
              <select
                id="soa-impl-status"
                (change)="set('implementation_status', $any($event.target).value)"
              >
                @for (i of implementationStatuses; track i) {
                  <option [value]="i" [selected]="i === form().implementation_status">
                    {{ 'risk.soa.implementation.' + i | transloco }}
                  </option>
                }
              </select>
            </app-risk-field>
            <app-risk-field inputId="soa-notes" labelKey="risk.soa.fields.notes">
              <textarea
                id="soa-notes"
                rows="3"
                [value]="form().implementation_notes"
                (input)="set('implementation_notes', $any($event.target).value)"
              ></textarea>
            </app-risk-field>
            <app-risk-field inputId="soa-owner" labelKey="risk.fields.owner">
              <app-person-select
                inputId="soa-owner"
                [value]="form().owner_user_id"
                [currentName]="e.owner?.name ?? null"
                (valueChange)="set('owner_user_id', $event)"
              />
            </app-risk-field>
            <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
              <input
                type="checkbox"
                [checked]="form().reviewed"
                (change)="set('reviewed', $any($event.target).checked)"
              />
              {{ 'risk.soa.markReviewed' | transloco }}
              @if (e.reviewed_at) {
                <span class="text-fg-subtle">
                  ({{ 'risk.soa.lastReviewed' | transloco: { date: (e.reviewed_at | localDay) } }})
                </span>
              }
            </label>
            <app-risk-field inputId="soa-change-reason" labelKey="risk.fields.changeReason">
              <input
                id="soa-change-reason"
                maxlength="2000"
                [value]="form().change_reason"
                (input)="set('change_reason', $any($event.target).value)"
              />
            </app-risk-field>
          </fieldset>

          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }
          @if (perms.canManage()) {
            <div class="flex flex-wrap justify-end gap-2">
              @if (nextMissing(); as next) {
                <app-button
                  variant="secondary"
                  [disabled]="saving()"
                  (click)="save(next)"
                  data-testid="soa-next-missing"
                >
                  {{ 'risk.soa.saveNextMissing' | transloco }}
                </app-button>
              }
              <app-button type="submit" [loading]="saving()" [disabled]="saving()">
                {{ 'risk.common.save' | transloco }}
              </app-button>
            </div>
          }

          <section class="border-t border-border pt-3" data-testid="soa-documentation">
            <h3 class="mb-1 text-body font-semibold text-fg">
              {{ 'risk.soa.documentation.title' | transloco }}
            </h3>
            <p class="mb-2 text-meta text-fg-muted">
              {{ 'risk.soa.documentation.hint' | transloco }}
            </p>
            <ul class="mb-2 flex flex-col gap-1.5">
              @for (d of e.documentation ?? []; track d.entity_type + d.entity_id) {
                <li><app-entity-chip [ref]="d" /></li>
              } @empty {
                <li class="text-ui text-fg-muted">
                  {{ 'risk.soa.documentation.none' | transloco }}
                </li>
              }
            </ul>
            @if (perms.canManage()) {
              <app-risk-subject-picker
                [types]="documentationTypes"
                (picked)="linkDocument(e, $event)"
              />
            }
          </section>

          <section class="border-t border-border pt-3">
            <h3 class="mb-2 text-body font-semibold text-fg">
              {{ 'risk.soa.relatedRisks' | transloco: { treatments: e.treatment_count } }}
            </h3>
            <ul class="flex flex-col gap-1 text-ui">
              @for (r of e.risks; track r.id) {
                <li>
                  <a [routerLink]="['/risk/risks', r.id]" class="text-accent hover:underline">
                    <span class="font-mono">{{ r.code }}</span> {{ r.title }}
                  </a>
                </li>
              } @empty {
                <li class="text-fg-muted">{{ 'risk.soa.noRisks' | transloco }}</li>
              }
            </ul>
          </section>

          <section class="border-t border-border pt-3">
            <app-revision-history
              entityType="soa_entry"
              [entityId]="e.id"
              [fieldLabels]="fieldLabels"
            />
          </section>
        </form>
      }
    </app-slide-over>

    <app-slide-over
      [open]="bulkOpen()"
      [title]="'risk.soa.bulk.title' | transloco: { count: selectedIds().length }"
      [subtitle]="name()"
      [closeLabel]="'risk.common.close' | transloco"
      [width]="520"
      (closed)="bulkOpen.set(false)"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); applyBulk()" novalidate>
        <p class="text-ui text-fg-muted">{{ 'risk.soa.bulk.hint' | transloco }}</p>
        <app-risk-field inputId="bulk-applicable" labelKey="risk.soa.fields.applicable">
          <select id="bulk-applicable" (change)="setBulk('applicable', $any($event.target).value)">
            <option value="" [selected]="!bulk().applicable">
              {{ 'risk.soa.bulk.unchanged' | transloco }}
            </option>
            <option value="yes" [selected]="bulk().applicable === 'yes'">
              {{ 'risk.soa.applicableFilters.yes' | transloco }}
            </option>
            <option value="no" [selected]="bulk().applicable === 'no'">
              {{ 'risk.soa.applicableFilters.no' | transloco }}
            </option>
          </select>
        </app-risk-field>
        <app-risk-field inputId="bulk-impl" labelKey="risk.soa.fields.implementation">
          <select
            id="bulk-impl"
            (change)="setBulk('implementation_status', $any($event.target).value)"
          >
            <option value="" [selected]="!bulk().implementation_status">
              {{ 'risk.soa.bulk.unchanged' | transloco }}
            </option>
            @for (i of implementationStatuses; track i) {
              <option [value]="i" [selected]="i === bulk().implementation_status">
                {{ 'risk.soa.implementation.' + i | transloco }}
              </option>
            }
          </select>
        </app-risk-field>
        <fieldset>
          <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
            {{ 'risk.soa.fields.reasons' | transloco }}
          </legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1.5">
            @for (r of reasons; track r) {
              <label class="inline-flex min-h-8 items-center gap-1.5 text-ui text-fg">
                <input
                  type="checkbox"
                  [checked]="bulk().inclusion_reasons.includes(r)"
                  (change)="toggleBulkReason(r, $any($event.target).checked)"
                />
                {{ 'risk.soa.reasons.' + r | transloco }}
              </label>
            }
          </div>
          <p class="mt-1 text-meta text-fg-subtle">{{ 'risk.soa.bulk.reasonsHint' | transloco }}</p>
        </fieldset>
        <app-risk-field inputId="bulk-justification" labelKey="risk.soa.fields.justification">
          <textarea
            id="bulk-justification"
            rows="3"
            [value]="bulk().justification"
            (input)="setBulk('justification', $any($event.target).value)"
          ></textarea>
          <span hint>{{ 'risk.soa.bulk.justificationHint' | transloco }}</span>
        </app-risk-field>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="bulk().reviewed"
            (change)="setBulk('reviewed', $any($event.target).checked)"
          />
          {{ 'risk.soa.markReviewed' | transloco }}
        </label>
        <app-risk-field inputId="bulk-reason" labelKey="risk.fields.changeReason">
          <input
            id="bulk-reason"
            maxlength="2000"
            [value]="bulk().change_reason"
            (input)="setBulk('change_reason', $any($event.target).value)"
          />
        </app-risk-field>
        @if (bulkError(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="ghost" (click)="bulkOpen.set(false)">
            {{ 'risk.common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="saving()" [disabled]="saving() || !bulkChanges()">
            {{ 'risk.soa.bulk.apply' | transloco: { count: selectedIds().length } }}
          </app-button>
        </div>
      </form>
    </app-slide-over>

    <app-confirm-dialog
      [open]="approveOpen()"
      [title]="'risk.soa.version.approveTitle' | transloco"
      [message]="'risk.soa.version.approveMessage' | transloco: { name: name() }"
      confirmVariant="primary"
      [confirmLabel]="'risk.soa.version.approveConfirm' | transloco"
      [cancelLabel]="'risk.common.cancel' | transloco"
      [busy]="saving()"
      (confirmed)="approve()"
      (cancelled)="approveOpen.set(false)"
    >
      <div class="mt-3 flex flex-col gap-3">
        <p class="rounded-tile border border-border bg-surface-2 px-3 py-2 text-ui text-fg">
          {{ 'risk.soa.version.signer' | transloco: { name: signer() } }}
        </p>
        <app-risk-field inputId="soa-approve-note" labelKey="risk.soa.version.note">
          <textarea
            id="soa-approve-note"
            rows="3"
            [value]="approveNote()"
            (input)="approveNote.set($any($event.target).value)"
          ></textarea>
        </app-risk-field>
        @if (approveError(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }
      </div>
    </app-confirm-dialog>

    <app-slide-over
      [open]="versionsOpen()"
      [title]="'risk.soa.version.history' | transloco"
      [subtitle]="name()"
      [closeLabel]="'risk.common.close' | transloco"
      [width]="480"
      (closed)="versionsOpen.set(false)"
    >
      <ol class="flex flex-col divide-y divide-border">
        @for (v of versions(); track v.id) {
          <li class="py-3">
            <p class="text-body font-semibold text-fg">
              {{ 'risk.soa.version.label' | transloco: { version: v.version_no } }}
            </p>
            <p class="text-meta text-fg-muted">
              {{
                'risk.soa.version.approvedBy'
                  | transloco
                    : {
                        name: v.approved_by?.name ?? ('risk.common.unknown' | transloco),
                        date: (v.approved_at | localDay),
                      }
              }}
            </p>
            @if (v.note) {
              <p class="mt-1 text-ui whitespace-pre-line text-fg">{{ v.note }}</p>
            }
          </li>
        } @empty {
          <li class="py-3 text-ui text-fg-muted">{{ 'risk.soa.version.empty' | transloco }}</li>
        }
      </ol>
    </app-slide-over>
  `,
})
export class SoaViewPage {
  private readonly api = inject(RiskApi);
  private readonly kit = inject(KitApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly auth = inject(AuthService);
  protected readonly perms = inject(RiskPermissions);

  readonly key = input.required<string>();
  /** `?control=<number>` opens that control. */
  readonly control = input<string | undefined>(undefined);

  protected readonly applicableFilters: readonly ApplicableFilter[] = [
    'all',
    'yes',
    'no',
    'missing',
  ];
  protected readonly implementationStatuses = IMPLEMENTATION_STATUSES;
  protected readonly reasons = INCLUSION_REASONS;
  protected readonly fieldLabels = SOA_FIELD_LABELS;
  protected readonly documentationTypes = DOCUMENTATION_TYPES;
  protected readonly implValue = implementationValue;

  protected readonly soa = signal<Soa | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadErrorKey = signal('risk.common.loadFailed');
  protected readonly q = signal('');
  protected readonly applicable = signal<ApplicableFilter>('all');
  protected readonly implementation = signal<ImplementationStatus | ''>('');
  protected readonly theme = signal('');
  /** Annex A themes with a global label (`standards.themes.<theme>`). */
  protected readonly knownThemes: ReadonlySet<string> = new Set([
    'organizational',
    'people',
    'physical',
    'technological',
  ]);
  protected readonly selected = signal<SoaEntry | null>(null);
  protected readonly form = signal<EntryForm>(EMPTY_ENTRY_FORM);
  protected readonly saving = signal(false);
  protected readonly exporting = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly selectedSet = signal<ReadonlySet<string>>(new Set());
  protected readonly bulkOpen = signal(false);
  protected readonly bulk = signal<BulkForm>(EMPTY_BULK);
  protected readonly bulkError = signal<string | null>(null);
  protected readonly approveOpen = signal(false);
  protected readonly approveNote = signal('');
  protected readonly approveError = signal<string | null>(null);
  protected readonly versionsOpen = signal(false);
  protected readonly versions = signal<readonly SoaVersion[]>([]);
  private readonly submitted = signal(false);
  private openedControl: string | null = null;
  private sub: Subscription | null = null;

  protected readonly name = computed(() => {
    const s = this.soa();
    return standardDisplayName(
      s?.standard_label,
      this.key(),
      s?.standard_name,
      this.language.active(),
      (k, p) => this.language.translate(k, p),
    );
  });

  protected readonly themes = computed(() => [
    ...new Set((this.soa()?.items ?? []).map((e) => e.theme).filter((t): t is string => !!t)),
  ]);

  /** Entries with a written justification (older APIs: total - missing). */
  protected readonly justifiedCount = computed(() => {
    const stats = this.soa()?.stats;
    if (!stats) {
      return 0;
    }
    return (
      stats.justified ?? (this.soa()?.items ?? []).filter((e) => !!e.justification?.trim()).length
    );
  });

  /** A version can be approved once every control has a justification. */
  protected readonly canApprove = computed(() => {
    const s = this.soa();
    return !!s?.generated && s.stats.missing_justification === 0;
  });

  /** Filtering is client-side: a statement is at most ~100 rows. */
  protected readonly visible = computed(() => {
    const q = this.q().trim().toLowerCase();
    const applicable = this.applicable();
    const impl = this.implementation();
    const theme = this.theme();
    return (this.soa()?.items ?? []).filter(
      (e) =>
        (!q ||
          e.control_ref.toLowerCase().includes(q) ||
          e.title.toLowerCase().includes(q) ||
          (e.title_nb ?? '').toLowerCase().includes(q)) &&
        (applicable === 'all' ||
          (applicable === 'yes' && e.applicable) ||
          (applicable === 'no' && !e.applicable) ||
          (applicable === 'missing' && e.needs_justification)) &&
        (!impl || e.implementation_status === impl) &&
        (!theme || e.theme === theme),
    );
  });

  protected readonly selectedIds = computed(() => [...this.selectedSet()]);
  protected readonly allVisibleSelected = computed(() => {
    const rows = this.visible();
    const set = this.selectedSet();
    return rows.length > 0 && rows.every((e) => set.has(e.id));
  });
  protected readonly someVisibleSelected = computed(() => {
    const set = this.selectedSet();
    return !this.allVisibleSelected() && this.visible().some((e) => set.has(e.id));
  });
  protected readonly bulkChanges = computed(() => bulkHasChange(this.bulk()));

  /** The next control (in list order) that still needs a justification. */
  protected readonly nextMissing = computed(() => {
    const items = this.soa()?.items ?? [];
    const current = this.selected();
    const start = current ? items.findIndex((e) => e.id === current.id) : -1;
    for (let i = 1; i <= items.length; i++) {
      const e = items[(start + i) % items.length];
      if (e && e.needs_justification && e.id !== current?.id) {
        return e;
      }
    }
    return null;
  });

  protected readonly panelTitle = computed(() => {
    const e = this.selected();
    return e ? `${e.control_ref} · ${this.titleOf(e)}` : '';
  });

  protected readonly justificationMissing = computed(() => {
    const f = this.form();
    return !f.applicable && !f.justification.trim() && this.submitted();
  });

  protected readonly signer = computed(() => this.auth.displayName() || '');

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'soa_entry',
      entityId: this.selected()?.id ?? null,
      view: this.selected() ? 'detail' : 'list',
      title: this.name(),
      selection: this.selected() ? { field: this.selected()?.control_ref } : null,
      requirements: this.selected() ? [this.selected()!.qualified_ref] : null,
      standardKey: this.key(),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const key = this.key();
      untracked(() => this.load(orgId, key));
    });
    effect(() => {
      const control = this.control();
      const soa = this.soa();
      untracked(() => {
        if (control && soa && control !== this.openedControl) {
          const entry = soa.items.find((e) => e.control_ref === control);
          if (entry) {
            this.openedControl = control;
            this.open(entry, false);
          }
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.perms.orgId(), this.key());
  }

  private load(orgId: string | null, key: string): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = this.api.getSoa(orgId, key).subscribe({
      next: (soa) => {
        this.soa.set(soa);
        this.state.set('ready');
        // Keep the open entry in step with the reloaded list.
        const open = this.selected();
        if (open) {
          const fresh = soa.items.find((e) => e.id === open.id);
          if (fresh) {
            this.selected.set(fresh);
          }
        }
      },
      error: (e: unknown) => {
        this.loadErrorKey.set(riskErrorKey(e));
        this.state.set('error');
      },
    });
  }

  protected titleOf(e: SoaEntry): string {
    return this.language.active() === 'nb' && e.title_nb ? e.title_nb : e.title;
  }

  protected clearFilters(): void {
    this.q.set('');
    this.applicable.set('all');
    this.implementation.set('');
    this.theme.set('');
  }

  protected open(e: SoaEntry, syncUrl = true): void {
    this.selected.set(e);
    this.form.set(entryToForm(e));
    this.errorKey.set(null);
    this.submitted.set(false);
    if (syncUrl) {
      this.openedControl = e.control_ref;
      void this.router.navigate([], { queryParams: { control: e.control_ref }, replaceUrl: true });
    }
  }

  protected close(): void {
    this.selected.set(null);
    this.openedControl = null;
    void this.router.navigate([], { queryParams: { control: null }, replaceUrl: true });
  }

  protected set<K extends keyof EntryForm>(key: K, value: EntryForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected toggleReason(reason: InclusionReason, checked: boolean): void {
    this.form.update((f) => ({
      ...f,
      inclusion_reasons: checked
        ? [...new Set([...f.inclusion_reasons, reason])]
        : f.inclusion_reasons.filter((r) => r !== reason),
    }));
  }

  /** Save the open control; with `next`, open the next one without a justification. */
  protected save(next: SoaEntry | null = null): void {
    const orgId = this.perms.orgId();
    const entry = this.selected();
    const f = this.form();
    this.submitted.set(true);
    if (!orgId || !entry || (!f.applicable && !f.justification.trim())) {
      return;
    }
    const body = soaEntryPatch(entry, f);
    if (Object.keys(body).length === 0) {
      if (next) {
        this.open(next);
      } else {
        this.close();
      }
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    this.api.updateSoaEntry(orgId, entry.id, body).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.toasts.success('risk.notices.soaSaved', { ref: updated.control_ref });
        this.submitted.set(false);
        if (next) {
          this.open(next);
        } else {
          this.selected.set(updated);
          this.form.set(entryToForm(updated));
        }
        this.load(orgId, this.key());
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }

  protected linkDocument(entry: SoaEntry, doc: EntityRef): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.kit
      .createLink(orgId, {
        source_type: 'soa_entry',
        source_id: entry.id,
        target_type: doc.entity_type,
        target_id: doc.entity_id,
        link_type: 'relates_to',
      })
      .subscribe({
        next: () => {
          this.toasts.success('risk.soa.documentation.linked', { name: doc.code || doc.title });
          this.selected.set({ ...entry, documentation: [...(entry.documentation ?? []), doc] });
          this.load(orgId, this.key());
        },
        error: () => this.toasts.error('risk.soa.documentation.linkFailed'),
      });
  }

  // --- bulk -------------------------------------------------------------------------

  protected isSelected(id: string): boolean {
    return this.selectedSet().has(id);
  }

  protected toggle(id: string, checked: boolean): void {
    this.selectedSet.update((set) => {
      const next = new Set(set);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected toggleAll(checked: boolean): void {
    this.selectedSet.update((set) => {
      const next = new Set(set);
      for (const e of this.visible()) {
        if (checked) {
          next.add(e.id);
        } else {
          next.delete(e.id);
        }
      }
      return next;
    });
  }

  protected clearSelection(): void {
    this.selectedSet.set(new Set());
  }

  protected openBulk(): void {
    this.bulk.set(EMPTY_BULK);
    this.bulkError.set(null);
    this.bulkOpen.set(true);
  }

  protected setBulk<K extends keyof BulkForm>(key: K, value: BulkForm[K]): void {
    this.bulk.update((f) => ({ ...f, [key]: value }));
  }

  protected toggleBulkReason(reason: InclusionReason, checked: boolean): void {
    this.bulk.update((f) => ({
      ...f,
      inclusion_reasons: checked
        ? [...new Set([...f.inclusion_reasons, reason])]
        : f.inclusion_reasons.filter((r) => r !== reason),
    }));
  }

  protected applyBulk(): void {
    const orgId = this.perms.orgId();
    const ids = this.selectedIds();
    if (!orgId || ids.length === 0 || !this.bulkChanges()) {
      return;
    }
    this.saving.set(true);
    this.bulkError.set(null);
    this.api.bulkUpdateSoa(orgId, this.key(), soaBulkBody(ids, this.bulk())).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.bulkOpen.set(false);
        this.clearSelection();
        this.toasts.success('risk.soa.bulk.done', { count: res.updated });
        this.load(orgId, this.key());
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.bulkError.set(riskErrorKey(e));
      },
    });
  }

  // --- versions ---------------------------------------------------------------------

  protected openApprove(): void {
    this.approveNote.set('');
    this.approveError.set(null);
    this.approveOpen.set(true);
  }

  protected approve(): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.saving.set(true);
    this.approveError.set(null);
    this.api.approveSoa(orgId, this.key(), this.approveNote().trim() || null).subscribe({
      next: (v) => {
        this.saving.set(false);
        this.approveOpen.set(false);
        this.toasts.success('risk.soa.version.approved', { version: v.version_no });
        this.load(orgId, this.key());
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.approveError.set(riskErrorKey(e));
      },
    });
  }

  protected openVersions(): void {
    const orgId = this.perms.orgId();
    this.versionsOpen.set(true);
    if (!orgId) {
      return;
    }
    this.api.listSoaVersions(orgId, this.key()).subscribe({
      next: (res) => this.versions.set(res.items),
      error: () => this.versions.set([]),
    });
  }

  protected generate(): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.api.generateSoa(orgId, this.key()).subscribe({
      next: (res) => {
        this.soa.set(res);
        this.toasts.success('risk.soa.generated', { count: res.created });
      },
      error: (e: unknown) => this.toasts.error(riskErrorKey(e)),
    });
  }

  protected exportCsv(): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.exporting.set(true);
    this.api.exportSoa(orgId, this.key(), this.language.active()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, `soa-${this.key()}.csv`);
      },
      error: () => {
        this.exporting.set(false);
        this.toasts.error('risk.soa.exportFailed');
      },
    });
  }
}
