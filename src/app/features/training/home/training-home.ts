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
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, TrainingAccess, cellTone } from '../data/training-display';
import { NeedItem, Needs, TrainingStats } from '../data/training.models';
import { TrainingNav } from '../training-nav';

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

/**
 * `/training`: the learner's own training (needs analysis from the assignment
 * rules, open assignments, certificates) and, for people who oversee training,
 * the programme statistics.
 */
@Component({
  selector: 'app-training-home',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Badge,
    Button,
    Card,
    Icon,
    KpiTile,
    GuideIntro,
    WhyItMatters,
    LessonView,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    TrainingNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-nav />
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'training.home.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">
            {{ 'training.home.subtitle' | transloco }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-tour-button scope="training" tour="home" />
          <a routerLink="/training/courses" [appTourStep]="'training-courses'">
            <app-button variant="secondary" size="sm">
              <app-icon name="training" [size]="15" />
              {{ 'training.home.browse' | transloco }}
            </app-button>
          </a>
        </div>
      </div>

      <div class="mb-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <app-guide-intro scope="training" page="home" />
        <app-why-it-matters scope="training" page="home" />
      </div>

      @if (access.canOversee() && stats(); as s) {
        <section class="mb-6" [attr.aria-label]="'training.stats.label' | transloco">
          <div
            class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
            data-testid="training-stats"
            [appTourStep]="'training-stats'"
          >
            <app-kpi-tile
              [label]="'training.stats.published' | transloco"
              [value]="s.courses_published | localNumber"
            />
            <app-kpi-tile
              [label]="'training.stats.open' | transloco"
              [value]="s.assignments_open | localNumber"
              tone="info"
            />
            <app-kpi-tile
              [label]="'training.stats.overdue' | transloco"
              [value]="s.assignments_overdue | localNumber"
              [tone]="s.assignments_overdue ? 'fail' : 'neutral'"
            />
            <app-kpi-tile
              [label]="'training.stats.completionRate' | transloco"
              [value]="'training.stats.pct' | transloco: { value: s.completion_rate }"
              [tone]="s.completion_rate >= 90 ? 'pass' : s.completion_rate >= 70 ? 'warn' : 'fail'"
            />
            <app-kpi-tile
              [label]="'training.stats.expiring' | transloco"
              [value]="s.expiring_30_days | localNumber"
              [tone]="s.expiring_30_days ? 'warn' : 'neutral'"
            />
            <app-kpi-tile
              [label]="'training.stats.expired' | transloco"
              [value]="s.expired | localNumber"
              [tone]="s.expired ? 'fail' : 'neutral'"
            />
          </div>
          <p class="mt-2 text-[12.5px] text-fg-muted">
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

      <div class="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section [attr.aria-labelledby]="'training-needs-heading'">
          <h2
            id="training-needs-heading"
            class="mb-3 font-display text-[17px] font-bold tracking-[-0.02em] text-fg"
          >
            {{ 'training.home.needsTitle' | transloco }}
          </h2>
          @if (loading()) {
            <p class="text-[13.5px] text-fg-muted" role="status">
              {{ 'training.common.loading' | transloco }}
            </p>
          } @else if (failed()) {
            <p class="text-[13.5px] text-fail" role="alert">
              {{ 'training.errors.loadFailed' | transloco }}
            </p>
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
                <li
                  class="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3"
                >
                  <div class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/training/courses', need.course.id]"
                      class="text-[14px] font-semibold text-fg hover:text-accent"
                    >
                      <span class="font-mono text-[12px] text-fg-muted">{{
                        need.course.code
                      }}</span>
                      {{ need.course.title }}
                    </a>
                    <p class="mt-0.5 text-[12.5px] text-fg-muted">
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
                      } @else if (need.due_at) {
                        {{ 'training.home.dueOn' | transloco: { date: (need.due_at | localDay) } }}
                      } @else if (need.status === 'expired' && need.expires_at) {
                        {{
                          'training.home.expiredOn'
                            | transloco: { date: (need.expires_at | localDay) }
                        }}
                      }
                    </p>
                  </div>
                  <app-badge [tone]="tone(need.status)">
                    {{ 'training.cell.' + need.status | transloco }}
                  </app-badge>
                  @if (need.status === 'compliant' && need.record_id) {
                    <a [routerLink]="['/training/records', need.record_id]">
                      <app-button size="sm" variant="ghost">
                        {{ 'training.home.viewRecord' | transloco }}
                      </app-button>
                    </a>
                  } @else if (need.course.kind !== 'external') {
                    <a [routerLink]="['/training/courses', need.course.id, 'learn']">
                      <app-button size="sm">
                        {{
                          (need.status === 'assigned' || need.status === 'overdue'
                            ? 'training.home.start'
                            : 'training.home.retake'
                          ) | transloco
                        }}
                      </app-button>
                    </a>
                  }
                </li>
              }
            </ul>
          }
          <div class="mt-4 flex flex-wrap gap-2">
            <a routerLink="/training/assignments">
              <app-button variant="ghost" size="sm">
                {{ 'training.home.allAssignments' | transloco }}
              </app-button>
            </a>
            <a routerLink="/training/records">
              <app-button variant="ghost" size="sm">
                {{ 'training.home.myCertificates' | transloco }}
              </app-button>
            </a>
          </div>
        </section>

        <aside class="flex flex-col gap-4">
          <app-card>
            <h2 class="mb-2 text-[14px] font-semibold text-fg">
              {{ 'training.home.lessonTitle' | transloco }}
            </h2>
            @if (lessonOpen()) {
              <app-lesson scope="training" lesson="competence-and-awareness" />
            } @else {
              <p class="mb-3 text-[13px] text-fg-muted">
                {{ 'training.home.lessonBody' | transloco }}
              </p>
              <app-button size="sm" variant="secondary" (click)="lessonOpen.set(true)">
                {{ 'training.home.lessonStart' | transloco }}
              </app-button>
            }
          </app-card>
        </aside>
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
  protected readonly lessonOpen = signal(false);

  private subs = new Subscription();

  constructor() {
    providePageContext(() => ({ module: TRAINING_MODULE, view: 'dashboard' }));
    inject(DestroyRef).onDestroy(() => this.subs.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const oversee = this.access.canOversee();
      untracked(() => this.load(orgId, oversee));
    });
  }

  protected tone(status: string) {
    return cellTone(status);
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
