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
import { Params, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { pluralKey } from '../../../shared/i18n/plural';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ContextApi } from '../data/context-api';
import {
  ContextKind,
  ContextOverview,
  SETUP_STEP_KEYS,
  SetupStep,
  SetupStepKey,
} from '../data/context.models';
import { KINDS, KIND_ORDER, kindOfEntityType } from '../context-kinds';
import { CONTEXT_NAV } from '../context-nav';
import { injectContextPermissions } from '../context-permissions';

/** Overview counts key per kind. */
const COUNT_KEY: Readonly<Record<ContextKind, keyof ContextOverview>> = {
  analysis: 'analyses',
  party: 'interested_parties',
  scope: 'scope_statements',
  policy: 'policies',
  responsibility: 'responsibilities',
};

/** One count shown under a tile ("1 godkjent · 2 utkast"); zero parts are left out. */
export interface TilePart {
  readonly key: string;
  readonly count: number;
}

export interface RegisterTile {
  readonly kind: ContextKind;
  readonly path: string;
  readonly total: number;
  /** Approved (controlled) or active (registers) records. */
  readonly settled: number;
  readonly inReview: number;
  readonly drafts: number;
  /** The non-zero parts of the breakdown, in reading order. */
  readonly parts: readonly TilePart[];
}

/** One tile per register from the overview counts. */
export function registerTiles(overview: ContextOverview | null): RegisterTile[] {
  return KIND_ORDER.map((kind) => {
    const counts = (overview?.[COUNT_KEY[kind]] ?? {}) as Readonly<Record<string, number>>;
    const controlled = KINDS[kind].controlled;
    const settled = (controlled ? counts['approved'] : counts['active']) ?? 0;
    const inReview = counts['in_review'] ?? 0;
    const drafts = counts['draft'] ?? 0;
    const parts: TilePart[] = controlled
      ? [
          { key: pluralKey('context.overview.parts.approved', settled), count: settled },
          { key: 'context.overview.parts.inReview', count: inReview },
          { key: 'context.overview.parts.draft', count: drafts },
        ]
      : [{ key: pluralKey('context.overview.parts.active', settled), count: settled }];
    return {
      kind,
      path: `/context/${KINDS[kind].segment}`,
      total: counts['total'] ?? 0,
      settled,
      inReview,
      drafts,
      parts: parts.filter((p) => p.count > 0),
    };
  });
}

/** A "get started" step as shown: number, label, whether it is done, where it leads. */
export interface SetupStepView {
  readonly key: SetupStepKey;
  readonly kind: ContextKind;
  readonly number: number;
  readonly done: boolean;
  readonly count: number;
}

/**
 * The beginner's order (context analysis, interested parties, scope, policy,
 * roles and responsibilities). Uses the backend's `setup_steps` when present,
 * else derives "done" from the register totals.
 */
export function setupSteps(overview: ContextOverview | null): SetupStepView[] {
  const fromApi = new Map<string, SetupStep>(
    (overview?.setup_steps ?? []).map((step) => [step.key, step]),
  );
  return SETUP_STEP_KEYS.map((key, index) => {
    const kind = kindOfEntityType(key) ?? 'analysis';
    const step = fromApi.get(key);
    const total =
      ((overview?.[COUNT_KEY[kind]] ?? {}) as Readonly<Record<string, number>>)['total'] ?? 0;
    const count = step?.count ?? total;
    return { key, kind, number: index + 1, done: step?.done ?? total > 0, count };
  });
}

/** One row of "Dette trenger oppmerksomhet". */
export interface AttentionItem {
  readonly key: string;
  readonly count: number;
  readonly link: string;
  readonly query: Params | null;
}

/** The gaps worth acting on, each with the filtered list (or page) that shows them. */
export function attentionItems(overview: ContextOverview | null): AttentionItem[] {
  if (!overview) {
    return [];
  }
  const raci = '/context/responsibilities/matrix';
  const rows: AttentionItem[] = [
    {
      key: 'partiesNotAddressed',
      count: overview.parties_not_addressed ?? 0,
      link: '/context/interested-parties',
      query: { addressed_status: 'not_addressed' },
    },
    {
      key: 'withoutAccountable',
      count: overview.responsibilities_without_accountable ?? 0,
      link: raci,
      query: null,
    },
    {
      key: 'withoutResponsible',
      count: overview.responsibilities_without_responsible ?? 0,
      link: raci,
      query: null,
    },
    {
      key: 'segregation',
      count: overview.responsibilities_segregation ?? 0,
      link: raci,
      query: null,
    },
    {
      key: 'analysesWithoutFollowUp',
      count: overview.analyses_without_follow_up ?? 0,
      link: '/context/analyses',
      query: null,
    },
    {
      key: 'policiesNotCommunicated',
      count: overview.policies_not_communicated ?? 0,
      link: '/context/policies',
      query: { status: 'approved' },
    },
    {
      key: 'policiesWithoutObjectives',
      count: overview.policies_without_objectives ?? 0,
      link: '/context/policies',
      query: { status: 'approved' },
    },
    {
      key: 'reviewsOverdue',
      count: overview.reviews_overdue ?? 0,
      link: '/my-work',
      query: null,
    },
    { key: 'inReview', count: overview.in_review ?? 0, link: '/my-work', query: { tab: 'review' } },
  ];
  return rows.filter((row) => row.count > 0);
}

/** Save a downloaded file under `name` (object URL + temporary link). */
export function saveBlob(blob: Blob, name: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  doc.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * `/context`: the module's landing page. A numbered "get started" checklist
 * for beginners (hidden when everything exists), one tile per register, the gaps
 * that matter for certification ("Dette trenger oppmerksomhet", each linked to
 * the filtered list that shows them), the RACI matrix and the evidence pack for
 * the certification body.
 */
@Component({
  selector: 'app-context-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    TourStepDirective,
    WhyItMatters,
    Button,
    Card,
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
        titleKey="modules.names.context"
        descriptionKey="context.overview.subtitle"
      />
      <app-module-nav [items]="nav" labelKey="modules.names.context" />
      <app-help-strip scope="context" page="overview" tour="overview" lesson="context-foundation" />

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (loading()) {
        <app-loading-state [rows]="4" />
      } @else {
        <div class="flex flex-col gap-6">
          @if (!setupDone()) {
            <app-card>
              <section aria-labelledby="ctx-setup-title" data-testid="context-setup">
                <h2 id="ctx-setup-title" class="font-display text-card font-bold text-fg">
                  {{ 'context.overview.setup.title' | transloco }}
                </h2>
                <p class="mt-1 text-ui text-fg-muted">
                  {{ 'context.overview.setup.intro' | transloco }}
                </p>
                @if (showInterview()) {
                  <div
                    class="mt-3 flex flex-wrap items-center gap-3 rounded-tile bg-accent-soft p-3"
                    data-testid="context-interview-cta"
                  >
                    <p class="min-w-0 flex-1 text-ui text-fg">
                      {{ 'context.interview.cta' | transloco }}
                    </p>
                    <a
                      routerLink="/context/interview"
                      class="inline-flex min-h-9 items-center rounded-tile bg-accent px-3 text-ui font-semibold text-white outline-none hover:bg-accent-2 focus-visible:ring-2 focus-visible:ring-accent"
                      >{{ 'context.interview.start' | transloco }}</a
                    >
                  </div>
                }
                <ol class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  @for (step of steps(); track step.key) {
                    <li>
                      <a
                        [routerLink]="stepLink(step)"
                        class="flex h-full items-start gap-2.5 rounded-tile border border-border p-3 outline-none hover:border-accent hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent"
                        [attr.data-testid]="'setup-step-' + step.key"
                      >
                        <span
                          class="flex h-6 w-6 flex-none items-center justify-center rounded-full text-meta font-bold"
                          [class]="
                            step.done ? 'bg-pass-soft text-pass-ink' : 'bg-accent-soft text-accent'
                          "
                          aria-hidden="true"
                        >
                          @if (step.done) {
                            <app-icon name="check" [size]="13" />
                          } @else {
                            {{ step.number }}
                          }
                        </span>
                        <span class="min-w-0">
                          <span class="block text-ui font-semibold text-fg">
                            {{ 'context.overview.setup.steps.' + step.key | transloco }}
                          </span>
                          <span class="block text-meta text-fg-muted">
                            @if (step.done) {
                              <span class="sr-only">{{
                                'context.overview.setup.doneSr' | transloco
                              }}</span>
                              {{
                                'context.overview.setup.count' | transloco: { count: step.count }
                              }}
                            } @else {
                              {{ 'context.overview.setup.todo.' + step.key | transloco }}
                            }
                          </span>
                        </span>
                      </a>
                    </li>
                  }
                </ol>
              </section>
            </app-card>
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
                    <span class="text-ui font-semibold text-fg-muted group-hover:text-fg">
                      {{ 'context.kinds.' + tile.kind + '.plural' | transloco }}
                    </span>
                    <app-icon name="chevron" [size]="14" class="-rotate-90 text-fg-subtle" />
                  </div>
                  <div class="mt-1 font-display text-page font-bold text-fg">{{ tile.total }}</div>
                  <p class="text-meta text-fg-muted">
                    @for (part of tile.parts; track part.key; let last = $last) {
                      <span class="whitespace-nowrap">{{
                        part.key | transloco: { count: part.count }
                      }}</span>
                      @if (!last) {
                        <span aria-hidden="true"> · </span>
                      }
                    } @empty {
                      {{ 'context.overview.parts.none' | transloco }}
                    }
                  </p>
                </app-card>
              </a>
            }
          </section>

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <app-card>
              <section aria-labelledby="ctx-gaps-title" appTourStep="context-gaps">
                <h2 id="ctx-gaps-title" class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'context.overview.gapsTitle' | transloco }}
                </h2>
                @if (overview(); as o) {
                  <ul class="flex flex-col divide-y divide-border">
                    <li class="pb-3">
                      <p class="text-ui font-semibold text-fg">
                        {{ 'context.overview.missingScopes' | transloco }}
                      </p>
                      @if (o.frameworks_without_scope.length) {
                        <div class="mt-1.5 flex flex-wrap gap-1.5">
                          @for (fw of o.frameworks_without_scope; track fw) {
                            @if (perms.canWrite()) {
                              <a
                                routerLink="/context/scopes/new"
                                [queryParams]="{ framework: fw }"
                                class="inline-flex min-h-7 items-center gap-1 rounded-full border border-border px-2.5 text-meta font-semibold text-accent outline-none hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent"
                                [attr.aria-label]="
                                  'context.overview.addScopeFor'
                                    | transloco
                                      : { framework: ('context.frameworks.' + fw | transloco) }
                                "
                              >
                                <app-icon name="plus" [size]="12" />
                                {{ 'context.frameworks.' + fw | transloco }}
                              </a>
                            } @else {
                              <span
                                class="inline-flex min-h-7 items-center rounded-full border border-border px-2.5 text-meta font-semibold text-fg-muted"
                                >{{ 'context.frameworks.' + fw | transloco }}</span
                              >
                            }
                          }
                        </div>
                      } @else {
                        <p class="mt-1 text-meta text-pass-ink">
                          {{ 'context.overview.allScoped' | transloco }}
                        </p>
                      }
                    </li>
                    <li class="py-3">
                      <p class="text-ui font-semibold text-fg">
                        {{ 'context.overview.missingPolicies' | transloco }}
                      </p>
                      @if (o.policy_kinds_missing.length) {
                        <div class="mt-1.5 flex flex-wrap gap-1.5">
                          @for (kind of o.policy_kinds_missing; track kind) {
                            @if (perms.canWrite()) {
                              <a
                                routerLink="/context/policies/new"
                                [queryParams]="{ kind }"
                                class="inline-flex min-h-7 items-center gap-1 rounded-full border border-border px-2.5 text-meta font-semibold text-accent outline-none hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent"
                              >
                                <app-icon name="plus" [size]="12" />
                                {{ 'context.policyKinds.' + kind | transloco }}
                              </a>
                            } @else {
                              <span
                                class="inline-flex min-h-7 items-center rounded-full border border-border px-2.5 text-meta font-semibold text-fg-muted"
                                >{{ 'context.policyKinds.' + kind | transloco }}</span
                              >
                            }
                          }
                        </div>
                      } @else {
                        <p class="mt-1 text-meta text-pass-ink">
                          {{ 'context.overview.allPolicies' | transloco }}
                        </p>
                      }
                    </li>
                    @for (item of attention(); track item.key) {
                      <li class="py-2.5 last:pb-0">
                        <a
                          [routerLink]="item.link"
                          [queryParams]="item.query"
                          class="group flex items-center gap-2.5 rounded-tile outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          [attr.data-testid]="'attention-' + item.key"
                        >
                          <span
                            class="flex h-6 min-w-6 flex-none items-center justify-center rounded-full bg-warn-soft px-1.5 text-meta font-bold text-warn-ink"
                            >{{ item.count }}</span
                          >
                          <span class="min-w-0 flex-1 text-ui text-fg group-hover:underline">
                            {{
                              'context.overview.attention.' + item.key
                                | transloco: { count: item.count }
                            }}
                          </span>
                          <app-icon name="chevron" [size]="14" class="-rotate-90 text-fg-subtle" />
                        </a>
                      </li>
                    }
                    @if (attention().length === 0) {
                      <li class="pt-3 text-meta text-pass-ink">
                        {{ 'context.overview.attention.none' | transloco }}
                      </li>
                    }
                  </ul>
                }
              </section>
            </app-card>

            <aside
              class="flex flex-col gap-4"
              [attr.aria-label]="'context.overview.aside' | transloco"
            >
              @if (!beginner()) {
                <app-card>
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'context.overview.matrix.title' | transloco }}
                  </h2>
                  <p class="mt-1 text-ui text-fg-muted">
                    {{ 'context.overview.matrix.body' | transloco }}
                  </p>
                  <a
                    routerLink="/context/responsibilities/matrix"
                    class="mt-3 inline-flex items-center gap-1.5 text-ui font-semibold text-accent hover:underline"
                    data-testid="open-matrix"
                  >
                    <app-icon name="grid" [size]="14" />
                    {{ 'context.overview.matrix.open' | transloco }}
                  </a>
                </app-card>
              }
              <app-card>
                <h2 class="font-display text-card font-bold text-fg">
                  {{ 'context.overview.pack.title' | transloco }}
                </h2>
                <p class="mt-1 text-ui text-fg-muted">
                  {{ 'context.overview.pack.body' | transloco }}
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <app-button
                    size="sm"
                    variant="secondary"
                    [loading]="exporting() === 'pdf'"
                    [disabled]="!!exporting()"
                    (click)="exportPack('pdf')"
                    data-testid="pack-pdf"
                  >
                    <app-icon name="documents" [size]="14" />
                    {{ 'context.overview.pack.pdf' | transloco }}
                  </app-button>
                  <app-button
                    size="sm"
                    variant="ghost"
                    [loading]="exporting() === 'xlsx'"
                    [disabled]="!!exporting()"
                    (click)="exportPack('xlsx')"
                    data-testid="pack-xlsx"
                  >
                    {{ 'context.overview.pack.xlsx' | transloco }}
                  </app-button>
                </div>
              </app-card>
            </aside>
          </div>

          <app-why-it-matters scope="context" page="overview" />
        </div>
      }
    </div>
  `,
})
export class ContextOverviewPage {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  protected readonly nav = CONTEXT_NAV;
  protected readonly perms = injectContextPermissions();
  protected readonly overview = signal<ContextOverview | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly exporting = signal<'pdf' | 'xlsx' | null>(null);
  protected readonly tiles = computed(() => registerTiles(this.overview()));
  protected readonly steps = computed(() => setupSteps(this.overview()));
  protected readonly setupDone = computed(() => this.steps().every((step) => step.done));
  protected readonly attention = computed(() => attentionItems(this.overview()));
  /** U34: beginners skip the RACI matrix card and are offered the interview. */
  protected readonly beginner = inject(GuidanceService).isBeginner;
  /** The interview drafts analysis, parties and scope: offer it while one of them is missing. */
  protected readonly showInterview = computed(
    () =>
      this.perms.canWrite() &&
      this.steps().some(
        (step) =>
          !step.done &&
          (step.kind === 'analysis' || step.kind === 'party' || step.kind === 'scope'),
      ),
  );

  private request = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: 'context',
      view: 'dashboard',
      title: this.language.translate('modules.names.context'),
    }));
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  /** Done steps open the register; open steps start a new record when the user may. */
  protected stepLink(step: SetupStepView): string {
    const base = `/context/${KINDS[step.kind].segment}`;
    return !step.done && this.perms.canWrite() ? `${base}/new` : base;
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  protected exportPack(format: 'pdf' | 'xlsx'): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    const lang = this.language.active();
    this.exporting.set(format);
    this.api.evidencePack(orgId, format, lang).subscribe({
      next: (blob) => {
        this.exporting.set(null);
        const name = this.language.translate('context.overview.pack.fileName');
        saveBlob(blob, `${name}.${format}`);
      },
      error: () => {
        this.exporting.set(null);
        this.notifications.error('context.overview.pack.failed');
      },
    });
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
