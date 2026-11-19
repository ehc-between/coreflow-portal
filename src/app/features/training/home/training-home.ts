import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiBand } from '../../../shared/ui/kpi-band/kpi-band';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, TrainingAccess, cellBadge } from '../data/training-display';
import { NeedItem, Needs, TrainingStats } from '../data/training.models';

/** Order of a person's needs on the home page: what needs action first. */
const NEED_ORDER: Readonly<Record<string, number>> = {
  overdue: 0,
  expired: 1,
  assigned: 2,
  expiring: 3,
  missing: 4,
  compliant: 5,
};

export function sortNeeds(items: readonly NeedItem[]): NeedItem[] {
  return [...items].sort(
    (a, b) =>
      (NEED_ORDER[a.status] ?? 9) - (NEED_ORDER[b.status] ?? 9) ||
      (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') ||
      a.course.title.localeCompare(b.course.title),
  );
}

/** The one action a training need offers: open the record, take the course, or nothing. */
export function needAction(need: NeedItem): 'record' | 'start' | 'retake' | null {
  if (need.status === 'compliant' && need.record_id) {
    return 'record';
  }
  if (need.course.kind === 'external') {
    return null;
  }
  return need.status === 'assigned' || need.status === 'overdue' || need.status === 'missing'
    ? 'start'
    : 'retake';
}

/**
 * `/training` (module root, "Min opplæring"): the learner's own training first
 * (needs from the rules, open assignments, valid certificates); for people who
 * oversee training, the programme figures and what to follow up.
 */
@Component({
  selector: 'app-training-home',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    KpiBand,
    KpiTile,
    LoadingState,
    ModuleNav,
    PageHeader,
    StatusBadge,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="modules.names.training"
        descriptionKey="training.home.subtitle"
        [breadcrumbs]="[{ labelKey: 'modules.names.training' }]"
        outputsModule="training"
      >
        <app-button
          secondary
          variant="secondary"
          (click)="router.navigate(['/training/courses'])"
          [appTourStep]="'training-courses'"
        >
          <app-icon name="training" [size]="15" />
          {{ 'training.home.browse' | transloco }}
        </app-button>
      </app-page-header>
      <app-module-nav [items]="access.navItems()" labelKey="training.nav.label" />
      <app-help-strip scope="training" page="home" tour="home" lesson="competence-and-awareness" />

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="training-needs-heading" class="min-w-0">
          <h2 id="training-needs-heading" class="mb-3 font-display text-section font-bold text-fg">
            {{ 'training.home.needsTitle' | transloco }}
          </h2>
          @if (loading()) {
            <app-loading-state [rows]="3" />
          } @else if (failed()) {
            <app-error-state (retry)="reload()" />
          } @else if (needs().length === 0) {
            <app-card>
              <app-teaching-empty
                scope="training"
                page="home"
                (action)="router.navigate(['/training/courses'])"
              />
            </app-card>
          } @else {
            <ul class="flex flex-col gap-2" data-testid="training-needs">
              @for (need of needs(); track need.course.id) {
                @let badge = badgeOf(need.status);
                <li
                  class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-surface px-4 py-3"
                >
                  <div class="min-w-0 flex-1 basis-[220px]">
                    <a
                      [routerLink]="['/training/courses', need.course.id]"
                      class="text-body font-semibold text-fg hover:text-accent hover:underline"
                    >
                      <span class="font-mono text-meta text-fg-subtle">{{ need.course.code }}</span>
                      {{ need.course.title }}
                    </a>
                    <p class="mt-0.5 text-meta text-fg-muted">
                      @if (need.status === 'compliant' || need.status === 'expiring') {
                        @if (need.expires_at) {
                          {{
                            'training.home.validUntil'
                              | transloco: { date: (need.expires_at | localDay) }
                          }}
                        } @else {
                          {{
                            'training.home.completedOn'
                              | transloco: { date: (need.completed_at | localDay) }
                          }}
                        }
                      } @else if (need.status === 'expired' && need.expires_at) {
                        {{
                          'training.home.expiredOn'
                            | transloco: { date: (need.expires_at | localDay) }
                        }}
                      } @else if (need.due_at) {
                        {{ 'training.home.dueOn' | transloco: { date: (need.due_at | localDay) } }}
                      } @else if (need.course.kind === 'external') {
                        {{ 'training.home.externalHint' | transloco }}
                      }
                    </p>
                  </div>
                  <app-status-badge
                    [meaning]="badge.meaning"
                    [value]="badge.value"
                    [labelKey]="badge.labelKey"
                  />
                  @switch (action(need)) {
                    @case ('record') {
                      <app-button
                        size="sm"
                        variant="ghost"
                        (click)="router.navigate(['/training/records', need.record_id])"
                      >
                        {{ 'training.home.viewRecord' | transloco }}
                      </app-button>
                    }
                    @case ('start') {
                      <app-button
                        size="sm"
                        (click)="router.navigate(['/training/courses', need.course.id, 'learn'])"
                      >
                        {{ 'training.home.start' | transloco }}
                      </app-button>
                    }
                    @case ('retake') {
                      <app-button
                        size="sm"
                        variant="secondary"
                        (click)="router.navigate(['/training/courses', need.course.id, 'learn'])"
                      >
                        {{ 'training.home.retake' | transloco }}
                      </app-button>
                    }
                  }
                </li>
              }
            </ul>
          }
          <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-ui">
            <a routerLink="/training/assignments" class="font-semibold text-accent hover:underline">
              {{ 'training.home.allAssignments' | transloco }}
            </a>
            <a routerLink="/training/records" class="font-semibold text-accent hover:underline">
              {{ 'training.home.myCertificates' | transloco }}
            </a>
            @if (userId(); as uid) {
              <a
                [routerLink]="['/training/people', uid]"
                class="font-semibold text-accent hover:underline"
              >
                {{ 'training.home.myProfile' | transloco }}
              </a>
            }
          </div>
        </section>

        <aside
          class="flex min-w-0 flex-col gap-4"
          [attr.aria-label]="'training.home.aside' | transloco"
        >
          @if (access.canOversee() && stats(); as s) {
            <app-card>
              <h2 class="mb-3 text-card font-semibold text-fg">
                {{ 'training.home.followUpTitle' | transloco }}
              </h2>
              <ul class="flex flex-col gap-2 text-ui" data-testid="training-follow-up">
                <li>
                  <a
                    routerLink="/training/assignments"
                    [queryParams]="{ overdue: true }"
                    class="flex items-center justify-between gap-2 rounded-tile px-2 py-1.5 hover:bg-surface-2"
                  >
                    <span class="text-fg">{{ 'training.home.followOverdue' | transloco }}</span>
                    <span
                      class="font-semibold"
                      [class.text-warn-ink]="s.assignments_overdue"
                      [class.text-fg-muted]="!s.assignments_overdue"
                      >{{ s.assignments_overdue | localNumber }}</span
                    >
                  </a>
                </li>
                <li>
                  <a
                    routerLink="/training/plan"
                    class="flex items-center justify-between gap-2 rounded-tile px-2 py-1.5 hover:bg-surface-2"
                  >
                    <span class="text-fg">{{ 'training.home.followExpiring' | transloco }}</span>
                    <span
                      class="font-semibold"
                      [class.text-warn-ink]="s.expiring_30_days"
                      [class.text-fg-muted]="!s.expiring_30_days"
                      >{{ s.expiring_30_days | localNumber }}</span
                    >
                  </a>
                </li>
                <li>
                  <a
                    routerLink="/training/records"
                    [queryParams]="{ evidence: 'missing' }"
                    class="flex items-center justify-between gap-2 rounded-tile px-2 py-1.5 hover:bg-surface-2"
                  >
                    <span class="text-fg">{{ 'training.home.followEvidence' | transloco }}</span>
                    <app-icon name="arrow" [size]="14" class="text-fg-subtle" />
                  </a>
                </li>
                <li>
                  <a
                    routerLink="/training/matrix"
                    class="flex items-center justify-between gap-2 rounded-tile px-2 py-1.5 hover:bg-surface-2"
                  >
                    <span class="text-fg">{{ 'training.home.followMatrix' | transloco }}</span>
                    <app-icon name="arrow" [size]="14" class="text-fg-subtle" />
                  </a>
                </li>
              </ul>
            </app-card>
          }
          <app-card>
            <h2 class="mb-1 text-card font-semibold text-fg">
              {{ 'training.home.learnTitle' | transloco }}
            </h2>
            <p class="mb-2 text-ui text-fg-muted">{{ 'training.home.learnBody' | transloco }}</p>
            <a routerLink="/learning" class="text-ui font-semibold text-accent hover:underline">
              {{ 'training.home.learnLink' | transloco }}
            </a>
          </app-card>
        </aside>
      </div>

      @if (access.canOversee() && stats(); as s) {
        <section class="mt-8" aria-labelledby="training-stats-heading">
          <h2 id="training-stats-heading" class="mb-3 font-display text-section font-bold text-fg">
            {{ 'training.stats.label' | transloco }}
          </h2>
          <app-kpi-band
            scope="training.home"
            class="[&_app-kpi-tile>*]:h-full"
            data-testid="training-stats"
            [appTourStep]="'training-stats'"
          >
            <app-kpi-tile
              link="/training/matrix"
              [title]="'training.stats.completionRateHelp' | transloco"
              [label]="'training.stats.completionRate' | transloco"
              [value]="'training.stats.pct' | transloco: { value: s.completion_rate }"
              [delta]="
                s.required !== undefined
                  ? ('training.stats.completionOf'
                    | transloco: { compliant: s.compliant ?? 0, required: s.required })
                  : ''
              "
              [tone]="s.completion_rate >= 90 ? 'pass' : 'warn'"
            />
            <app-kpi-tile
              link="/training/assignments"
              [queryParams]="{ status: 'open' }"
              [label]="'training.stats.open' | transloco"
              [value]="s.assignments_open | localNumber"
              tone="info"
            />
            <app-kpi-tile
              link="/training/assignments"
              [queryParams]="{ overdue: 'true' }"
              [label]="'training.stats.overdue' | transloco"
              [value]="s.assignments_overdue | localNumber"
              [tone]="s.assignments_overdue ? 'warn' : 'neutral'"
            />
            <app-kpi-tile
              link="/training/records"
              [queryParams]="{ validity: 'expiring' }"
              [label]="'training.stats.expiring' | transloco"
              [value]="s.expiring_30_days | localNumber"
              [tone]="s.expiring_30_days ? 'warn' : 'neutral'"
            />
            <app-kpi-tile
              link="/training/records"
              [queryParams]="{ validity: 'expired' }"
              [label]="'training.stats.expired' | transloco"
              [value]="s.expired | localNumber"
              [tone]="s.expired ? 'fail' : 'neutral'"
            />
            <app-kpi-tile
              link="/training/courses"
              [queryParams]="{ status: 'published' }"
              [label]="'training.stats.published' | transloco"
              [value]="s.courses_published | localNumber"
            />
          </app-kpi-band>
          <p class="mt-2 text-meta text-fg-muted" data-testid="completion-formula">
            {{ 'training.stats.completionRateHelp' | transloco }}
          </p>
          <p class="mt-1 text-meta text-fg-muted">
            {{
              'training.stats.effectiveness'
                | transloco
                  : {
                      effective: s.effectiveness.effective,
                      partial: s.effectiveness.partially_effective,
                      not: s.effectiveness.not_effective,
                      pending: s.effectiveness.not_evaluated,
                    }
            }}
            @if (s.average_feedback !== null) {
              ·
              {{
                'training.stats.feedback'
                  | transloco: { rating: (s.average_feedback | localNumber: '1.1-1') }
              }}
            }
          </p>
        </section>
      }

      <div class="mt-8">
        <app-why-it-matters scope="training" page="home" />
      </div>
    </div>
  `,
})
export class TrainingHome {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  protected readonly access = inject(TrainingAccess);
  protected readonly router = inject(Router);

  protected readonly needs = signal<readonly NeedItem[]>([]);
  protected readonly stats = signal<TrainingStats | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly userId = signal<string | null>(null);
  protected readonly badgeOf = cellBadge;
  protected readonly action = needAction;

  private subs = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      view: 'dashboard',
      title: null,
    }));
    inject(DestroyRef).onDestroy(() => this.subs.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const oversee = this.access.canOversee();
      untracked(() => this.load(orgId, oversee));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.access.canOversee());
  }

  private load(orgId: string | null, oversee: boolean): void {
    this.subs.unsubscribe();
    this.subs = new Subscription();
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    this.failed.set(false);
    this.subs.add(
      this.api.needs(orgId).subscribe({
        next: (res: Needs) => {
          this.needs.set(sortNeeds(res.items));
          this.userId.set(res.user?.id ?? null);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      }),
    );
    if (oversee) {
      this.subs.add(
        this.api.stats(orgId).subscribe({
          next: (s) => this.stats.set(s),
          error: () => this.stats.set(null),
        }),
      );
    }
  }
}
