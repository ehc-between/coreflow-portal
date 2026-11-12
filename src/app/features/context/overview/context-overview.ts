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
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachMe } from '../../../shared/guidance/teach-me';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContextApi } from '../data/context-api';
import { ContextKind, ContextOverview } from '../data/context.models';
import { KINDS, KIND_ORDER } from '../context-kinds';
import { ContextLessonButton } from '../ui/context-lesson-button';
import { ContextNav } from '../ui/context-nav';
import { GapChip } from '../ui/gap-chip';
import { injectContextPermissions } from '../context-permissions';

/** Overview counts key per kind. */
const COUNT_KEY: Readonly<Record<ContextKind, keyof ContextOverview>> = {
  analysis: 'analyses',
  party: 'interested_parties',
  scope: 'scope_statements',
  policy: 'policies',
  responsibility: 'responsibilities',
};

export interface RegisterTile {
  readonly kind: ContextKind;
  readonly path: string;
  readonly total: number;
  /** Approved (controlled) or active (registers) records. */
  readonly settled: number;
  readonly inReview: number;
  readonly drafts: number;
}

/** One tile per register from the overview counts. */
export function registerTiles(overview: ContextOverview | null): RegisterTile[] {
  return KIND_ORDER.map((kind) => {
    const counts = (overview?.[COUNT_KEY[kind]] ?? {}) as Readonly<Record<string, number>>;
    const controlled = KINDS[kind].controlled;
    return {
      kind,
      path: `/context/${KINDS[kind].segment}`,
      total: counts['total'] ?? 0,
      settled: (controlled ? counts['approved'] : counts['active']) ?? 0,
      inReview: counts['in_review'] ?? 0,
      drafts: counts['draft'] ?? 0,
    };
  });
}

/**
 * `/context`: the module's landing page. Counts per register, the gaps that
 * matter for certification (management systems without an approved scope, policy
 * kinds missing, overdue reviews, records waiting for approval), and the
 * learning-mode introduction to "context" as the foundation of every standard.
 */
@Component({
  selector: 'app-context-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    GuideIntro,
    TeachMe,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    Alert,
    Badge,
    Card,
    Icon,
    ContextLessonButton,
    ContextNav,
    GapChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'context.overview.title' | transloco }}
          </h1>
          <p class="mt-1 max-w-[680px] text-[14px] text-fg-muted">
            {{ 'context.overview.subtitle' | transloco }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-tour-button scope="context" tour="overview" />
          <app-ask-about [prompt]="'context.overview.askPrompt' | transloco" />
        </div>
      </header>
      <app-context-nav />

      <div class="mt-5 flex flex-col gap-4">
        <app-guide-intro scope="context" page="overview" />

        @if (error()) {
          <app-alert tone="error">{{ 'context.overview.loadError' | transloco }}</app-alert>
        }

        <section
          [attr.aria-label]="'context.overview.registers' | transloco"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
          appTourStep="context-registers"
        >
          @for (tile of tiles(); track tile.kind) {
            <a
              [routerLink]="tile.path"
              class="group rounded-card outline-none focus-visible:ring-2 focus-visible:ring-accent"
              [attr.data-testid]="'tile-' + tile.kind"
            >
              <app-card>
                <div class="flex items-start justify-between gap-2">
                  <span class="text-[13px] font-semibold text-fg-muted group-hover:text-fg">
                    {{ 'context.kinds.' + tile.kind + '.plural' | transloco }}
                  </span>
                  <app-icon name="chevron" [size]="14" class="text-fg-subtle" />
                </div>
                <div class="mt-1 font-display text-[28px] font-bold text-fg">
                  {{ loading() ? '–' : tile.total }}
                </div>
                <p class="text-[12px] text-fg-muted">
                  @if (controlled(tile.kind)) {
                    {{
                      'context.overview.controlledCounts'
                        | transloco
                          : { approved: tile.settled, review: tile.inReview, draft: tile.drafts }
                    }}
                  } @else {
                    {{ 'context.overview.activeCount' | transloco: { count: tile.settled } }}
                  }
                </p>
              </app-card>
            </a>
          }
        </section>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <app-card>
            <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
              {{ 'context.overview.gapsTitle' | transloco }}
            </h2>
            @if (loading()) {
              <p class="text-[13px] text-fg-muted">{{ 'context.common.loading' | transloco }}</p>
            } @else if (overview(); as o) {
              <ul class="flex flex-col gap-3" appTourStep="context-gaps">
                <li>
                  <p class="text-[13px] font-semibold text-fg">
                    {{ 'context.overview.missingScopes' | transloco }}
                  </p>
                  @if (o.frameworks_without_scope.length) {
                    <div class="mt-1.5 flex flex-wrap gap-1.5">
                      @for (fw of o.frameworks_without_scope; track fw) {
                        <app-context-gap-chip
                          [label]="'context.frameworks.' + fw | transloco"
                          [link]="perms.canWrite() ? '/context/scopes/new' : null"
                          [queryParams]="{ framework: fw }"
                          [ariaLabel]="
                            'context.overview.addScopeFor'
                              | transloco: { framework: ('context.frameworks.' + fw | transloco) }
                          "
                        />
                      }
                    </div>
                  } @else {
                    <p class="mt-1 text-[12.5px] text-pass">
                      {{ 'context.overview.allScoped' | transloco }}
                    </p>
                  }
                </li>
                <li>
                  <p class="text-[13px] font-semibold text-fg">
                    {{ 'context.overview.missingPolicies' | transloco }}
                  </p>
                  @if (o.policy_kinds_missing.length) {
                    <div class="mt-1.5 flex flex-wrap gap-1.5">
                      @for (kind of o.policy_kinds_missing; track kind) {
                        <app-context-gap-chip
                          [label]="'context.policyKinds.' + kind | transloco"
                          [link]="perms.canWrite() ? '/context/policies/new' : null"
                          [queryParams]="{ kind }"
                        />
                      }
                    </div>
                  } @else {
                    <p class="mt-1 text-[12.5px] text-pass">
                      {{ 'context.overview.allPolicies' | transloco }}
                    </p>
                  }
                </li>
                <li class="flex flex-wrap items-center gap-2">
                  <app-badge [tone]="o.reviews_overdue ? 'fail' : 'pass'">
                    {{
                      'context.overview.reviewsOverdue' | transloco: { count: o.reviews_overdue }
                    }}
                  </app-badge>
                  <app-badge [tone]="o.in_review ? 'info' : 'neutral'">
                    {{ 'context.overview.inReview' | transloco: { count: o.in_review } }}
                  </app-badge>
                </li>
              </ul>
            }
          </app-card>

          <aside class="flex flex-col gap-4">
            <app-why-it-matters scope="context" page="overview" />
            <app-card>
              <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                {{ 'context.overview.learnTitle' | transloco }}
              </h2>
              <div class="flex flex-col items-start gap-2">
                <app-context-lesson-button lessonKey="context-foundation" />
                <app-context-lesson-button lessonKey="interested-parties" />
                <app-context-lesson-button lessonKey="policies-and-raci" />
                <app-teach-me
                  topic="hs:4.1"
                  [subject]="'context.overview.teachSubject' | transloco"
                />
              </div>
            </app-card>
            <a
              routerLink="/context/responsibilities/matrix"
              class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
            >
              <app-icon name="people" [size]="14" />
              {{ 'context.overview.openMatrix' | transloco }}
            </a>
          </aside>
        </div>
      </div>
    </div>
  `,
})
export class ContextOverviewPage {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly perms = injectContextPermissions();
  protected readonly overview = signal<ContextOverview | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly tiles = computed(() => registerTiles(this.overview()));

  private request = new Subscription();

  constructor() {
    providePageContext(() => ({ module: 'context', view: 'dashboard' }));
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected controlled(kind: ContextKind): boolean {
    return KINDS[kind].controlled;
  }

  private load(orgId: string | null): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    this.request = this.api.overview(orgId).subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
