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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { formatLocalDay } from '../../../shared/locale/locale-pipes';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { calibrationBadge, daysUntil, lifecycleBadge } from '../data/asset-display';
import { Asset } from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { assetsNav } from '../shared/assets-nav';

export const DUE_WINDOWS = [30, 60, 90, 365] as const;

/** Rows matching a search text (code, name, location, owner), soonest due first. */
export function dueRows(items: readonly Asset[], q: string): readonly Asset[] {
  const text = q.trim().toLocaleLowerCase();
  const hit = (a: Asset) =>
    !text ||
    [a.code, a.name, a.location, a.owner?.name, a.serial_number]
      .filter((v): v is string => !!v)
      .some((v) => v.toLocaleLowerCase().includes(text));
  return [...items]
    .filter(hit)
    .sort((a, b) =>
      (a.next_calibration_due ?? '9999').localeCompare(b.next_calibration_due ?? '9999'),
    );
}

/**
 * Calibration (`/assets/calibration`): measuring equipment whose calibration is
 * overdue or falls due within the chosen window (ISO 9001 7.1.5), soonest first.
 * Each row says how many days are left (or overdue), shows when an overdue
 * instrument is still in use, and offers "Registrer kalibrering" directly
 * (`/assets/<id>?calibrate=1` opens the form on the instrument's page).
 */
@Component({
  selector: 'app-calibrations-due',
  imports: [
    RouterLink,
    TranslocoPipe,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    KpiTile,
    LoadingState,
    MenuItem,
    ModuleNav,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="assets.calibrationPage.title"
      descriptionKey="assets.calibrationPage.subtitle"
      [breadcrumbs]="[{ labelKey: 'modules.names.assets', link: '/assets' }]"
      scope="assets"
      page="calibration"
      searchPlaceholderKey="assets.calibrationPage.searchPlaceholder"
      [query]="q()"
      [filters]="{ window: '' + windowDays() }"
      [empty]="showEmpty()"
      (search)="q.set($event)"
      (viewApplied)="applyView($event)"
    >
      @if (!ai.unavailable()) {
        <button appMenuItem overflow type="button" (click)="askPlan()">
          {{ 'assets.ai.calibrationPlan' | transloco }}
        </button>
      }

      <div nav appTourStep="assets-sections">
        <app-module-nav labelKey="modules.names.assets" [items]="nav()" />
      </div>
      <app-help-strip
        help
        scope="assets"
        page="calibration"
        tour="calibration"
        lesson="calibration"
      />

      <ng-container ngProjectAs="[kpis]">
        @if (state() === 'ready' && items().length) {
          <app-kpi-tile
            noLink="shownBelow"
            appTourStep="assets-calibration-summary"
            [label]="'assets.calibrationPage.overdue' | transloco"
            [value]="overdue()"
            [tone]="overdue() ? 'fail' : 'pass'"
          />
          <app-kpi-tile
            noLink="shownBelow"
            [label]="'assets.calibrationPage.inUseOverdue' | transloco"
            [value]="inUseOverdue()"
            [tone]="inUseOverdue() ? 'fail' : 'neutral'"
          />
          <app-kpi-tile
            noLink="shownBelow"
            [label]="'assets.calibrationPage.dueSoon' | transloco: { days: windowDays() }"
            [value]="dueSoon()"
            [tone]="dueSoon() ? 'warn' : 'neutral'"
          />
        }
      </ng-container>

      <ng-container filters>
        <label class="sr-only" for="cal-window">{{
          'assets.calibrationPage.window' | transloco
        }}</label>
        <select
          id="cal-window"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          appTourStep="assets-calibration-window"
          (change)="windowDays.set(+$any($event.target).value)"
        >
          @for (w of windows; track w) {
            <option [value]="w" [selected]="windowDays() === w">
              {{ 'assets.calibrationPage.within' | transloco: { days: w } }}
            </option>
          }
        </select>
      </ng-container>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="4" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (rows().length === 0) {
              <app-empty-state
                icon="search"
                titleKey="ui.empty.noResults"
                bodyKey="ui.empty.noResultsBody"
              />
            } @else {
              <div role="list" data-testid="due-rows">
                <app-record-row-header dateKind="next" />
                @for (row of rows(); track row.id) {
                  <app-record-row
                    [code]="row.code"
                    [title]="row.name"
                    [subtitle]="subtitle(row)"
                    [link]="['/assets', row.id]"
                    [owner]="row.owner?.name"
                    [date]="row.next_calibration_due"
                    dateKind="next"
                    [overdue]="row.calibration_status === 'overdue'"
                  >
                    @if (row.calibration_status) {
                      <app-status-badge
                        badges
                        [meaning]="calBadge(row.calibration_status).meaning"
                        [value]="calBadge(row.calibration_status).value"
                        [labelKey]="'assets.calibrationStatus.' + row.calibration_status"
                      />
                    }
                    @if (
                      row.lifecycle_status !== 'in_use' || row.calibration_status === 'overdue'
                    ) {
                      <app-status-badge
                        badges
                        [meaning]="lifeBadge(row.lifecycle_status).meaning"
                        [value]="lifeBadge(row.lifecycle_status).value"
                        [labelKey]="'assets.lifecycle.' + row.lifecycle_status"
                      />
                    }
                    @if (canWrite()) {
                      <a
                        coverage
                        [routerLink]="['/assets', row.id]"
                        [queryParams]="{ calibrate: 1 }"
                        class="inline-flex h-8 items-center rounded-tile border border-border bg-bg px-2.5 text-meta font-semibold whitespace-nowrap text-fg hover:bg-surface-2"
                        [attr.aria-label]="
                          'assets.calibrationPage.recordFor' | transloco: { name: row.name }
                        "
                        data-testid="row-record-calibration"
                        >{{ 'assets.calibration.record' | transloco }}</a
                      >
                    }
                  </app-record-row>
                }
              </div>
            }
          }
        }
      </app-card>

      <app-why-it-matters below scope="assets" page="calibration" />

      <div empty class="flex flex-col gap-4">
        <app-teaching-empty
          scope="assets"
          page="calibration"
          [showAction]="true"
          (action)="toInventory()"
        />
        <app-why-it-matters scope="assets" page="calibration" />
      </div>
    </app-record-list-page>
  `,
})
export class CalibrationsDue {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  protected readonly ai = inject(AiAvailability);

  protected readonly windows = DUE_WINDOWS;
  protected readonly calBadge = calibrationBadge;
  protected readonly lifeBadge = lifecycleBadge;
  protected readonly windowDays = signal<number>(60);
  protected readonly q = signal('');
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Asset[]>([]);
  protected readonly rows = computed(() => dueRows(this.items(), this.q()));
  protected readonly overdue = computed(
    () => this.items().filter((a) => a.calibration_status === 'overdue').length,
  );
  protected readonly inUseOverdue = computed(
    () =>
      this.items().filter(
        (a) => a.calibration_status === 'overdue' && a.lifecycle_status === 'in_use',
      ).length,
  );
  protected readonly dueSoon = computed(
    () => this.items().filter((a) => a.calibration_status !== 'overdue').length,
  );
  protected readonly nav = computed(() => assetsNav({ calibrationDue: this.overdue() }));
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.items().length === 0 && !this.q(),
  );

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('assets:write'));

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

  /** "12 dager på overtid · Lab A · sist kalibrert 3. mars 2025". */
  protected subtitle(row: Asset): string {
    const parts: string[] = [];
    const due = this.dueText(row);
    if (due) {
      parts.push(due);
    }
    if (row.location) {
      parts.push(row.location);
    }
    if (row.last_calibrated_on) {
      parts.push(
        this.language.translate('assets.calibrationPage.last', {
          date: formatLocalDay(row.last_calibrated_on, 'mediumDate', this.language.locale()),
        }),
      );
    }
    return parts.join(' · ');
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

  protected applyView(view: SavedView): void {
    const days = Number(view.filters['window']);
    if ((DUE_WINDOWS as readonly number[]).includes(days)) {
      this.windowDays.set(days);
    }
  }

  protected toInventory(): void {
    void this.router.navigate(['/assets']);
  }

  protected askPlan(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.calibrationPlan'));
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.windowDays());
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
