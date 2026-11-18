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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { AiAvailability } from '../../core/ai/ai-availability';
import { providePageContext } from '../../core/ai/page-context';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { FrameworkView } from '../../core/standards/frameworks-data';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { ChapterBar, chapterBars, pctColor } from '../../core/standards/standards-data';
import {
  editionKey,
  headlineScore,
  legalFormKey,
  legalFormOf,
  legalFormTone,
  standardName,
} from '../../core/standards/standards-display';
import { pluralKey } from '../../shared/i18n/plural';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { ClauseNode, StandardSummary } from '../../core/standards/standards.models';
import { LanguageService } from '../../core/i18n/language.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { ProgressRing } from '../../shared/ui/progress-ring/progress-ring';
import { AskPanelService } from '../ask/ask-panel.service';
import { loadFrameworks } from './frameworks/frameworks-load';

/**
 * Standards & regulations overview for the current org: every enabled
 * framework as a card with its readiness ring (applicability, evidence and
 * evidence freshness), status counts and per-chapter bars (from the clause
 * tree), plus every other framework of the catalogue (ISO standards and EU
 * regulations, marked when in the org profile) that can be switched on.
 * Learning-mode guidance on top; "Explain our readiness" asks the assistant.
 * Enabling / disabling needs `standards:manage`. Reloads on org switch.
 */
@Component({
  selector: 'app-standards-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    LocalDatePipe,
    MenuItem,
    OverflowMenu,
    PageHeader,
    ProgressBar,
    ProgressRing,
    TourStepDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
      <app-page-header
        titleKey="modules.names.standards"
        descriptionKey="standards.subtitle"
        [breadcrumbs]="[{ labelKey: 'modules.names.standards' }]"
      >
        @if (!aiUnavailable() && !loading() && !loadError()) {
          <app-button secondary variant="ghost" size="sm" (click)="explainReadiness()">
            <app-icon name="spark" [size]="14" />
            {{ 'standards.frameworks.explain' | transloco }}
          </app-button>
        }
        <a
          secondary
          appTourStep="standards-readiness"
          routerLink="/standards/readiness"
          class="inline-flex h-9 items-center justify-center gap-2 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg transition-colors hover:border-border-strong hover:bg-surface-2"
        >
          {{ 'standards.frameworks.readinessDetails' | transloco }}
          <app-icon name="arrow" [size]="14" />
        </a>
      </app-page-header>

      <app-help-strip
        scope="standards"
        page="overview"
        tour="overview"
        lesson="requirements-and-evidence"
      />

      @if (loading()) {
        <app-loading-state [rows]="3" />
      } @else if (loadError()) {
        <app-error-state (retry)="reload()" />
      } @else {
        @if (enabled().length === 0) {
          <app-empty-state
            icon="iso"
            titleKey="standards.overview.noneEnabled"
            bodyKey="standards.overview.noneEnabledHint"
          />
        } @else {
          <div class="grid gap-5 lg:grid-cols-2" appTourStep="standards-cards">
            @for (std of enabled(); track std.key) {
              @let score = scoreOf(std);
              @let form = formOf(std);
              <app-card>
                <div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                  <span
                    class="flex-none self-start"
                    [title]="'standards.scoreHint' | transloco"
                    data-testid="overview-score"
                  >
                    <app-progress-ring
                      [value]="score"
                      [size]="76"
                      [color]="pctColor(score)"
                      [label]="'standards.completeness' | transloco"
                    />
                  </span>
                  <div class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/standards', std.key]"
                      class="font-display text-card font-bold text-fg [overflow-wrap:anywhere] hover:text-accent"
                    >
                      {{ nameOf(std) }}
                    </a>
                    <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <app-badge [tone]="legalFormTone(form)">{{
                        legalFormKey(form) | transloco
                      }}</app-badge>
                      <span class="text-meta text-fg-subtle">{{
                        editionKey(form) | transloco: { edition: std.edition }
                      }}</span>
                      @if (viewOf(std.key)?.inProfile) {
                        <span [title]="'standards.frameworks.inProfileHint' | transloco">
                          <app-badge tone="accent">{{
                            'standards.frameworks.inProfile' | transloco
                          }}</app-badge>
                        </span>
                      }
                    </div>
                    <p class="mt-1.5 text-meta text-fg-muted">
                      {{
                        'standards.view.coveredOf'
                          | transloco
                            : {
                                covered: std.completeness.covered,
                                total: std.completeness.applicable,
                              }
                      }}
                    </p>
                    <!-- U24: the chips open the standard; the gap chips with its gap filter. -->
                    <div class="mt-2 flex flex-wrap gap-1.5" data-testid="overview-status-chips">
                      <a
                        [routerLink]="['/standards', std.key]"
                        class="rounded-full hover:opacity-80"
                      >
                        <app-badge tone="pass">
                          {{
                            'standards.counts.covered'
                              | transloco: { count: std.completeness.covered }
                          }}
                        </app-badge>
                      </a>
                      @if (std.completeness.partial > 0) {
                        <a
                          [routerLink]="['/standards', std.key]"
                          [queryParams]="{ filter: 'gaps' }"
                          class="rounded-full hover:opacity-80"
                        >
                          <app-badge tone="warn">
                            {{
                              'standards.counts.partial'
                                | transloco: { count: std.completeness.partial }
                            }}
                          </app-badge>
                        </a>
                      }
                      <a
                        [routerLink]="['/standards', std.key]"
                        [queryParams]="{ filter: 'gaps' }"
                        class="rounded-full hover:opacity-80"
                      >
                        <app-badge tone="neutral">
                          {{
                            'standards.counts.not_started'
                              | transloco: { count: std.completeness.not_started }
                          }}
                        </app-badge>
                      </a>
                      @if (std.completeness.not_applicable > 0) {
                        <app-badge tone="neutral">
                          {{
                            'standards.counts.not_applicable'
                              | transloco: { count: std.completeness.not_applicable }
                          }}
                        </app-badge>
                      }
                    </div>
                    @if (std.certification; as cert) {
                      <p class="mt-2 text-meta text-fg-muted" data-testid="overview-certification">
                        <app-icon
                          name="shield"
                          [size]="13"
                          class="mr-1 inline-block align-[-2px]"
                        />
                        <a
                          [routerLink]="cert.url"
                          class="font-semibold text-accent hover:underline"
                          >{{
                            'standards.cert.label' | transloco: { body: cert.certification_body }
                          }}</a
                        >
                        · {{ certStatusKey(cert.status) | transloco }}
                        @if (cert.next_surveillance_at) {
                          ·
                          {{
                            'standards.cert.nextSurveillance'
                              | transloco
                                : { date: (cert.next_surveillance_at | localDate: 'mediumDate') }
                          }}
                        }
                      </p>
                    }
                  </div>
                </div>

                @if (bars()[std.key]; as list) {
                  <ul
                    class="mt-4 flex flex-col gap-2"
                    [attr.aria-label]="'standards.overview.chapters' | transloco"
                  >
                    @for (bar of list; track bar.number) {
                      <li class="min-w-0">
                        <a
                          [routerLink]="['/standards', std.key, bar.segment]"
                          class="group mb-1 flex min-w-0 items-center gap-2 text-meta"
                        >
                          <span class="max-w-[7rem] flex-none truncate font-mono text-fg-subtle">{{
                            bar.label
                          }}</span>
                          <span
                            class="min-w-0 flex-1 truncate text-fg group-hover:text-accent"
                            [title]="bar.title"
                            >{{ bar.title }}</span
                          >
                          <span class="flex-none font-semibold text-fg-muted">{{ bar.pct }}%</span>
                        </a>
                        <app-progress-bar
                          [value]="bar.pct"
                          [color]="pctColor(bar.pct)"
                          [label]="bar.label + ' ' + bar.title"
                        />
                      </li>
                    }
                  </ul>
                }

                <div class="mt-4 flex flex-wrap items-center gap-2">
                  <a
                    [routerLink]="['/standards', std.key]"
                    class="inline-flex h-9 items-center justify-center gap-2 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg transition-colors hover:border-border-strong hover:bg-surface-2"
                  >
                    {{ 'standards.overview.open' | transloco }}
                    <app-icon name="arrow" [size]="14" />
                  </a>
                  @if (std.completeness.not_started + std.completeness.partial > 0) {
                    <a
                      [routerLink]="['/standards/gaps', std.key]"
                      class="inline-flex h-9 items-center justify-center rounded-tile px-3 text-ui font-semibold text-accent hover:bg-accent-soft"
                      data-testid="overview-gaps"
                    >
                      {{
                        plural(
                          'standards.reqs.readiness.gaps',
                          std.completeness.not_started + std.completeness.partial
                        )
                          | transloco
                            : { count: std.completeness.not_started + std.completeness.partial }
                      }}
                    </a>
                  }
                  <span class="flex-1"></span>
                  <app-overflow-menu
                    *appHasPermission="'standards:manage'"
                    [iconOnly]="true"
                    data-testid="overview-more"
                  >
                    <button
                      appMenuItem
                      type="button"
                      [danger]="true"
                      [disabled]="togglingKey() !== null"
                      (click)="pendingDisable.set(std)"
                    >
                      {{ 'standards.overview.disable' | transloco }}
                    </button>
                  </app-overflow-menu>
                </div>
              </app-card>
            }
          </div>
        }

        @if (available().length > 0) {
          <h2
            class="mt-8 mb-1 font-display text-section font-bold text-fg"
            appTourStep="standards-available"
          >
            {{ 'standards.overview.available' | transloco }}
          </h2>
          <p class="mb-3 text-meta text-fg-muted">
            {{ 'standards.frameworks.availableHint' | transloco }}
          </p>
          <app-card [padded]="false">
            <ul class="divide-y divide-border">
              @for (std of available(); track std.key) {
                @let form = formOf(std);
                <li class="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span class="flex flex-none text-fg-subtle"
                    ><app-icon name="iso" [size]="18"
                  /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-ui font-semibold text-fg [overflow-wrap:anywhere]">{{
                      nameOf(std)
                    }}</span>
                    <span class="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <app-badge [tone]="legalFormTone(form)">{{
                        legalFormKey(form) | transloco
                      }}</app-badge>
                      <span class="text-meta text-fg-subtle">{{
                        editionKey(form) | transloco: { edition: std.edition }
                      }}</span>
                      @if (viewOf(std.key)?.inProfile) {
                        <app-badge tone="accent">{{
                          'standards.frameworks.inProfile' | transloco
                        }}</app-badge>
                      }
                    </span>
                  </span>
                  <app-button
                    *appHasPermission="'standards:manage'"
                    size="sm"
                    [loading]="togglingKey() === std.key"
                    (click)="setEnabled(std, true)"
                  >
                    <app-icon name="plus" [size]="14" />
                    {{ 'standards.overview.enable' | transloco }}
                  </app-button>
                </li>
              }
            </ul>
          </app-card>
        }

        <app-confirm-dialog
          [open]="pendingDisable() !== null"
          [busy]="togglingKey() !== null"
          confirmVariant="danger"
          [title]="'standards.overview.disableTitle' | transloco"
          [message]="
            'standards.overview.disableMessage'
              | transloco: { name: pendingDisable() ? nameOf(pendingDisable()!) : '' }
          "
          [confirmLabel]="'standards.overview.disable' | transloco"
          [cancelLabel]="'standards.requirement.cancel' | transloco"
          (confirmed)="confirmDisable()"
          (cancelled)="pendingDisable.set(null)"
        />

        @if (toggleError()) {
          <p class="mt-3 text-ui text-fail" role="alert">
            {{ 'standards.overview.toggleError' | transloco }}
          </p>
        }
      }
    </div>
  `,
})
export class StandardsOverview {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);
  protected readonly aiUnavailable = inject(AiAvailability).unavailable;

  protected readonly standards = signal<readonly StandardSummary[]>([]);
  /** Every framework with its readiness, in framework order. */
  private readonly views = signal<readonly FrameworkView[]>([]);
  private readonly viewsByKey = computed(
    () => new Map(this.views().map((v) => [v.standardKey, v])),
  );
  /** Standards in framework order (catalogue entries outside it last). */
  private readonly ordered = computed(() => {
    const order = new Map(this.views().map((v, i) => [v.standardKey, i]));
    return [...this.standards()].sort(
      (a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity),
    );
  });
  private readonly trees = signal<Readonly<Record<string, readonly ClauseNode[]>>>({});
  /** Per-chapter bars, re-titled on language switch. */
  protected readonly bars = computed(() => {
    const lang = this.language.active();
    const out: Record<string, readonly ChapterBar[]> = {};
    for (const [key, tree] of Object.entries(this.trees())) {
      out[key] = chapterBars(tree, lang);
    }
    return out;
  });
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly togglingKey = signal<string | null>(null);
  protected readonly toggleError = signal(false);
  /** Standard awaiting confirmation before it is disabled. */
  protected readonly pendingDisable = signal<StandardSummary | null>(null);

  protected readonly enabled = computed(() => this.ordered().filter((s) => s.enabled));
  protected readonly available = computed(() => this.ordered().filter((s) => !s.enabled));

  protected readonly pctColor = pctColor;
  protected readonly plural = pluralKey;
  protected readonly legalFormKey = legalFormKey;
  protected readonly legalFormTone = legalFormTone;
  protected readonly editionKey = editionKey;

  private sub: Subscription | null = null;
  private barsSub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({ module: 'standards', view: 'dashboard' }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      this.barsSub?.unsubscribe();
    });
  }

  protected viewOf(key: string): FrameworkView | null {
    return this.viewsByKey().get(key) ?? null;
  }

  /** The standard's name in the UI language. */
  protected nameOf(std: StandardSummary): string {
    return standardName(std, this.language.active());
  }

  protected formOf(std: StandardSummary) {
    return legalFormOf(std, this.viewOf(std.key)?.kind);
  }

  /** THE headline number: one score everywhere (the weighted readiness). */
  protected scoreOf(std: StandardSummary): number {
    return headlineScore(std, this.viewOf(std.key)?.readiness);
  }

  protected certStatusKey(status: string): string {
    return `standards.cert.status.${status}`;
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  /** Open the assistant on the org's readiness across its enabled frameworks. */
  protected explainReadiness(): void {
    const items = this.enabled().map((s) =>
      this.transloco.translate('standards.frameworks.summaryItem', {
        name: this.nameOf(s),
        score: this.scoreOf(s),
      }),
    );
    this.ask.showWith(
      items.length > 0
        ? this.transloco.translate('standards.frameworks.explainPrompt', {
            summary: items.join(', '),
          })
        : this.transloco.translate('standards.frameworks.explainNone'),
    );
  }

  protected confirmDisable(): void {
    const std = this.pendingDisable();
    if (std) {
      this.setEnabled(std, false);
    }
  }

  protected setEnabled(std: StandardSummary, enabled: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.togglingKey()) {
      return;
    }
    this.togglingKey.set(std.key);
    this.toggleError.set(false);
    this.api.setEnabled(orgId, std.key, enabled).subscribe({
      next: () => {
        this.togglingKey.set(null);
        this.pendingDisable.set(null);
        this.load(orgId);
      },
      error: () => {
        this.togglingKey.set(null);
        this.pendingDisable.set(null);
        this.toggleError.set(true);
      },
    });
  }

  private load(orgId: string | null): void {
    this.sub?.unsubscribe();
    this.barsSub?.unsubscribe();
    this.standards.set([]);
    this.views.set([]);
    this.trees.set({});
    this.loadError.set(false);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.sub = loadFrameworks(this.api, orgId).subscribe({
      next: ({ standards: list, views }) => {
        this.standards.set(list);
        this.views.set(views);
        this.loading.set(false);
        this.loadBars(
          orgId,
          list.filter((s) => s.enabled),
        );
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  /** Per-chapter bars come from each enabled standard's tree (best-effort). */
  private loadBars(orgId: string, enabled: readonly StandardSummary[]): void {
    if (enabled.length === 0) {
      return;
    }
    const requests = Object.fromEntries(
      enabled.map((s) => [s.key, this.api.getTree(orgId, s.key).pipe(catchError(() => of(null)))]),
    );
    this.barsSub = forkJoin(requests).subscribe((trees) => {
      const out: Record<string, readonly ClauseNode[]> = {};
      for (const [key, tree] of Object.entries(trees)) {
        if (tree) {
          out[key] = tree;
        }
      }
      this.trees.set(out);
    });
  }
}
