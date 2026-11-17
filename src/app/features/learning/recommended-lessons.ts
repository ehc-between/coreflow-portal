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
import { Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Icon } from '../../shared/ui/icon/icon';
import { HomeApi } from '../dashboard/data/home-api';
import { Journey } from '../dashboard/data/home.models';

/** Lessons shown at most. */
export const MAX_RECOMMENDED = 4;

/** One recommended lesson: the step it helps with and the journey it comes from. */
export interface Recommendation {
  readonly scope: string;
  readonly key: string;
  readonly url: string;
  readonly step: string;
  readonly journey: string;
}

/**
 * The lessons of the next open steps of the org's active journeys, in journey order,
 * without duplicates (the same lesson can help several steps).
 */
export function recommendations(
  journeys: readonly Journey[],
  max = MAX_RECOMMENDED,
): Recommendation[] {
  const out: Recommendation[] = [];
  const seen = new Set<string>();
  for (const journey of journeys) {
    if (journey.status !== 'active') {
      continue;
    }
    for (const phase of journey.phases) {
      for (const step of phase.steps) {
        const lesson = step.lesson;
        if (step.status !== 'todo' || !lesson || seen.has(`${lesson.scope}.${lesson.key}`)) {
          continue;
        }
        seen.add(`${lesson.scope}.${lesson.key}`);
        out.push({
          scope: lesson.scope,
          key: lesson.key,
          url: lesson.url,
          step: step.title,
          journey: journey.title,
        });
        if (out.length >= max) {
          return out;
        }
      }
    }
  }
  return out;
}

/**
 * "Anbefalt for deg" in the learning centre: the lessons for the next steps of the
 * organisation's guided journeys. Hidden when there is no active journey, when the
 * standards module is off or when the user cannot read standards.
 */
@Component({
  selector: 'app-recommended-lessons',
  imports: [RouterLink, TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('home')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (items().length) {
      <section aria-labelledby="recommended-title" data-testid="learning-recommended">
        <h2 id="recommended-title" class="font-display text-section font-bold text-fg">
          {{ 'home.recommended.title' | transloco }}
        </h2>
        <p class="mt-0.5 mb-3 text-ui text-fg-muted">
          {{ 'home.recommended.subtitle' | transloco }}
        </p>
        <ul class="grid gap-3 sm:grid-cols-2">
          @for (item of items(); track item.scope + item.key) {
            <li>
              <a
                [routerLink]="item.url"
                class="flex h-full items-start gap-3 rounded-tile border border-border bg-surface p-4 hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                data-testid="recommended-lesson"
              >
                <span
                  class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-soft text-accent"
                  aria-hidden="true"
                >
                  <app-icon name="book" [size]="15" />
                </span>
                <span class="min-w-0">
                  <span class="block text-ui font-semibold text-accent">{{ item.title }}</span>
                  <span class="mt-0.5 block text-meta text-fg-muted">{{ item.step }}</span>
                  <span class="mt-0.5 block text-meta text-fg-subtle">
                    {{ 'home.recommended.from' | transloco: { journey: item.journey } }}
                  </span>
                </span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class RecommendedLessons {
  private readonly api = inject(HomeApi);
  private readonly content = inject(GuidanceContentService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly modules = inject(ModuleService);

  private readonly found = signal<readonly Recommendation[]>([]);

  private readonly canRead = computed(
    () =>
      (this.selectedOrg.currentOrg()?.permissions ?? []).includes('standards:read') &&
      this.modules.isEnabled('standards'),
  );

  /** With the lesson's own title once its guidance file has loaded. */
  protected readonly items = computed(() =>
    this.found().map((r) => ({
      ...r,
      title: this.content.readLesson(r.scope, r.key)?.title ?? r.step,
    })),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const lang = this.language.active();
      const allowed = this.canRead();
      untracked(() => this.load(orgId, lang, allowed));
    });
  }

  private load(orgId: string | null, lang: string, allowed: boolean): void {
    this.request.unsubscribe();
    this.found.set([]);
    if (!orgId || !allowed) {
      return;
    }
    this.request = this.api
      .journeys(orgId, lang)
      .pipe(
        switchMap((list) => {
          const active = list.items.filter((j) => j.status === 'active');
          return active.length
            ? forkJoin(active.map((j) => this.api.journey(orgId, j.id, lang)))
            : of([]);
        }),
        map((journeys) => recommendations(journeys)),
        catchError(() => of([])),
      )
      .subscribe((found) => this.found.set(found));
  }
}
