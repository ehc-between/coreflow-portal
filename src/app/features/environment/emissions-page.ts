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
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Alert } from '../../shared/ui/alert/alert';
import { Card } from '../../shared/ui/card/card';
import { EnvironmentApi } from './data/environment-api';
import { Emissions, GHG_SCOPES, GhgScope } from './data/environment.models';
import { kgToTonnes } from './data/environment-display';
import { environmentErrorKey } from './data/environment-errors';
import { EnvironmentTabs } from './environment-tabs';
import { EnvLessonLink } from './lesson-link';

/** Years offered in the picker: this year and the nine before it. */
export function emissionYears(now = new Date()): number[] {
  const year = now.getFullYear();
  return Array.from({ length: 10 }, (_, i) => year - i);
}

/**
 * `/environment/emissions`: the year's greenhouse gas emissions by scope (1, 2
 * and 3) and by metric, in tonnes CO2e, from measurements with an emission factor.
 * Each scope's share is shown as a bar with its value written next to it.
 */
@Component({
  selector: 'app-env-emissions',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalNumberPipe,
    AskAbout,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    Alert,
    Card,
    EnvironmentTabs,
    EnvLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-environment-tabs />
    <div class="mx-auto max-w-[1180px] px-4 pt-5 pb-12 sm:px-8">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            data-testid="emissions-title"
          >
            {{ 'environment.emissions.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'environment.emissions.subtitle' | transloco }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-ask-about [prompt]="'environment.ask.emissions' | transloco: { year: year() }" />
          <label class="sr-only" for="cf-env-e-year">{{
            'environment.emissions.year' | transloco
          }}</label>
          <select
            id="cf-env-e-year"
            class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="year.set(+$any($event.target).value)"
            data-testid="emissions-year"
          >
            @for (y of years; track y) {
              <option [value]="y" [selected]="year() === y">{{ y }}</option>
            }
          </select>
        </div>
      </div>
      <div class="mb-6"><app-guide-intro scope="environment" page="emissions" /></div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'environment.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
        }
        @default {
          @if (data(); as e) {
            @if (e.by_metric.length === 0) {
              <app-card>
                <app-teaching-empty scope="environment" page="emissions" [showAction]="false" />
                <a
                  routerLink="/environment/metrics"
                  class="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline"
                  >{{ 'environment.overview.openMetrics' | transloco }}</a
                >
              </app-card>
            } @else {
              <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
                <app-card>
                  <p class="text-[12.5px] font-semibold text-fg-muted">
                    {{ 'environment.emissions.total' | transloco: { year: e.year } }}
                  </p>
                  <p
                    class="mt-1 font-display text-[30px] leading-none font-bold text-fg"
                    data-testid="emissions-total"
                  >
                    {{
                      'environment.common.tonnes'
                        | transloco: { value: (e.total_t | localNumber: '1.0-2') }
                    }}
                  </p>
                  <ul class="mt-5 flex flex-col gap-3" data-testid="emissions-scopes">
                    @for (s of scopes; track s) {
                      <li>
                        <div class="flex items-baseline justify-between gap-2 text-[13px]">
                          <span class="font-semibold text-fg">{{
                            'environment.scopes.' + s | transloco
                          }}</span>
                          <span class="text-fg">
                            {{
                              'environment.common.tonnes'
                                | transloco: { value: (tonnes(e.scopes[s]) | localNumber: '1.0-2') }
                            }}
                            <span class="text-fg-subtle">
                              ({{ share(e, s) | localNumber: '1.0-0' }} %)</span
                            >
                          </span>
                        </div>
                        <div
                          class="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2"
                          aria-hidden="true"
                        >
                          <div
                            class="h-full rounded-full bg-accent"
                            [style.width.%]="share(e, s)"
                          ></div>
                        </div>
                        <p class="mt-0.5 text-[11.5px] text-fg-subtle">
                          {{ 'environment.scopeHelp.' + s | transloco }}
                        </p>
                      </li>
                    }
                  </ul>
                </app-card>
                <app-card [padded]="false">
                  <h2 class="px-4 pt-4 pb-2 font-display text-[15px] font-bold text-fg">
                    {{ 'environment.emissions.byMetric' | transloco }}
                  </h2>
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-[13px]" data-testid="emissions-metrics">
                      <thead class="text-fg-subtle">
                        <tr>
                          <th scope="col" class="px-4 py-1.5 font-semibold">
                            {{ 'environment.fields.name' | transloco }}
                          </th>
                          <th scope="col" class="px-2 py-1.5 font-semibold">
                            {{ 'environment.fields.ghgScope' | transloco }}
                          </th>
                          <th scope="col" class="px-2 py-1.5 text-right font-semibold">
                            {{ 'environment.metric.value' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-1.5 text-right font-semibold">t CO₂e</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border text-fg">
                        @for (r of e.by_metric; track r.metric_id) {
                          <tr>
                            <td class="px-4 py-2">
                              <a
                                [routerLink]="['/environment/metrics', r.metric_id]"
                                class="font-semibold hover:underline"
                              >
                                <span class="font-mono text-[12px] text-fg-subtle">{{
                                  r.code
                                }}</span>
                                {{ r.name }}
                              </a>
                            </td>
                            <td class="px-2 py-2">
                              {{
                                r.ghg_scope
                                  ? ('environment.scopes.' + r.ghg_scope | transloco)
                                  : '–'
                              }}
                            </td>
                            <td class="px-2 py-2 text-right whitespace-nowrap">
                              {{ r.value | localNumber: '1.0-2' }} {{ r.unit }}
                            </td>
                            <td class="px-4 py-2 text-right font-semibold whitespace-nowrap">
                              {{ tonnes(r.co2e_kg) | localNumber: '1.0-2' }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </app-card>
              </div>
            }
          }
        }
      }

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="environment" page="emissions" />
        <app-env-lesson-link lesson="monitoring-and-emissions" />
      </div>
    </div>
  `,
})
export class EmissionsPage {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly years = emissionYears();
  protected readonly scopes = GHG_SCOPES;
  protected readonly tonnes = kgToTonnes;
  protected readonly year = signal(new Date().getFullYear());
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.common.loadFailed');
  protected readonly data = signal<Emissions | null>(null);

  protected readonly title = computed(() => this.language.translate('environment.emissions.title'));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'environment',
      view: 'dashboard',
      title: `${this.title()} ${this.year()}`,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const year = this.year();
      untracked(() => this.load(orgId, year));
    });
  }

  protected share(e: Emissions, scope: GhgScope): number {
    const value = e.scopes[scope] ?? 0;
    return e.total_kg > 0 ? Math.round((value / e.total_kg) * 1000) / 10 : 0;
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
      error: (error: unknown) => {
        this.errorKey.set(environmentErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
