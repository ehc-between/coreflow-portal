import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subscription, debounceTime, forkJoin } from 'rxjs';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import {
  STATUS_FILTERS,
  StatusFilter,
  ThemeGroup,
  allNodeNumbers,
  collectGaps,
  effectiveStatus,
  filterTree,
  groupByTheme,
  hasAnnexChildren,
  localized,
  pctColor,
  standardsErrorKey,
  statusFilterLabelKey,
  statusLabelKey,
  statusTone,
} from '../../core/standards/standards-data';
import {
  ClauseNode,
  LocalizedText,
  Requirement,
  StandardJob,
  StandardSummary,
} from '../../core/standards/standards.models';
import { Attachments } from '../../shared/attachments/attachments';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { ProgressRing } from '../../shared/ui/progress-ring/progress-ring';
import { StandardJobProgress } from './job-progress';
import { themeKey } from './standard-themes';

/** Tree search debounce. */
const SEARCH_DEBOUNCE_MS = 200;

/** How many gaps the side list shows before "show all". */
const GAP_PREVIEW = 8;

/**
 * One standard for the current org: completeness header, "Map with AI" (queues
 * an AI mapping job and polls its progress), the clause tree (chapters →
 * clauses → requirements; Annex A controls grouped by theme) with a status
 * filter and search, the gap list, and the org's licensed-copy panel (PDF
 * upload via the shared attachments component + text extraction).
 */
@Component({
  selector: 'app-standard-view',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Attachments,
    Badge,
    Button,
    Card,
    Icon,
    ProgressBar,
    ProgressRing,
    StandardJobProgress,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-8 pt-7 pb-12">
      <a
        routerLink="/standards"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'standards.backToOverview' | transloco }}
      </a>

      @if (loading()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      } @else if (!standard()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'standards.notFound' | transloco }}
          </div>
        </app-card>
      } @else if (standard(); as std) {
        <div class="mb-[18px] flex flex-wrap items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-4">
            <app-progress-ring
              [value]="std.completeness.pct"
              [size]="68"
              [color]="pctColor(std.completeness.pct)"
              [label]="'standards.completeness' | transloco"
            />
            <div class="min-w-0">
              <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
                {{ std.name }}
              </h1>
              <div class="text-[13px] text-fg-muted">
                {{ 'standards.edition' | transloco: { edition: std.edition } }}
                ·
                {{
                  'standards.view.coveredOf'
                    | transloco
                      : { covered: std.completeness.covered, total: std.completeness.applicable }
                }}
              </div>
            </div>
          </div>
          @if (std.enabled) {
            <app-button
              *appHasPermission="'standards:manage'"
              [loading]="startingMap()"
              [disabled]="mapRunning()"
              (click)="startMap()"
            >
              <app-icon name="spark" [size]="15" />
              {{ 'standards.view.mapWithAi' | transloco }}
            </app-button>
          }
        </div>

        @if (!std.enabled) {
          <div
            class="mb-4 rounded-tile border border-border bg-surface-2 px-3 py-2 text-[13px] text-fg-muted"
          >
            {{ 'standards.view.notEnabled' | transloco }}
          </div>
        }

        @if (mapJobId(); as jobId) {
          <div class="mb-4">
            <app-standard-job-progress
              [jobId]="jobId"
              kind="map"
              labelKey="standards.job.mapping"
              (finished)="onMapFinished($event)"
            />
          </div>
        }
        @if (mapStartError(); as key) {
          <p class="mb-4 text-[13px] text-fail" role="alert">
            {{ key | transloco }}
          </p>
        }

        <div class="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div class="flex min-w-0 flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2.5">
              <div
                class="flex h-10 min-w-[200px] flex-1 items-center gap-2.5 rounded-[10px] border border-border bg-bg px-3"
              >
                <span class="flex text-fg-subtle"><app-icon name="search" [size]="17" /></span>
                <input
                  type="search"
                  [ngModel]="query()"
                  (ngModelChange)="query.set($event)"
                  [placeholder]="'standards.view.searchPlaceholder' | transloco"
                  [attr.aria-label]="'standards.view.searchPlaceholder' | transloco"
                  class="h-full flex-1 bg-transparent text-[13.5px] text-fg outline-none"
                />
              </div>
              @if (!filtering()) {
                <app-button variant="ghost" size="sm" (click)="toggleAll()">
                  {{
                    (allExpanded() ? 'standards.view.collapseAll' : 'standards.view.expandAll')
                      | transloco
                  }}
                </app-button>
              }
            </div>
            <div
              class="flex flex-wrap gap-1.5"
              role="group"
              [attr.aria-label]="'standards.filter.label' | transloco"
            >
              @for (option of filters; track option) {
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors"
                  [class]="
                    filter() === option
                      ? 'border-accent-border bg-accent-soft text-accent'
                      : 'border-border bg-surface text-fg-muted hover:text-fg'
                  "
                  [attr.aria-pressed]="filter() === option"
                  (click)="filter.set(option)"
                >
                  {{ filterLabelKey(option) | transloco }}
                </button>
              }
            </div>

            <app-card [padded]="false">
              @if (visibleTree().length === 0) {
                <p class="px-4 py-8 text-center text-[13.5px] text-fg-muted">
                  {{ 'standards.view.noMatches' | transloco }}
                </p>
              } @else {
                <ul class="py-1.5">
                  @for (node of visibleTree(); track node.number) {
                    <ng-container
                      [ngTemplateOutlet]="nodeTpl"
                      [ngTemplateOutletContext]="{ $implicit: node, depth: 0 }"
                    />
                  }
                </ul>
              }
            </app-card>
          </div>

          <div class="flex flex-col gap-5">
            <app-card [padded]="false">
              <h2
                class="flex items-center justify-between px-4 pt-3.5 pb-2 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'standards.gaps.title' | transloco }}
                <span class="text-[13px] font-semibold text-fg-subtle">{{ gaps().length }}</span>
              </h2>
              @if (gaps().length === 0) {
                <p class="px-4 pb-4 text-[13px] text-fg-muted">
                  {{ 'standards.gaps.none' | transloco }}
                </p>
              } @else {
                <ul class="px-2 pb-2">
                  @for (gap of shownGaps(); track gap.requirement.ref) {
                    <li>
                      <a
                        [routerLink]="['/standards', std.key, 'clauses', gap.clauseNumber]"
                        [queryParams]="{ req: gap.requirement.ref }"
                        class="flex gap-2 rounded-[8px] px-2 py-1.5 hover:bg-surface-2"
                      >
                        <span
                          class="mt-1.5 h-2 w-2 flex-none rounded-full"
                          [class]="gap.status === 'not_started' ? 'bg-fail' : 'bg-warn'"
                          [attr.aria-label]="statusLabelKey(gap.status) | transloco"
                        ></span>
                        <span class="min-w-0 flex-1">
                          <span class="block font-mono text-[11.5px] text-fg-subtle">{{
                            gap.clauseNumber
                          }}</span>
                          <span class="line-clamp-2 block text-[12.5px] text-fg">{{
                            text(gap.requirement.text)
                          }}</span>
                        </span>
                      </a>
                    </li>
                  }
                </ul>
                @if (gaps().length > gapPreview) {
                  <button
                    type="button"
                    class="mx-4 mb-3 text-[12.5px] font-semibold text-accent hover:underline"
                    (click)="showAllGaps.set(!showAllGaps())"
                  >
                    {{
                      (showAllGaps() ? 'standards.gaps.showLess' : 'standards.gaps.showAll')
                        | transloco: { count: gaps().length }
                    }}
                  </button>
                }
              }
            </app-card>

            @if (std.org_standard_id; as orgStandardId) {
              <app-card>
                <h2 class="mb-1 font-display text-[15px] font-bold tracking-[-0.02em] text-fg">
                  {{ 'standards.licensed.title' | transloco }}
                </h2>
                <p class="mb-3 text-[12.5px] text-fg-muted">
                  {{ 'standards.licensed.hint' | transloco }}
                </p>
                @if (std.has_licensed_text) {
                  <div class="mb-3">
                    <app-badge tone="pass">
                      <app-icon name="check" [size]="12" />
                      {{ 'standards.licensed.extracted' | transloco }}
                    </app-badge>
                  </div>
                }
                <app-attachments
                  entityType="standard"
                  [entityId]="orgStandardId"
                  [canEdit]="canManage()"
                />
                @if (canManage()) {
                  <div class="mt-3 flex flex-col gap-2">
                    @if (extractJobId(); as jobId) {
                      <app-standard-job-progress
                        [jobId]="jobId"
                        kind="extract"
                        labelKey="standards.job.extracting"
                        (finished)="onExtractFinished($event)"
                      />
                    }
                    @if (extractStartError(); as key) {
                      <p class="text-[12.5px] text-fail" role="alert">
                        {{ key | transloco }}
                      </p>
                    }
                    <app-button
                      variant="secondary"
                      size="sm"
                      [loading]="startingExtract()"
                      [disabled]="extractRunning()"
                      (click)="startExtract()"
                    >
                      {{ 'standards.licensed.extract' | transloco }}
                    </app-button>
                  </div>
                }
              </app-card>
            }
          </div>
        </div>

        <ng-template #nodeTpl let-node let-depth="depth">
          <li>
            <div
              class="flex items-center gap-2 py-1.5 pr-4 hover:bg-surface-2"
              [style.padding-left.px]="12 + depth * 18"
            >
              <button
                type="button"
                class="flex h-6 w-6 flex-none items-center justify-center rounded-[6px] text-fg-subtle hover:bg-surface hover:text-fg"
                [class.invisible]="!hasContent(node)"
                [attr.aria-expanded]="isExpanded(node.number)"
                [attr.aria-label]="
                  (isExpanded(node.number) ? 'standards.view.collapse' : 'standards.view.expand')
                    | transloco: { number: node.number }
                "
                (click)="toggle(node.number)"
              >
                <app-icon
                  name="chevron"
                  [size]="14"
                  [class]="isExpanded(node.number) ? '' : '-rotate-90'"
                />
              </button>
              <a
                [routerLink]="['/standards', std.key, 'clauses', node.number]"
                class="flex min-w-0 flex-1 items-baseline gap-2 hover:text-accent"
              >
                <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                  node.number
                }}</span>
                <span
                  class="truncate text-[13.5px] text-fg"
                  [class.font-semibold]="depth === 0"
                  [title]="text(node.title)"
                  >{{ text(node.title) }}</span
                >
              </a>
              @if (node.rollup.applicable > 0) {
                <span class="hidden w-20 flex-none sm:block">
                  <app-progress-bar
                    [value]="node.rollup.pct"
                    [color]="pctColor(node.rollup.pct)"
                    [label]="node.number"
                  />
                </span>
                <span class="w-10 flex-none text-right text-[12px] font-semibold text-fg-muted"
                  >{{ node.rollup.pct }}%</span
                >
              } @else {
                <span class="w-10 flex-none text-right text-[12px] text-fg-subtle">—</span>
              }
            </div>

            @if (isExpanded(node.number)) {
              @if (node.requirements.length > 0) {
                <ul>
                  @for (req of node.requirements; track req.ref) {
                    <li>
                      <a
                        [routerLink]="['/standards', std.key, 'clauses', node.number]"
                        [queryParams]="{ req: req.ref }"
                        class="flex items-start gap-2 py-1.5 pr-4 hover:bg-surface-2"
                        [style.padding-left.px]="44 + depth * 18"
                      >
                        <app-badge [tone]="tone(req)">{{
                          statusLabelKey(status(req)) | transloco
                        }}</app-badge>
                        <span class="min-w-0 flex-1 text-[13px] text-fg">{{ text(req.text) }}</span>
                        <span class="flex flex-none items-center gap-2 text-[12px] text-fg-subtle">
                          @if (req.confirmed_links.length > 0) {
                            <span
                              class="inline-flex items-center gap-0.5"
                              [title]="
                                'standards.view.evidenceCount'
                                  | transloco: { count: req.confirmed_links.length }
                              "
                              ><app-icon name="link" [size]="13" />{{
                                req.confirmed_links.length
                              }}</span
                            >
                          }
                          @if (req.suggested_links.length > 0) {
                            <span
                              class="inline-flex items-center gap-0.5 text-accent"
                              [title]="
                                'standards.view.suggestionCount'
                                  | transloco: { count: req.suggested_links.length }
                              "
                              ><app-icon name="spark" [size]="13" />{{
                                req.suggested_links.length
                              }}</span
                            >
                          }
                        </span>
                      </a>
                    </li>
                  }
                </ul>
              }
              @if (node.children.length > 0) {
                @if (themeGroups().get(node.number); as groups) {
                  @for (group of groups; track group.theme) {
                    @if (group.theme) {
                      <div
                        class="pt-2 pb-1 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
                        [style.padding-left.px]="44 + depth * 18"
                      >
                        @if (themeKey(group.theme); as key) {
                          {{ key | transloco }}
                        } @else {
                          {{ group.theme }}
                        }
                      </div>
                    }
                    <ul>
                      @for (child of group.nodes; track child.number) {
                        <ng-container
                          [ngTemplateOutlet]="nodeTpl"
                          [ngTemplateOutletContext]="{ $implicit: child, depth: depth + 1 }"
                        />
                      }
                    </ul>
                  }
                } @else {
                  <ul>
                    @for (child of node.children; track child.number) {
                      <ng-container
                        [ngTemplateOutlet]="nodeTpl"
                        [ngTemplateOutletContext]="{ $implicit: child, depth: depth + 1 }"
                      />
                    }
                  </ul>
                }
              }
            }
          </li>
        </ng-template>
      }
    </div>
  `,
})
export class StandardView {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  /** Route param. */
  readonly key = input.required<string>();

  protected readonly standard = signal<StandardSummary | null>(null);
  protected readonly tree = signal<readonly ClauseNode[]>([]);
  protected readonly loading = signal(true);

  protected readonly filter = signal<StatusFilter>('all');
  protected readonly query = signal('');
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly mapJobId = signal<string | null>(null);
  protected readonly mapRunning = signal(false);
  protected readonly startingMap = signal(false);
  /** i18n key explaining why AI mapping couldn't start, or null. */
  protected readonly mapStartError = signal<string | null>(null);
  protected readonly extractJobId = signal<string | null>(null);
  protected readonly extractRunning = signal(false);
  protected readonly startingExtract = signal(false);
  protected readonly extractStartError = signal<string | null>(null);
  protected readonly showAllGaps = signal(false);

  protected readonly filters = STATUS_FILTERS;
  protected readonly gapPreview = GAP_PREVIEW;
  protected readonly pctColor = pctColor;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly filterLabelKey = statusFilterLabelKey;

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('standards:manage'),
  );

  /** The search box value, debounced so typing doesn't re-filter the tree on every key. */
  private readonly debouncedQuery = toSignal(
    toObservable(this.query).pipe(debounceTime(SEARCH_DEBOUNCE_MS)),
    { initialValue: '' },
  );

  protected readonly filtering = computed(
    () => this.filter() !== 'all' || !!this.debouncedQuery().trim(),
  );

  protected readonly visibleTree = computed(() =>
    filterTree(this.tree(), this.filter(), this.debouncedQuery(), this.language.active()),
  );

  /** Annex A theme groups per visible node whose children are controls (memoised). */
  protected readonly themeGroups = computed(() => {
    const groups = new Map<string, ThemeGroup[]>();
    const visit = (node: ClauseNode): void => {
      if (hasAnnexChildren(node)) {
        groups.set(node.number, groupByTheme(node.children));
      }
      node.children.forEach(visit);
    };
    this.visibleTree().forEach(visit);
    return groups;
  });

  protected readonly gaps = computed(() => collectGaps(this.tree(), this.language.active()));
  protected readonly shownGaps = computed(() =>
    this.showAllGaps() ? this.gaps() : this.gaps().slice(0, GAP_PREVIEW),
  );

  protected readonly allExpanded = computed(
    () => this.filtering() || allNodeNumbers(this.tree()).every((n) => this.expanded().has(n)),
  );

  private sub: Subscription | null = null;
  private loadedOrgId: string | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const key = this.key();
      if (this.loadedOrgId !== null && orgId !== this.loadedOrgId) {
        void this.router.navigateByUrl('/standards');
        return;
      }
      untracked(() => this.load(orgId, key));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected text(value: LocalizedText | null): string {
    return localized(value, this.language.active());
  }

  protected themeKey(theme: string): string | null {
    return themeKey(theme);
  }

  protected status(req: Requirement) {
    return effectiveStatus(req);
  }

  protected tone(req: Requirement) {
    return statusTone(effectiveStatus(req));
  }

  protected hasContent(node: ClauseNode): boolean {
    return node.children.length > 0 || node.requirements.length > 0;
  }

  /** While a filter/search is active every surviving node is shown expanded. */
  protected isExpanded(number: string): boolean {
    return this.filtering() || this.expanded().has(number);
  }

  protected toggle(number: string): void {
    if (this.filtering()) {
      return;
    }
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  }

  protected toggleAll(): void {
    if (this.allExpanded()) {
      this.expanded.set(new Set());
    } else {
      this.expanded.set(new Set(allNodeNumbers(this.tree())));
    }
  }

  protected startMap(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.startingMap()) {
      return;
    }
    this.startingMap.set(true);
    this.mapStartError.set(null);
    this.api.startAiMap(orgId, this.key()).subscribe({
      next: ({ job_id }) => {
        this.startingMap.set(false);
        this.mapRunning.set(true);
        this.mapJobId.set(job_id);
      },
      error: (err: unknown) => {
        this.startingMap.set(false);
        this.mapStartError.set(standardsErrorKey(err, 'map'));
      },
    });
  }

  protected onMapFinished(job: StandardJob | null): void {
    // The result banner stays up; always free the button, refresh on success.
    this.mapRunning.set(false);
    if (job?.status === 'done') {
      this.reload();
    }
  }

  protected startExtract(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.startingExtract()) {
      return;
    }
    this.startingExtract.set(true);
    this.extractStartError.set(null);
    this.api.extractLicensedText(orgId, this.key()).subscribe({
      next: ({ job_id }) => {
        this.startingExtract.set(false);
        this.extractRunning.set(true);
        this.extractJobId.set(job_id);
      },
      error: (err: unknown) => {
        this.startingExtract.set(false);
        this.extractStartError.set(standardsErrorKey(err, 'extract'));
      },
    });
  }

  protected onExtractFinished(job: StandardJob | null): void {
    this.extractRunning.set(false);
    if (job?.status === 'done') {
      // Re-fetch the list so has_licensed_text reflects the extracted copy.
      this.reload();
    }
  }

  private reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.key(), false);
  }

  private load(orgId: string | null, key: string, showSpinner = true): void {
    this.sub?.unsubscribe();
    this.loadedOrgId = orgId;
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    if (showSpinner) {
      this.loading.set(true);
    }
    this.sub = forkJoin({
      list: this.api.list(orgId),
      tree: this.api.getTree(orgId, key),
    }).subscribe({
      next: ({ list, tree }) => {
        this.standard.set(list.find((s) => s.key === key) ?? null);
        this.tree.set(tree);
        this.loading.set(false);
      },
      error: () => {
        this.standard.set(null);
        this.tree.set([]);
        this.loading.set(false);
      },
    });
  }
}
