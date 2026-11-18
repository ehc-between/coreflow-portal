import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Term } from '../../shared/guidance/term';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { EnvironmentApi } from './data/environment-api';
import { Emissions, GHG_SCOPES, GhgScope } from './data/environment.models';
import { changeDirection, displayUnit, kgToTonnes } from './data/environment-display';
import { ENV_CRUMBS, ENV_MODULE, ENV_ROOT_CRUMB, injectEnvPermissions } from './environment-shared';

/** The years offered in the year picker (this year and the nine before). */
export function emissionYears(now = new Date()): number[] {
  const year = now.getFullYear();
  return Array.from({ length: 10 }, (_, i) => year - i);
}

/** Whether a scope has data this year (`scope_status`; an older backend: any value > 0). */
export function scopeMeasured(e: Emissions, scope: GhgScope): boolean {
  const status = e.scope_status?.[scope];
  return status ? status === 'measured' : (e.scopes[scope] ?? 0) > 0;
}

/** A scope's share of the total, in % (one decimal). */
export function scopeShare(e: Emissions, scope: GhgScope): number {
  const value = e.scopes[scope] ?? 0;
  return e.total_kg > 0 ? Math.round((value / e.total_kg) * 1000) / 10 : 0;
}

/** The CSV file name the backend uses (`utslipp-2026.csv` / `emissions-2026.csv`). */
export function exportFileName(year: number, lang: string): string {
  return lang === 'en' ? `emissions-${year}.csv` : `utslipp-${year}.csv`;
}

/**
 * `/environment/emissions`: the year's greenhouse gas emissions in tonnes CO₂e,
 * against the previous year. Each emission category (scope 1, 2 and 3) is explained
 * and says "Ikke kartlagt" when nothing is measured (never 0); the indicators that
 * are left out (no emission factor or no category) are listed with a link to fix
 * them; the table shows each indicator's factor with its source, this year, last
 * year and the change. "Last ned CSV" exports the report (nb: semicolons and
 * decimal commas). All tonnes use two decimals.
 */
@Component({
  selector: 'app-env-emissions-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalNumberPipe,
    Term,
    WhyItMatters,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="environment.emissions.title"
        descriptionKey="environment.emissions.subtitle"
        [breadcrumbs]="crumbs"
        [settingsLink]="perms.settingsLink()"
      >
        <app-button
          secondary
          variant="secondary"
          [loading]="exporting()"
          [disabled]="exporting() || state() !== 'ready'"
          (click)="exportCsv()"
          data-testid="emissions-export"
        >
          <app-icon name="documents" [size]="15" />
          {{ 'environment.emissions.export' | transloco }}
        </app-button>
      </app-page-header>
      <app-module-nav
        class="mb-4 block"
        [items]="perms.nav()"
        labelKey="modules.names.environment"
      />
      <app-help-strip scope="environment" page="emissions" lesson="monitoring-and-emissions" />

      <div class="mb-5 flex flex-wrap items-center gap-2">
        <label for="cf-env-em-year" class="text-ui font-semibold text-fg-muted">
          {{ 'environment.emissions.year' | transloco }}
        </label>
        <select
          id="cf-env-em-year"
          class="h-10 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg"
          (change)="year.set(+$any($event.target).value)"
          data-testid="emissions-year"
        >
          @for (y of years; track y) {
            <option [value]="y" [selected]="year() === y">{{ y }}</option>
          }
        </select>
      </div>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (data(); as e) {
            <div class="flex flex-col gap-5">
              <div
                class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                data-testid="emissions-scopes"
              >
                <app-card>
                  <p class="text-meta font-semibold text-fg-muted">
                    {{ 'environment.emissions.total' | transloco: { year: e.year } }}
                  </p>
                  <p
                    class="mt-2 font-display text-page leading-none font-bold text-fg"
                    data-testid="emissions-total"
                  >
                    {{
                      'environment.common.tonnes'
                        | transloco: { value: (tonnes(e.total_kg) | localNumber: '1.2-2') }
                    }}
                  </p>
                  @if (e.previous_year; as prev) {
                    <p class="mt-2 text-meta text-fg-muted">
                      {{
                        'environment.emissions.previous'
                          | transloco
                            : {
                                year: prev.year,
                                value: (tonnes(prev.total_kg) | localNumber: '1.2-2'),
                              }
                      }}
                    </p>
                    @if (e.change_pct !== null && e.change_pct !== undefined) {
                      <p
                        class="mt-1 text-meta font-semibold"
                        [class.text-pass-ink]="dir(e.change_pct) === 'down'"
                        [class.text-warn-ink]="dir(e.change_pct) === 'up'"
                        data-testid="emissions-change"
                      >
                        {{ changeText(e.change_pct) }}
                      </p>
                    }
                  }
                </app-card>
                @for (s of scopes; track s) {
                  <app-card [attr.data-testid]="'scope-' + s">
                    <p class="text-meta font-semibold text-fg-muted">
                      <app-term key="ghg-scope" scope="environment">{{
                        'environment.scopes.' + s | transloco
                      }}</app-term>
                    </p>
                    @if (measured(e, s)) {
                      <p class="mt-2 font-display text-section font-bold text-fg">
                        {{
                          'environment.common.tonnes'
                            | transloco: { value: (tonnes(e.scopes[s]) | localNumber: '1.2-2') }
                        }}
                      </p>
                      <div
                        class="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
                        role="img"
                        [attr.aria-label]="
                          'environment.emissions.share' | transloco: { pct: share(e, s) }
                        "
                      >
                        <div
                          class="h-full rounded-full bg-accent"
                          [style.width.%]="share(e, s)"
                        ></div>
                      </div>
                      <p class="mt-1 text-meta text-fg-muted">
                        {{
                          'environment.emissions.share'
                            | transloco: { pct: (share(e, s) | localNumber: '1.0-1') }
                        }}
                        @if (scopeChange(e, s); as text) {
                          · {{ text }}
                        }
                      </p>
                    } @else {
                      <p class="mt-2 font-display text-section font-bold text-fg-muted">
                        {{ 'environment.emissions.notMeasured' | transloco }}
                      </p>
                      <p class="mt-1 text-meta text-fg-muted">
                        {{ 'environment.emissions.notMeasuredHint' | transloco }}
                      </p>
                    }
                    <p class="mt-2 text-meta text-fg-subtle">
                      {{ 'environment.scopeHelp.' + s | transloco }}
                    </p>
                  </app-card>
                }
              </div>

              @if (gaps().length) {
                <app-card data-testid="emissions-gaps">
                  <h2 class="mb-1 flex items-center gap-2 font-display text-card font-bold text-fg">
                    <app-icon name="alert" [size]="15" class="text-warn" />
                    {{ 'environment.emissions.gapsTitle' | transloco }}
                  </h2>
                  <p class="mb-3 text-ui text-fg-muted">
                    {{ 'environment.emissions.gapsHint' | transloco }}
                  </p>
                  <ul class="flex flex-col divide-y divide-border">
                    @for (g of gaps(); track g.metric_id) {
                      <li
                        class="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span class="text-ui">
                          <a
                            [routerLink]="g.url"
                            class="font-semibold text-fg hover:text-accent hover:underline"
                          >
                            <span class="font-mono text-meta text-fg-subtle">{{ g.code }}</span>
                            {{ g.name }}
                          </a>
                          <span class="block text-meta text-fg-muted">{{
                            'environment.emissions.gapReason.' + g.reason | transloco
                          }}</span>
                        </span>
                        @if (perms.write()) {
                          <a
                            [routerLink]="['/environment/metrics', g.metric_id, 'edit']"
                            class="text-ui font-semibold text-accent hover:underline"
                            >{{ 'environment.emissions.fixGap' | transloco }}</a
                          >
                        }
                      </li>
                    }
                  </ul>
                </app-card>
              }

              <app-card [padded]="false">
                <div class="px-4 pt-4 pb-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'environment.emissions.byMetric' | transloco }}
                  </h2>
                </div>
                @if (e.by_metric.length) {
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-ui" data-testid="emissions-table">
                      <thead class="text-meta text-fg-subtle">
                        <tr>
                          <th scope="col" class="px-4 py-1.5 font-semibold">
                            {{ 'environment.emissions.indicator' | transloco }}
                          </th>
                          <th scope="col" class="px-2 py-1.5 text-right font-semibold">
                            {{ 'environment.emissions.amount' | transloco }}
                          </th>
                          <th scope="col" class="px-2 py-1.5 font-semibold">
                            {{ 'environment.fields.emissionFactor' | transloco }}
                          </th>
                          <th scope="col" class="px-2 py-1.5 text-right font-semibold">
                            {{ 'environment.emissions.tonnesYear' | transloco: { year: e.year } }}
                          </th>
                          <th scope="col" class="px-2 py-1.5 text-right font-semibold">
                            {{
                              'environment.emissions.tonnesYear' | transloco: { year: e.year - 1 }
                            }}
                          </th>
                          <th scope="col" class="px-4 py-1.5 text-right font-semibold">
                            {{ 'environment.metric.change' | transloco }}
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border text-fg">
                        @for (r of e.by_metric; track r.metric_id) {
                          <tr class="align-top">
                            <td class="px-4 py-2">
                              <a
                                [routerLink]="r.url || ['/environment/metrics', r.metric_id]"
                                class="font-semibold hover:text-accent hover:underline"
                              >
                                <span class="font-mono text-meta text-fg-subtle">{{ r.code }}</span>
                                {{ r.name }}
                              </a>
                              <span class="block text-meta text-fg-muted">{{
                                (r.ghg_scope
                                  ? 'environment.scopes.' + r.ghg_scope
                                  : 'environment.scopes.none'
                                ) | transloco
                              }}</span>
                            </td>
                            <td class="px-2 py-2 text-right whitespace-nowrap">
                              {{ r.value | localNumber: '1.0-2' }} {{ unit(r.unit) }}
                            </td>
                            <td class="px-2 py-2">
                              @if (r.emission_factor !== null && r.emission_factor !== undefined) {
                                <span class="whitespace-nowrap">{{
                                  'environment.metric.factorValue'
                                    | transloco
                                      : {
                                          value: (r.emission_factor | localNumber: '1.0-6'),
                                          unit: unit(r.unit),
                                        }
                                }}</span>
                              }
                              @if (r.factor_source || r.factor_year) {
                                <span class="block text-meta text-fg-subtle">{{
                                  'environment.metric.factorFrom'
                                    | transloco
                                      : {
                                          source: r.factor_source || '—',
                                          year: r.factor_year || '—',
                                        }
                                }}</span>
                              }
                            </td>
                            <td class="px-2 py-2 text-right font-semibold whitespace-nowrap">
                              {{ tonnes(r.co2e_kg) | localNumber: '1.2-2' }}
                            </td>
                            <td class="px-2 py-2 text-right whitespace-nowrap text-fg-muted">
                              {{
                                r.previous_co2e_kg === null || r.previous_co2e_kg === undefined
                                  ? '–'
                                  : (tonnes(r.previous_co2e_kg) | localNumber: '1.2-2')
                              }}
                            </td>
                            <td class="px-4 py-2 text-right whitespace-nowrap">
                              {{
                                r.change_pct === null || r.change_pct === undefined
                                  ? '–'
                                  : changeText(r.change_pct)
                              }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <app-empty-state
                    icon="leaf"
                    titleKey="environment.emissions.noDataTitle"
                    bodyKey="environment.emissions.noData"
                    [compact]="true"
                    [ctaKey]="perms.write() ? 'environment.emissions.openMetrics' : null"
                    ctaLink="/environment/metrics"
                  />
                }
              </app-card>
            </div>
          }
        }
      }

      <div class="mt-8">
        <app-why-it-matters scope="environment" page="emissions" />
      </div>
    </div>
  `,
})
export class EmissionsPage {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly document = inject(DOCUMENT);

  protected readonly perms = injectEnvPermissions();
  protected readonly crumbs = [ENV_ROOT_CRUMB, { labelKey: ENV_CRUMBS.emissions.labelKey }];
  protected readonly years = emissionYears();
  protected readonly scopes = GHG_SCOPES;
  protected readonly tonnes = kgToTonnes;
  protected readonly unit = displayUnit;
  protected readonly measured = scopeMeasured;
  protected readonly share = scopeShare;
  protected readonly dir = changeDirection;

  protected readonly year = signal(new Date().getFullYear());
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<Emissions | null>(null);
  protected readonly exporting = signal(false);

  protected readonly gaps = computed(() => this.data()?.missing_factor ?? []);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: ENV_MODULE,
      view: 'dashboard',
      title: `${this.language.translate('environment.emissions.title')} ${this.year()}`,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const year = this.year();
      untracked(() => this.load(orgId, year));
    });
  }

  /** "+8 % fra i fjor" / "−12 % fra i fjor" / "Uendret fra i fjor". */
  protected changeText(pct: number): string {
    const d = changeDirection(pct);
    if (d === 'flat') {
      return this.language.translate('environment.emissions.unchanged');
    }
    const value = Math.abs(Math.round(pct));
    return this.language.translate(
      d === 'up' ? 'environment.emissions.up' : 'environment.emissions.down',
      { pct: value },
    );
  }

  protected scopeChange(e: Emissions, scope: GhgScope): string | null {
    const pct = e.scope_change_pct?.[scope];
    return pct === null || pct === undefined ? null : this.changeText(pct);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.year());
  }

  protected exportCsv(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    const lang = this.language.active() === 'en' ? 'en' : 'nb';
    const year = this.year();
    this.exporting.set(true);
    this.api.exportEmissions(orgId, year, lang).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = this.document.createElement('a');
        a.href = url;
        a.download = exportFileName(year, lang);
        this.document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting.set(false);
        this.notifications.error('environment.emissions.exportFailed');
      },
    });
  }

  private load(orgId: string | null, year: number): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.emissions(orgId, year).subscribe({
      next: (e) => {
        this.data.set(e);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
