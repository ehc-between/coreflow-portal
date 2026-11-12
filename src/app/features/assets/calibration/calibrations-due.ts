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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { calibrationTone, daysUntil } from '../data/asset-display';
import { Asset } from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { AssetsNav } from '../shared/assets-nav';

export const DUE_WINDOWS = [30, 60, 90, 365] as const;

/**
 * Calibration due list (`/assets/calibration`): measuring equipment whose
 * calibration is overdue or falls due within the chosen window (ISO 9001 7.1.5),
 * soonest first, with a link to record the calibration on the asset.
 */
@Component({
  selector: 'app-calibrations-due',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    AssetsNav,
    Badge,
    Button,
    Card,
    GuideIntro,
    Icon,
    LessonView,
    TeachingEmpty,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'assets.calibrationPage.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'assets.calibrationPage.subtitle' | transloco }}
          </p>
          <app-assets-nav />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-button variant="ghost" size="sm" (click)="askPlan()">
            <app-icon name="spark" [size]="14" />
            {{ 'assets.ai.calibrationPlan' | transloco }}
          </app-button>
          <label class="sr-only" for="cal-window">{{
            'assets.calibrationPage.window' | transloco
          }}</label>
          <select
            id="cal-window"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="windowDays.set(+$any($event.target).value)"
          >
            @for (w of windows; track w) {
              <option [value]="w" [selected]="windowDays() === w">
                {{ 'assets.calibrationPage.within' | transloco: { days: w } }}
              </option>
            }
          </select>
        </div>
      </div>

      <div class="mb-4 flex flex-col gap-3">
        <app-guide-intro scope="assets" page="calibration" />
        <div><app-lesson scope="assets" lesson="calibration" /></div>
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted">
            {{ 'assets.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="py-10 text-center text-[14px] text-fail" role="alert">
            {{ 'assets.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (rows().length === 0) {
            <app-teaching-empty scope="assets" page="calibration" [showAction]="false" />
          } @else {
            <app-card [padded]="false">
              <ul class="divide-y divide-border" data-testid="due-rows">
                @for (row of rows(); track row.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/assets', row.id]"
                        class="flex items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                        <span class="truncate">{{ row.name }}</span>
                      </a>
                      <span class="flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                        @if (row.location) {
                          <span>{{ row.location }}</span>
                        }
                        @if (row.owner?.name; as owner) {
                          <span>{{ 'assets.list.ownedBy' | transloco: { name: owner } }}</span>
                        }
                        @if (row.last_calibrated_on) {
                          <span>
                            {{
                              'assets.calibrationPage.last'
                                | transloco: { date: (row.last_calibrated_on | localDay) }
                            }}
                          </span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px]">
                      @if (row.calibration_status) {
                        <app-badge [tone]="tone(row.calibration_status)">
                          {{ 'assets.calibrationStatus.' + row.calibration_status | transloco }}
                        </app-badge>
                      }
                      @if (row.next_calibration_due) {
                        <span
                          class="w-[170px] text-right text-fg-muted"
                          [class.text-fail]="row.calibration_status === 'overdue'"
                          [class.font-semibold]="row.calibration_status === 'overdue'"
                        >
                          {{ dueText(row) }}
                        </span>
                      }
                    </span>
                  </li>
                }
              </ul>
            </app-card>
          }
        }
      }

      <div class="mt-6"><app-why-it-matters scope="assets" page="calibration" /></div>
    </div>
  `,
})
export class CalibrationsDue {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  protected readonly windows = DUE_WINDOWS;
  protected readonly tone = calibrationTone;
  protected readonly windowDays = signal<number>(60);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  private readonly items = signal<readonly Asset[]>([]);
  protected readonly rows = computed(() =>
    [...this.items()].sort((a, b) =>
      (a.next_calibration_due ?? '9999').localeCompare(b.next_calibration_due ?? '9999'),
    ),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'assets',
      entityType: 'calibration',
      view: 'list',
      title: this.language.translate('assets.calibrationPage.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const days = this.windowDays();
      untracked(() => this.load(orgId, days));
    });
  }

  protected dueText(row: Asset): string {
    const days = daysUntil(row.next_calibration_due);
    if (days === null) {
      return '';
    }
    if (days < 0) {
      return this.language.translate('assets.calibrationPage.overdueBy', { days: -days });
    }
    if (days === 0) {
      return this.language.translate('assets.calibrationPage.dueToday');
    }
    return this.language.translate('assets.calibrationPage.dueIn', { days });
  }

  protected askPlan(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.calibrationPlan'));
  }

  private load(orgId: string | null, days: number): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.calibrationsDue(orgId, days).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
