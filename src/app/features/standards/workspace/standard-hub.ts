import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, of } from 'rxjs';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocationsApi } from '../../../core/locations/locations-api';
import { GapFillInFields, LocationCount } from '../../../core/locations/locations.models';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { internalLink } from '../../../core/search/internal-link';
import { StandardsApi } from '../../../core/standards/standards-api';
import {
  AuditPrep,
  ExportFormat,
  RequirementGap,
  StandardSummary,
} from '../../../core/standards/standards.models';
import { pluralKey } from '../../../shared/i18n/plural';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { OutputsLink } from '../../../shared/outputs/outputs-link';
import { OutputsPanel } from '../../../shared/outputs/outputs-panel';
import { requirementRoute } from '../../../shared/requirement-links/requirement-label';
import {
  SECONDARY_LINK,
  TEXT_LINK,
  locationLink,
} from '../../../shared/requirement-locations/location-links';
import { Icon } from '../../../shared/ui/icon/icon';

/** The tabs of a standard (`?tab=`); `requirements` is the reader itself. */
export const STANDARD_TABS = ['overview', 'requirements', 'registers', 'outputs', 'audit'] as const;
export type StandardTab = (typeof STANDARD_TABS)[number];

/** The tabs the hub renders (everything except the reader). */
export type HubTab = Exclude<StandardTab, 'requirements'>;

/** Gaps shown first on Oversikt. */
export const TOP_GAPS = 5;

export function isStandardTab(value: string | null | undefined): value is StandardTab {
  return !!value && (STANDARD_TABS as readonly string[]).includes(value);
}

/**
 * The tab a standard opens on: the `?tab=` asked for; otherwise the reader when the
 * link points into it (a clause, a requirement or a content filter) or the standard is
 * not enabled (there is nothing to prepare yet); otherwise Oversikt, gaps first.
 */
export function initialTab(
  tab: string | null | undefined,
  deepLink: boolean,
  enabled: boolean,
): StandardTab {
  if (!enabled) {
    return 'requirements';
  }
  if (isStandardTab(tab)) {
    return tab;
  }
  return deepLink ? 'requirements' : 'overview';
}

/** Registers that hold evidence for a standard: its mapped places with a table. */
export function registersFor(items: readonly LocationCount[], key: string): LocationCount[] {
  return items.filter((i) => i.kind === 'register' && i.needed_by.includes(key));
}

type Gap = RequirementGap & GapFillInFields;

/**
 * The non-reader tabs of a standard (simplify U19): Oversikt (the top gaps, each
 * with where to fill it in, "Se alle krav" to the gaps-only reader, the next audit),
 * Registre for denne standarden (counts, each a link), Dokumenter du kan hente ut
 * (the standard's outputs) and Forbered revisjon (next audit, open findings, the
 * requirement matrix, the audit pack, the SoA and the laws we must follow).
 */
@Component({
  selector: 'app-standard-hub',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    NgTemplateOutlet,
    Icon,
    LocalDatePipe,
    OutputsLink,
    OutputsPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let std = standard();
    @switch (tab()) {
      @case ('overview') {
        <section aria-labelledby="hub-gaps" data-testid="hub-overview">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="hub-gaps" class="font-display text-section font-bold text-fg">
              {{ 'standards.hub.gapsFirst' | transloco }}
            </h2>
            @if (gapsTotal() > 0) {
              <a
                [routerLink]="['/standards', std.key]"
                [queryParams]="{ filter: 'gaps' }"
                [class]="textLink"
                data-testid="hub-all-gaps"
                >{{ 'standards.hub.seeAllGaps' | transloco: { count: gapsTotal() } }} →</a
              >
            }
          </div>
          @if (gapsLoading()) {
            <p class="mt-3 text-ui text-fg-muted">{{ 'common.loading' | transloco }}</p>
          } @else if (gapsError()) {
            <p class="mt-3 text-ui text-fail" role="alert">
              {{ 'standards.hub.gapsError' | transloco }}
            </p>
          } @else if (gaps().length === 0) {
            <p class="mt-3 flex items-center gap-2 text-ui text-pass-ink" data-testid="hub-no-gaps">
              <app-icon name="checkcircle" [size]="15" />
              {{ 'standards.hub.noGaps' | transloco }}
            </p>
          } @else {
            <ul class="mt-3 flex flex-col divide-y divide-border rounded-card border border-border">
              @for (gap of gaps(); track gap.ref) {
                <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center">
                  <span class="min-w-0 flex-1">
                    <a
                      [routerLink]="route(gap).commands"
                      [queryParams]="route(gap).queryParams"
                      class="text-ui font-semibold text-fg hover:text-accent hover:underline"
                      [title]="gap.number"
                      data-testid="hub-gap"
                      >{{ gap.title }}</a
                    >
                    @if (gap.text) {
                      <span class="mt-0.5 line-clamp-1 block text-meta text-fg-muted">{{
                        gap.text
                      }}</span>
                    }
                  </span>
                  @if (fillLink(gap); as fill) {
                    <a
                      [routerLink]="fill.path"
                      [queryParams]="fill.queryParams"
                      [class]="secondaryLink"
                      data-testid="hub-fill-here"
                      >{{ 'standards.hub.fillHere' | transloco }} →</a
                    >
                  } @else {
                    <a
                      [routerLink]="route(gap).commands"
                      [queryParams]="route(gap).queryParams"
                      [class]="secondaryLink"
                      >{{ 'standards.hub.openRequirement' | transloco }} →</a
                    >
                  }
                </li>
              }
            </ul>
          }
        </section>

        <section class="mt-8" aria-labelledby="hub-docs">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="hub-docs" class="font-display text-section font-bold text-fg">
              {{ 'standards.hub.tabs.outputs' | transloco }}
            </h2>
            <button
              type="button"
              class="text-ui font-semibold text-accent hover:underline"
              (click)="tabChange.emit('outputs')"
            >
              {{ 'standards.hub.allOutputs' | transloco }} →
            </button>
          </div>
          <!-- Register tables stay under their own tab; here the standard's documents. -->
          <app-outputs-panel
            class="mt-3 block"
            [standardKey]="std.key"
            [excludeKinds]="registerExportKinds"
            data-testid="standard-outputs"
          />
        </section>

        <section class="mt-8" aria-labelledby="hub-next-audit">
          <h2 id="hub-next-audit" class="font-display text-section font-bold text-fg">
            {{ 'standards.hub.nextAudit' | transloco }}
          </h2>
          <ng-container *ngTemplateOutlet="nextAudit" />
          <button
            type="button"
            class="mt-2 text-ui font-semibold text-accent hover:underline"
            data-testid="hub-to-audit"
            (click)="tabChange.emit('audit')"
          >
            {{ 'standards.hub.prepareAudit' | transloco }} →
          </button>
        </section>
      }

      @case ('registers') {
        <section aria-labelledby="hub-registers" data-testid="hub-registers">
          <h2 id="hub-registers" class="font-display text-section font-bold text-fg">
            {{ 'standards.hub.tabs.registers' | transloco }}
          </h2>
          <p class="mt-1 text-ui text-fg-muted">{{ 'standards.hub.registersIntro' | transloco }}</p>
          @if (registersLoading()) {
            <p class="mt-3 text-ui text-fg-muted">{{ 'common.loading' | transloco }}</p>
          } @else if (registers().length === 0) {
            <p class="mt-3 text-ui text-fg-muted">{{ 'standards.hub.noRegisters' | transloco }}</p>
          } @else {
            <ul class="mt-3 grid gap-2 sm:grid-cols-2">
              @for (r of registers(); track r.key) {
                <li>
                  <a
                    [routerLink]="link(r.url)?.path"
                    [queryParams]="link(r.url)?.queryParams"
                    class="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 hover:border-border-strong hover:bg-surface-2"
                    [class.opacity-60]="!r.module_enabled"
                    data-testid="hub-register"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-ui font-semibold text-fg">{{
                        r.label
                      }}</span>
                      @if (!r.module_enabled) {
                        <span class="block text-meta text-fg-subtle">{{
                          'standards.hub.moduleOff' | transloco
                        }}</span>
                      }
                    </span>
                    @if (r.count !== null) {
                      <span class="font-display text-card font-bold text-fg">{{ r.count }}</span>
                    }
                  </a>
                </li>
              }
            </ul>
          }
        </section>
      }

      @case ('outputs') {
        <section aria-labelledby="hub-outputs" data-testid="hub-outputs">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="hub-outputs" class="font-display text-section font-bold text-fg">
              {{ 'standards.hub.tabs.outputs' | transloco }}
            </h2>
            <app-outputs-link [standard]="std.key" />
          </div>
          <app-outputs-panel class="mt-3 block" [standardKey]="std.key" />
        </section>
      }

      @case ('audit') {
        <section aria-labelledby="hub-audit" data-testid="hub-audit">
          <h2 id="hub-audit" class="font-display text-section font-bold text-fg">
            {{ 'standards.hub.tabs.audit' | transloco }}
          </h2>
          <p class="mt-1 text-ui text-fg-muted">{{ 'standards.hub.auditIntro' | transloco }}</p>

          <ol class="mt-4 flex flex-col gap-3">
            <li class="rounded-card border border-border bg-surface px-4 py-3">
              <h3 class="text-ui font-bold text-fg">{{ 'standards.hub.nextAudit' | transloco }}</h3>
              <ng-container *ngTemplateOutlet="nextAudit" />
            </li>

            <li
              class="rounded-card border border-border bg-surface px-4 py-3"
              data-testid="hub-findings"
            >
              <h3 class="text-ui font-bold text-fg">
                {{ 'standards.hub.openFindings' | transloco }}
              </h3>
              @if (prep(); as p) {
                @if (!p.audits_readable) {
                  <p class="mt-1 text-ui text-fg-muted">
                    {{ 'standards.hub.noAudits' | transloco }}
                  </p>
                } @else if (p.open_findings_count === 0) {
                  <p class="mt-1 text-ui text-fg-muted">
                    {{ 'standards.hub.noOpenFindings' | transloco }}
                  </p>
                } @else {
                  <p class="mt-1 text-ui text-fg">
                    {{
                      plural('standards.hub.openFindingsCount', p.open_findings_count)
                        | transloco: { count: p.open_findings_count, nc: p.open_nc_count }
                    }}
                  </p>
                  <ul class="mt-2 flex flex-col gap-1">
                    @for (f of p.open_findings; track f.id) {
                      <li>
                        <a
                          [routerLink]="link(f.url)?.path"
                          class="text-ui text-fg hover:text-accent hover:underline"
                          data-testid="hub-finding"
                          ><span class="font-mono text-meta text-fg-subtle">{{ f.code }}</span>
                          {{ f.title }}</a
                        >
                      </li>
                    }
                  </ul>
                  <a
                    routerLink="/audits/findings"
                    [queryParams]="{ status: 'unresolved' }"
                    [class]="textLink"
                    class="mt-2 inline-block"
                    >{{ 'standards.hub.allFindings' | transloco }} →</a
                  >
                }
              } @else if (!prepError()) {
                <p class="mt-1 text-ui text-fg-muted">{{ 'common.loading' | transloco }}</p>
              }
            </li>

            <li class="rounded-card border border-border bg-surface px-4 py-3">
              <h3 class="text-ui font-bold text-fg">{{ 'standards.hub.matrix' | transloco }}</h3>
              <p class="mt-1 text-ui text-fg-muted">{{ 'standards.hub.matrixHint' | transloco }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                @for (format of matrixFormats; track format) {
                  <button
                    type="button"
                    [class]="secondaryLink"
                    [disabled]="exporting()"
                    [attr.data-testid]="'hub-matrix-' + format"
                    (click)="exportMatrix.emit(format)"
                  >
                    <app-icon name="reports" [size]="14" />
                    {{ 'standards.hub.format.' + format | transloco }}
                  </button>
                }
              </div>
            </li>

            <li
              *appHasPermission="'reports:audit_pack'"
              class="rounded-card border border-border bg-surface px-4 py-3"
              data-testid="hub-pack"
            >
              <h3 class="text-ui font-bold text-fg">{{ 'standards.hub.pack' | transloco }}</h3>
              <p class="mt-1 text-ui text-fg-muted">
                @if (prep()?.latest_pack; as pack) {
                  {{
                    'standards.hub.lastPack'
                      | transloco: { date: (pack.generated_at | localDate: 'mediumDate') }
                  }}
                  ·
                  <a [routerLink]="link(pack.url)?.path" [class]="textLink">{{ pack.title }}</a>
                } @else {
                  {{ 'standards.hub.noPack' | transloco }}
                }
              </p>
              <a routerLink="/library/audit-packs" [class]="secondaryLink" class="mt-2">
                <app-icon name="qa" [size]="14" />
                {{ 'standards.hub.makePack' | transloco }}
              </a>
            </li>

            @if (hasSoa()) {
              <li
                *appHasPermission="'risk:read'"
                class="rounded-card border border-border bg-surface px-4 py-3"
              >
                <h3 class="text-ui font-bold text-fg">
                  {{ 'standards.workspace.soa' | transloco }}
                </h3>
                <p class="mt-1 text-ui text-fg-muted">{{ 'standards.hub.soaHint' | transloco }}</p>
                <a
                  [routerLink]="['/standards', std.key, 'soa']"
                  [class]="secondaryLink"
                  class="mt-2"
                  data-testid="hub-soa"
                >
                  <app-icon name="shield" [size]="14" />
                  {{ 'standards.hub.openSoa' | transloco }}
                </a>
              </li>
            }

            @if (obligationsOn()) {
              <li
                *appHasPermission="'obligations:read'"
                class="rounded-card border border-border bg-surface px-4 py-3"
              >
                <h3 class="text-ui font-bold text-fg">
                  {{ 'standards.hub.obligations' | transloco }}
                </h3>
                <p class="mt-1 text-ui text-fg-muted">
                  {{ 'standards.hub.obligationsHint' | transloco }}
                </p>
                <a
                  routerLink="/obligations"
                  [class]="textLink"
                  class="mt-2 inline-block"
                  data-testid="hub-obligations"
                  >{{ 'standards.hub.openObligations' | transloco }} →</a
                >
              </li>
            }
          </ol>
        </section>
      }
    }

    <ng-template #nextAudit>
      @if (prep()?.next_audit; as audit) {
        <p class="mt-1 text-ui text-fg" data-testid="hub-next-audit">
          <a [routerLink]="link(audit.url)?.path" [class]="textLink">{{ audit.title }}</a>
          @if (audit.date) {
            · {{ audit.date | localDate: 'mediumDate' }}
          }
        </p>
      } @else if (std.certification?.next_surveillance_at; as date) {
        <p class="mt-1 text-ui text-fg" data-testid="hub-next-audit">
          {{
            'standards.hub.surveillance'
              | transloco
                : {
                    body: std.certification?.certification_body,
                    date: (date | localDate: 'mediumDate'),
                  }
          }}
        </p>
      } @else {
        <p class="mt-1 text-ui text-fg-muted">
          {{ 'standards.hub.noNextAudit' | transloco }}
          @if (prep()?.audits_readable) {
            <a routerLink="/audits/plans/new" [class]="textLink">{{
              'standards.hub.planAudit' | transloco
            }}</a>
          }
        </p>
      }
    </ng-template>
  `,
})
export class StandardHub {
  private readonly api = inject(StandardsApi);
  private readonly locations = inject(LocationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly modules = inject(ModuleService);

  readonly standard = input.required<StandardSummary>();
  readonly tab = input.required<HubTab>();
  readonly exporting = input(false);
  /** Bumped by the workspace when evidence changed, so the gaps reload. */
  readonly refresh = input(0);
  readonly exportMatrix = output<ExportFormat>();
  readonly tabChange = output<StandardTab>();

  protected readonly registerExportKinds = ['register_export'] as const;
  protected readonly matrixFormats: readonly ExportFormat[] = ['xlsx', 'pdf'];
  protected readonly textLink = TEXT_LINK;
  protected readonly secondaryLink = SECONDARY_LINK;
  protected readonly plural = pluralKey;
  protected readonly link = internalLink;

  protected readonly gaps = signal<readonly Gap[]>([]);
  protected readonly gapsTotal = signal(0);
  protected readonly gapsLoading = signal(true);
  protected readonly gapsError = signal(false);
  protected readonly prep = signal<AuditPrep | null>(null);
  protected readonly prepError = signal(false);
  private readonly counts = signal<readonly LocationCount[] | null>(null);
  protected readonly registersLoading = computed(() => this.counts() === null);
  protected readonly registers = computed(() =>
    registersFor(this.counts() ?? [], this.standard().key),
  );
  protected readonly hasSoa = computed(
    () => /^iso(27001|42001)(-|$)/.test(this.standard().key) && this.modules.isEnabled('risk'),
  );
  protected readonly obligationsOn = computed(() => this.modules.isEnabled('obligations'));

  private readonly subs = new Subscription();
  private gapsKey: string | null = null;
  private prepKey: string | null = null;
  private countsKey: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.subs.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const key = this.standard().key;
      const tab = this.tab();
      const refresh = this.refresh();
      const lang = this.language.active();
      untracked(() => this.loadFor(orgId, key, tab, `${refresh}:${lang}`));
    });
  }

  protected route(gap: Gap) {
    return requirementRoute(
      gap.label ?? { standard_key: this.standard().key, number: gap.number, ref: gap.ref },
    );
  }

  /** "Her fyller du ut dette": the gap's first primary place, tagged with the requirement. */
  protected fillLink(gap: Gap) {
    const place = (gap.fill_in ?? []).find((p) => p.module_enabled);
    return place ? locationLink(place.url, gap.ref) : null;
  }

  private loadFor(orgId: string | null, key: string, tab: HubTab, stamp: string): void {
    if (!orgId) {
      return;
    }
    const scope = `${orgId}:${key}:${stamp}`;
    if (tab === 'overview' && this.gapsKey !== scope) {
      this.gapsKey = scope;
      this.gapsLoading.set(true);
      this.gapsError.set(false);
      this.subs.add(
        this.api.gaps(orgId, key, { limit: TOP_GAPS }).subscribe({
          next: (res) => {
            this.gaps.set(res.items as readonly Gap[]);
            this.gapsTotal.set(res.total);
            this.gapsLoading.set(false);
          },
          error: () => {
            this.gaps.set([]);
            this.gapsTotal.set(0);
            this.gapsError.set(true);
            this.gapsLoading.set(false);
          },
        }),
      );
    }
    if ((tab === 'overview' || tab === 'audit') && this.prepKey !== `${orgId}:${key}`) {
      this.prepKey = `${orgId}:${key}`;
      this.prepError.set(false);
      this.subs.add(
        this.api
          .auditPrep(orgId, key)
          .pipe(
            catchError(() => {
              this.prepError.set(true);
              return of(null);
            }),
          )
          .subscribe((prep) => this.prep.set(prep)),
      );
    }
    if (tab === 'registers' && this.countsKey !== `${orgId}:${stamp}`) {
      this.countsKey = `${orgId}:${stamp}`;
      this.subs.add(
        this.locations
          .counts(orgId, this.language.active(), ['register'])
          .pipe(catchError(() => of({ items: [], generated_at: '' })))
          .subscribe((res) => this.counts.set(res.items)),
      );
    }
  }
}
