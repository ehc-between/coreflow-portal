import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, debounceTime, forkJoin } from 'rxjs';
import { AiAvailability, isAiNotConfigured } from '../../../core/ai/ai-availability';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { localized, pctColor, standardsErrorKey } from '../../../core/standards/standards-data';
import {
  ClauseNode,
  LocalizedText,
  RequirementDetail,
  StandardJob,
  StandardSummary,
} from '../../../core/standards/standards.models';
import { Attachments } from '../../../shared/attachments/attachments';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressRing } from '../../../shared/ui/progress-ring/progress-ring';
import { trapTabKey } from '../../../shared/ui/focus-trap';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StandardJobProgress } from '../job-progress';
import { requirementAnchorId } from '../requirement-card';
import { ClauseSection, LicensedState, SectionLink } from './clause-section';
import { MappingStatus } from './mapping-status';
import { StandardToc } from './standard-toc';
import {
  RenderUnit,
  SectionView,
  applyRequirementDetails,
  clauseOfRequirement,
  ContentFilter,
  countGaps,
  countWithSuggestions,
  effectiveTocExpansion,
  filterRequirements,
  flattenSections,
  indexTree,
  isAtBottom,
  isContentFiltered,
  mappingState,
  matchesContentFilter,
  neighbours,
  pickActiveSection,
  renderUnits,
  sectionDomId,
  sectionPath,
  shortcutFor,
  tocRows,
  treeCompleteness,
} from './workspace-data';
import { WorkspaceMemory } from './workspace-memory';
import { NearViewport, WorkspaceScroll } from './workspace-scroll';

/** TOC search debounce. */
const SEARCH_DEBOUNCE_MS = 150;
/** Delay before the scroll-spy writes the current section into the URL. */
const URL_SYNC_MS = 300;
/** Gap (px) left above a section scrolled to the top. */
const SCROLL_OFFSET = 12;
/** How long a deep-linked requirement stays highlighted. */
const HIGHLIGHT_MS = 6000;
/** After a deep-link jump the scroll-spy may not rewrite the URL for this long. */
const DEEP_LINK_URL_HOLD_MS = 1000;
/** Upper bound on keeping a jump target pinned while content above it renders. */
const PIN_MAX_MS = 8000;
/** Keys that scroll the document; pressing one releases a pinned jump target. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

const TOC_MIN = 240;
const TOC_MAX = 520;
const TOC_DEFAULT = 320;
const PREFS_KEY = 'cf.standards.workspace';

type ScrollMode = 'smooth' | 'instant';

interface WorkspacePrefs {
  readonly tocWidth?: number;
  readonly tocHidden?: boolean;
}

function clampWidth(width: number): number {
  return Math.round(Math.max(TOC_MIN, Math.min(TOC_MAX, width)));
}

/**
 * One standard as a document-style workspace (`/standards/:key[/:number]`):
 *
 * - left, a sticky table of contents of the whole standard (status dots,
 *   chapter coverage, search, "only gaps"), resizable / hideable on desktop and
 *   a drawer on mobile;
 * - a sticky header with the standard, overall completeness, the breadcrumb
 *   of the current section, previous / next, "Map with AI" and the licensed
 *   copy (a slide-over);
 * - the document: every clause in order (Annex A grouped by theme) with our
 *   explanation, guidance, the org's licensed text and the requirements, which
 *   expand inline for assessment, evidence and AI suggestions.
 *
 * A scroll-spy (IntersectionObserver on a reading line) tracks the current
 * section, highlights it in the TOC and writes it into the URL (replaceUrl);
 * TOC / previous / next / j-k navigation pushes history, so back / forward
 * move between visited sections. Chapters render as they approach the
 * viewport (fixed-height placeholders before). Saves patch the tree locally
 * and recompute every roll-up, so dots and coverage update immediately.
 */
@Component({
  selector: 'app-standard-workspace',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Attachments,
    Badge,
    Button,
    Icon,
    ProgressRing,
    SlideOver,
    StandardJobProgress,
    ClauseSection,
    MappingStatus,
    StandardToc,
    NearViewport,
  ],
  providers: [WorkspaceScroll],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full', '(document:keydown)': 'onKeydown($event)' },
  template: `
    @if (loading()) {
      <div class="flex h-full items-center justify-center text-[14px] text-fg-muted">
        {{ 'common.loading' | transloco }}
      </div>
    } @else if (!standard()) {
      <div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p class="text-[14px] text-fg-muted">{{ 'standards.notFound' | transloco }}</p>
        <a routerLink="/standards" class="text-[13px] font-semibold text-accent hover:underline">
          {{ 'standards.backToOverview' | transloco }}
        </a>
      </div>
    } @else if (standard(); as std) {
      <div class="relative flex h-full min-h-0">
        <!-- Table of contents -->
        @if (!isDesktop() && drawerOpen()) {
          <button
            type="button"
            tabindex="-1"
            class="fixed inset-0 z-30 cursor-default bg-black/40"
            [attr.aria-label]="'standards.workspace.close' | transloco"
            (click)="closeDrawer()"
          ></button>
        }
        <aside
          #tocAside
          id="standard-toc"
          class="flex-col border-r border-border bg-surface outline-none"
          tabindex="-1"
          [class]="tocClasses()"
          [style.width.px]="isDesktop() ? tocWidth() : null"
          [attr.inert]="tocInert() ? '' : null"
          [attr.role]="drawerModal() ? 'dialog' : null"
          [attr.aria-modal]="drawerModal() ? 'true' : null"
          [attr.aria-label]="drawerModal() ? ('standards.workspace.contents' | transloco) : null"
          (keydown)="onDrawerKeydown($event)"
        >
          <app-standard-toc
            class="block h-full"
            [rows]="tocRows()"
            [standardKey]="std.key"
            [standardName]="std.name"
            [active]="active()"
            [activePath]="activePathSet()"
            [query]="tocQuery()"
            [gapsOnly]="gapsOnly()"
            [gapCount]="gapCount()"
            [suggestionsOnly]="suggestionsOnly()"
            [suggestionCount]="suggestionCount()"
            [drawer]="!isDesktop()"
            (queryChange)="tocQuery.set($event)"
            (gapsOnlyChange)="setGapsOnly($event)"
            (suggestionsOnlyChange)="setSuggestionsOnly($event)"
            (nodeToggled)="toggleTocNode($event)"
            (navigate)="onNavigate($event)"
            (collapseAll)="collapseToc()"
            (hide)="hideToc()"
          />
        </aside>
        @if (isDesktop() && !tocHidden()) {
          <div
            role="separator"
            tabindex="0"
            aria-orientation="vertical"
            aria-controls="standard-toc"
            [attr.aria-valuenow]="tocWidth()"
            [attr.aria-valuemin]="tocMin"
            [attr.aria-valuemax]="tocMax"
            [attr.aria-label]="'standards.workspace.resize' | transloco"
            class="relative z-10 -ml-[3px] w-[6px] flex-none cursor-col-resize touch-none hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none"
            (pointerdown)="startResize($event)"
            (keydown)="resizeKey($event)"
          ></div>
        }

        <div class="flex min-w-0 flex-1 flex-col" [attr.inert]="drawerModal() ? '' : null">
          <!-- Sticky header -->
          <header
            class="flex flex-none items-center gap-3 border-b border-border bg-surface px-3 py-2 sm:px-4"
          >
            @if (!isDesktop() || tocHidden()) {
              <button
                #tocButton
                type="button"
                class="flex flex-none items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-surface-2"
                aria-controls="standard-toc"
                [attr.aria-expanded]="isDesktop() ? !tocHidden() : drawerOpen()"
                (click)="showToc()"
              >
                <app-icon name="procedures" [size]="15" />
                <span class="hidden sm:inline">{{
                  'standards.workspace.contents' | transloco
                }}</span>
              </button>
            }
            <app-progress-ring
              class="hidden sm:inline-flex"
              [value]="completeness().pct"
              [size]="40"
              [stroke]="4"
              [color]="pctColor(completeness().pct)"
              [label]="'standards.completeness' | transloco"
            />
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-baseline gap-2">
                <a
                  routerLink="/standards"
                  class="hidden flex-none text-[12px] font-semibold text-fg-subtle hover:text-fg md:inline"
                  >{{ 'standards.title' | transloco }} /</a
                >
                <span class="truncate text-[14px] font-bold text-fg">{{ std.name }}</span>
                <span class="hidden flex-none text-[12px] text-fg-subtle sm:inline">{{
                  'standards.view.coveredOf'
                    | transloco
                      : { covered: completeness().covered, total: completeness().applicable }
                }}</span>
              </div>
              <nav [attr.aria-label]="'standards.workspace.breadcrumb' | transloco">
                <ol class="flex min-w-0 items-center gap-1 text-[12.5px] text-fg-muted">
                  @for (crumb of breadcrumb(); track crumb.number; let last = $last) {
                    <li
                      class="min-w-0 items-center gap-1"
                      [class]="last ? 'flex' : 'hidden sm:flex'"
                    >
                      @if (last) {
                        <span class="truncate font-medium text-fg"
                          ><span class="font-mono text-fg-subtle">{{ crumb.number }}</span>
                          {{ text(crumb.title) }}</span
                        >
                      } @else {
                        <a
                          [routerLink]="['/standards', std.key, crumb.number]"
                          class="max-w-[180px] truncate hover:text-accent"
                          (click)="onNavigateLink($event, crumb.number)"
                          ><span class="font-mono">{{ crumb.number }}</span>
                          {{ text(crumb.title) }}</a
                        >
                        <span class="flex-none text-fg-subtle" aria-hidden="true">›</span>
                      }
                    </li>
                  }
                </ol>
              </nav>
            </div>

            <div class="flex flex-none items-center gap-1">
              <a
                class="flex rounded-[8px] p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
                [class.pointer-events-none]="!nav().prev"
                [class.opacity-40]="!nav().prev"
                [attr.aria-disabled]="!nav().prev"
                [routerLink]="nav().prev ? ['/standards', std.key, nav().prev] : null"
                [attr.aria-label]="'standards.workspace.previous' | transloco"
                [title]="('standards.workspace.previous' | transloco) + ' (k)'"
                (click)="onNavigateLink($event, nav().prev)"
              >
                <app-icon name="chevron" [size]="17" class="rotate-180" />
              </a>
              <a
                class="flex rounded-[8px] p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
                [class.pointer-events-none]="!nav().next"
                [class.opacity-40]="!nav().next"
                [attr.aria-disabled]="!nav().next"
                [routerLink]="nav().next ? ['/standards', std.key, nav().next] : null"
                [attr.aria-label]="'standards.workspace.next' | transloco"
                [title]="('standards.workspace.next' | transloco) + ' (j)'"
                (click)="onNavigateLink($event, nav().next)"
              >
                <app-icon name="chevron" [size]="17" />
              </a>
              @if (std.org_standard_id) {
                <app-button variant="secondary" size="sm" (click)="licensedPanelOpen.set(true)">
                  <app-icon name="lock" [size]="14" />
                  <span class="hidden lg:inline">{{
                    'standards.workspace.licensedCopy' | transloco
                  }}</span>
                  <span class="sr-only lg:hidden">{{
                    'standards.workspace.licensedCopy' | transloco
                  }}</span>
                </app-button>
              }
              @if (std.enabled && !aiOff()) {
                <app-button
                  *appHasPermission="'standards:manage'"
                  size="sm"
                  [loading]="startingMap()"
                  [disabled]="mapRunning()"
                  (click)="startMap()"
                >
                  <app-icon name="spark" [size]="14" />
                  <span class="hidden md:inline">{{ 'standards.view.mapWithAi' | transloco }}</span>
                  <span class="sr-only md:hidden">{{
                    'standards.view.mapWithAi' | transloco
                  }}</span>
                </app-button>
              }
            </div>
          </header>

          @if (mapJobId() || mapStartError() || showMappingStatus()) {
            <div
              class="flex flex-none flex-col gap-2 border-b border-border bg-surface px-4 py-2.5"
            >
              @if (mapJobId(); as jobId) {
                <app-standard-job-progress
                  [jobId]="jobId"
                  kind="map"
                  labelKey="standards.job.mapping"
                  (finished)="onMapFinished($event)"
                />
              } @else if (showMappingStatus()) {
                <app-mapping-status
                  [mapping]="std.last_mapping"
                  [canMap]="canManage()"
                  [aiOff]="aiOff()"
                  [starting]="startingMap()"
                  [pendingCount]="suggestionCount()"
                  [suggestionsOnly]="suggestionsOnly()"
                  (map)="startMap()"
                  (showSuggestions)="setSuggestionsOnly(true)"
                />
              }
              @if (mapStartError(); as key) {
                <p class="text-[13px] text-fail" role="alert">{{ key | transloco }}</p>
              }
            </div>
          }

          <!-- Document -->
          <div #scroller class="min-h-0 flex-1 overflow-y-auto" tabindex="-1">
            <article class="mx-auto w-full max-w-[800px] px-5 pt-8 pb-[40vh] sm:px-10">
              <div class="border-b border-border pb-6">
                <div
                  class="mb-1 text-[12px] font-semibold tracking-[0.08em] text-fg-subtle uppercase"
                >
                  {{ 'standards.edition' | transloco: { edition: std.edition } }}
                </div>
                <h1
                  class="font-display text-[30px] leading-tight font-bold tracking-[-0.03em] text-fg"
                >
                  {{ std.name }}
                </h1>
                <p class="mt-2 text-[14px] text-fg-muted">
                  {{
                    'standards.view.coveredOf'
                      | transloco
                        : { covered: completeness().covered, total: completeness().applicable }
                  }}
                  @if (gapsOnly()) {
                    ·
                    <app-badge tone="warn">{{
                      'standards.workspace.onlyGaps' | transloco
                    }}</app-badge>
                  }
                  @if (suggestionsOnly()) {
                    ·
                    <app-badge tone="accent">{{
                      'standards.workspace.hasAiSuggestions' | transloco
                    }}</app-badge>
                  }
                </p>
                @if (!std.enabled) {
                  <div
                    class="mt-4 rounded-tile border border-border bg-surface-2 px-3 py-2 text-[13px] text-fg-muted"
                  >
                    {{ 'standards.view.notEnabled' | transloco }}
                  </div>
                }
              </div>

              @if (units().length === 0) {
                <p class="py-16 text-center text-[14px] text-fg-muted">
                  {{ emptyKey() | transloco }}
                </p>
              }
              @for (unit of units(); track unit.key) {
                @if (renderedUnits().has(unit.key)) {
                  @for (section of unit.sections; track section.number) {
                    <app-clause-section
                      [section]="section"
                      [standardKey]="std.key"
                      [canManage]="canManage()"
                      [hasLicensedText]="std.has_licensed_text"
                      [licensed]="licensed().get(section.number)"
                      [licensedOpen]="openLicensed().has(section.number)"
                      [guidanceOpen]="openGuidance().has(section.number)"
                      [expandedRefs]="expandedRefs()"
                      [highlightRef]="highlightRef()"
                      [prev]="links().get(section.number)?.prev ?? null"
                      [next]="links().get(section.number)?.next ?? null"
                      (guidanceToggled)="toggleIn(openGuidance, section.number)"
                      (licensedToggled)="toggleLicensed(section.number)"
                      (requirementToggled)="toggleIn(expandedRefs, $event)"
                      (requirementUpdated)="onRequirementUpdated($event)"
                      (linksChanged)="onLinksChanged($event)"
                      (navigate)="onNavigate($event)"
                    />
                  }
                } @else {
                  <div
                    class="pt-8"
                    [style.height.px]="unit.estimate"
                    aria-hidden="true"
                    (appNearViewport)="renderUnit(unit.key)"
                  >
                    <div class="h-6 w-2/3 rounded bg-surface-2"></div>
                  </div>
                }
              }
            </article>
          </div>
        </div>
      </div>

      <app-slide-over
        [open]="licensedPanelOpen()"
        [title]="'standards.licensed.title' | transloco"
        [subtitle]="std.name"
        [closeLabel]="'standards.workspace.close' | transloco"
        (closed)="licensedPanelOpen.set(false)"
      >
        @if (std.org_standard_id; as orgStandardId) {
          <p class="mb-3 text-[13px] leading-relaxed text-fg-muted">
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
            <div class="mt-4 flex flex-col gap-2">
              @if (extractJobId(); as jobId) {
                <app-standard-job-progress
                  [jobId]="jobId"
                  kind="extract"
                  labelKey="standards.job.extracting"
                  (finished)="onExtractFinished($event)"
                />
              }
              @if (extractStartError(); as key) {
                <p class="text-[12.5px] text-fail" role="alert">{{ key | transloco }}</p>
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
        }
      </app-slide-over>
    }
  `,
})
export class StandardWorkspace {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly scroll = inject(WorkspaceScroll);

  /** Route params / query (component input binding). */
  readonly key = input.required<string>();
  readonly number = input<string | undefined>(undefined);
  readonly req = input<string | undefined>(undefined);

  protected readonly standard = signal<StandardSummary | null>(null);
  protected readonly tree = signal<readonly ClauseNode[]>([]);
  protected readonly loading = signal(true);

  /** Current section (scroll-spy / navigation). */
  protected readonly active = signal<string | null>(null);
  protected readonly gapsOnly = signal(false);
  /** Show only requirements with AI suggestions waiting for review. */
  protected readonly suggestionsOnly = signal(false);
  /** Requirements kept visible under a content filter after the user worked on them. */
  private readonly keepRefs = signal<ReadonlySet<string>>(new Set());
  protected readonly tocQuery = signal('');
  /** TOC nodes the user expanded by hand (kept as the reader moves on). */
  private readonly tocUserExpanded = signal<ReadonlySet<string>>(new Set());
  /** Nodes on the current path the user collapsed by hand. */
  private readonly tocUserCollapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly expandedRefs = signal<ReadonlySet<string>>(new Set());
  protected readonly highlightRef = signal<string | null>(null);
  protected readonly renderedUnits = signal<ReadonlySet<string>>(new Set());
  protected readonly openGuidance = signal<ReadonlySet<string>>(new Set());
  protected readonly openLicensed = signal<ReadonlySet<string>>(new Set());
  protected readonly licensed = signal<ReadonlyMap<string, LicensedState>>(new Map());

  protected readonly isDesktop = signal(true);
  protected readonly drawerOpen = signal(false);
  protected readonly tocHidden = signal(false);
  protected readonly tocWidth = signal(TOC_DEFAULT);
  protected readonly licensedPanelOpen = signal(false);

  protected readonly mapJobId = signal<string | null>(null);
  /** Mapping jobs already watched to the end (never re-watched from a stale `last_mapping`). */
  private readonly finishedMapJobs = new Set<string>();
  protected readonly mapRunning = signal(false);
  protected readonly startingMap = signal(false);
  protected readonly mapStartError = signal<string | null>(null);
  protected readonly extractJobId = signal<string | null>(null);
  protected readonly extractRunning = signal(false);
  protected readonly startingExtract = signal(false);
  protected readonly extractStartError = signal<string | null>(null);

  protected readonly pctColor = pctColor;
  protected readonly tocMin = TOC_MIN;
  protected readonly tocMax = TOC_MAX;

  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly tocButton = viewChild<ElementRef<HTMLElement>>('tocButton');
  private readonly tocAside = viewChild<ElementRef<HTMLElement>>('tocAside');
  private readonly memory = inject(WorkspaceMemory);
  private readonly toc = viewChild(StandardToc);

  private readonly availability = inject(AiAvailability);
  protected readonly aiOff = this.availability.unavailable;

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('standards:manage'),
  );

  private readonly debouncedQuery = toSignal(
    toObservable(this.tocQuery).pipe(debounceTime(SEARCH_DEBOUNCE_MS)),
    { initialValue: '' },
  );

  private readonly index = computed(() => indexTree(this.tree()));
  protected readonly completeness = computed(() => treeCompleteness(this.tree()));
  protected readonly gapCount = computed(() => countGaps(this.tree()));
  protected readonly suggestionCount = computed(() => countWithSuggestions(this.tree()));

  private readonly contentFilter = computed<ContentFilter>(() => ({
    gaps: this.gapsOnly(),
    suggestions: this.suggestionsOnly(),
  }));
  private readonly filtered = computed(() => isContentFiltered(this.contentFilter()));

  /** The document as shown: the whole tree, or only what the content filters keep. */
  private readonly contentTree = computed(() => {
    const filter = this.contentFilter();
    return isContentFiltered(filter)
      ? filterRequirements(this.tree(), (r) => matchesContentFilter(r, filter), this.keepRefs())
      : this.tree();
  });

  /** Message when the (filtered) document is empty. */
  protected readonly emptyKey = computed(() =>
    this.suggestionsOnly()
      ? 'standards.workspace.noAiSuggestions'
      : this.gapsOnly()
        ? 'standards.gaps.none'
        : 'standards.workspace.empty',
  );

  /** The AI mapping status line shows for enabled standards whose API reports `last_mapping`. */
  protected readonly showMappingStatus = computed(() => {
    const std = this.standard();
    return !!std && std.enabled && std.last_mapping !== undefined;
  });
  /** Document positions of the full tree (filtered views keep this order). */
  private readonly fullOrder = computed(
    () => new Map(flattenSections(this.tree()).map((s, i) => [s.number, i] as const)),
  );
  private readonly sections = computed(() => {
    const fresh = this.filtered()
      ? flattenSections(this.contentTree(), this.fullOrder())
      : flattenSections(this.contentTree());
    // Reuse unchanged section views so an inline save re-renders only the
    // sections on its path (replaceRequirement keeps untouched nodes).
    const cache = new Map<string, SectionView>();
    const out = fresh.map((section) => {
      const prev = this.sectionCache.get(section.number);
      const same =
        prev &&
        prev.node === section.node &&
        prev.depth === section.depth &&
        prev.branch === section.branch &&
        prev.themeHeading === section.themeHeading;
      const view = same ? prev : section;
      cache.set(section.number, view);
      return view;
    });
    this.sectionCache = cache;
    return out;
  });
  private sectionCache = new Map<string, SectionView>();
  /** Section numbers in document order (prev / next, j / k, scroll-spy). */
  private readonly order = computed(() => this.sections().map((s) => s.number));
  private readonly position = computed(
    () => new Map(this.order().map((number, i) => [number, i] as const)),
  );
  protected readonly units = computed<RenderUnit[]>(() =>
    renderUnits(this.sections(), !!this.standard()?.has_licensed_text),
  );
  private readonly unitOf = computed(() => {
    const map = new Map<string, string>();
    for (const unit of this.units()) {
      unit.sections.forEach((s) => map.set(s.number, unit.key));
    }
    return map;
  });

  /** Previous / next section of every section (document order). */
  protected readonly links = computed(() => {
    const order = this.order();
    const nodes = this.index().nodes;
    const cache = new Map<string, SectionLink>();
    const link = (number: string | undefined): SectionLink | null => {
      const node = number ? nodes.get(number) : undefined;
      if (!node) {
        return null;
      }
      const prev = this.linkCache.get(node.number);
      const view =
        prev && prev.title === node.title ? prev : { number: node.number, title: node.title };
      cache.set(node.number, view);
      return view;
    };
    const map = new Map<string, { prev: SectionLink | null; next: SectionLink | null }>();
    order.forEach((number, i) =>
      map.set(number, { prev: link(order[i - 1]), next: link(order[i + 1]) }),
    );
    this.linkCache = cache;
    return map;
  });

  private linkCache = new Map<string, SectionLink>();

  protected readonly nav = computed(() => neighbours(this.order(), this.active()));

  protected readonly tocRows = computed(() =>
    tocRows(this.tree(), {
      expanded: this.tocExpanded(),
      query: this.debouncedQuery(),
      lang: this.language.active(),
      include: this.filtered() ? new Set(this.order()) : null,
    }),
  );

  private readonly activePath = computed(() => sectionPath(this.index(), this.active()));
  /** Only the current path opens on its own; manual expand / collapse is respected. */
  private readonly tocExpanded = computed(() =>
    effectiveTocExpansion(this.tocUserExpanded(), this.tocUserCollapsed(), this.activePath()),
  );
  protected readonly activePathSet = computed(() => new Set(this.activePath()));
  protected readonly breadcrumb = computed(() => {
    const nodes = this.index().nodes;
    return this.activePath()
      .map((number) => nodes.get(number))
      .filter((node): node is ClauseNode => !!node)
      .map((node) => ({ number: node.number, title: node.title }));
  });

  protected readonly tocClasses = computed(() => {
    if (this.isDesktop()) {
      return this.tocHidden() ? 'hidden' : 'relative flex flex-none';
    }
    return `fixed inset-y-0 left-0 z-40 flex w-[86vw] max-w-[340px] shadow-card transition-transform duration-200 motion-reduce:transition-none ${
      this.drawerOpen() ? 'translate-x-0' : '-translate-x-full'
    }`;
  });
  protected readonly tocInert = computed(() => !this.isDesktop() && !this.drawerOpen());
  /** The mobile drawer is open: it is a modal dialog and the page behind it is inert. */
  protected readonly drawerModal = computed(() => !this.isDesktop() && this.drawerOpen());

  private sub: Subscription | null = null;
  private loadedOrgId: string | null = null;
  private loadedKey: string | null = null;
  /** Section the URL is expected to show (set before we navigate ourselves). */
  private expectedNumber: string | null = null;
  private handledReq: string | null = null;
  private routeSynced = false;
  private spyLocked = false;
  private urlTimer: ReturnType<typeof setTimeout> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  private detachScroll: (() => void) | null = null;
  /** Element kept at the top while lazily rendered content above it appears. */
  private pinnedId: string | null = null;
  private pinTimer: ReturnType<typeof setTimeout> | null = null;
  private urlHoldUntil = 0;
  private lastScrollTop = 0;
  /** Came back via browser back / forward: restore the remembered state once. */
  private restoreFromMemory = untracked(
    () => this.router.currentNavigation()?.trigger === 'popstate',
  );
  private readonly clauseSubs = new Map<string, Subscription>();

  constructor() {
    this.restorePrefs();
    this.watchViewport();

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const key = this.key();
      if (this.loadedOrgId !== null && orgId !== this.loadedOrgId) {
        void this.router.navigateByUrl('/standards');
        return;
      }
      untracked(() => this.load(orgId, key, true));
    });

    // Route → document: deep links, back / forward, legacy ?req= links.
    effect(() => {
      const number = this.number() ?? null;
      const req = this.req() ?? null;
      const ready = !this.loading() && this.tree().length > 0;
      if (ready) {
        untracked(() => this.syncFromRoute(number, req));
      }
    });

    // Scroll-spy → current section.
    effect(() => {
      const crossing = this.scroll.crossing();
      const position = this.position();
      untracked(() => {
        if (this.spyLocked) {
          return;
        }
        const next = pickActiveSection(crossing, position, this.active());
        if (next && next !== this.active()) {
          this.setActive(next, true);
        }
      });
    });

    effect(() => {
      const el = this.scrollerRef()?.nativeElement;
      if (el) {
        untracked(() => this.attachScroller(el));
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      this.clauseSubs.forEach((s) => s.unsubscribe());
      this.remember();
      this.detachScroll?.();
      [this.urlTimer, this.settleTimer, this.highlightTimer, this.pinTimer].forEach(
        (t) => t && clearTimeout(t),
      );
    });
  }

  protected text(value: LocalizedText | null | undefined): string {
    return localized(value, this.language.active());
  }

  // --- Navigation ----------------------------------------------------------

  /** In-page navigation from a TOC / prev-next / breadcrumb link (router pushes history). */
  protected onNavigate(number: string): void {
    this.expectedNumber = number;
    if (!this.isDesktop()) {
      this.drawerOpen.set(false);
    }
    this.scrollToSection(number, 'smooth');
  }

  /** Same as onNavigate, for links in this template (plain left clicks only). */
  protected onNavigateLink(event: MouseEvent, number: string | null): void {
    if (
      !number ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    this.onNavigate(number);
  }

  /** Programmatic navigation (keyboard): scroll and push a history entry. */
  private go(number: string): void {
    this.onNavigate(number);
    void this.router.navigate(['/standards', this.key(), number]);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.standard()) {
      return;
    }
    if (event.key === 'Escape' && this.drawerModal()) {
      if (!event.defaultPrevented) {
        event.preventDefault();
        this.closeDrawer();
      }
      return;
    }
    if (this.pinnedId && SCROLL_KEYS.has(event.key)) {
      this.releasePin();
    }
    if (
      event.defaultPrevented ||
      this.licensedPanelOpen() ||
      this.document.querySelector('[aria-modal="true"]')
    ) {
      return;
    }
    const shortcut = shortcutFor(event);
    if (!shortcut) {
      return;
    }
    event.preventDefault();
    if (shortcut === 'search') {
      this.showToc();
      return;
    }
    const target = shortcut === 'next' ? this.nav().next : this.nav().prev;
    if (target) {
      this.go(target);
    }
  }

  private syncFromRoute(number: string | null, req: string | null): void {
    if (!req) {
      this.handledReq = null;
    }
    if (req && req !== this.handledReq) {
      this.handledReq = req;
      const clause = clauseOfRequirement(this.tree(), req);
      if (clause) {
        this.routeSynced = true;
        this.expectedNumber = number;
        this.revealRequirement(req, clause);
        return;
      }
    }
    if (this.routeSynced && number === this.expectedNumber) {
      return;
    }
    const initial = !this.routeSynced;
    this.routeSynced = true;
    this.expectedNumber = number;
    this.urlHoldUntil = Date.now() + DEEP_LINK_URL_HOLD_MS;
    if (initial && this.restoreFromMemory && this.restoreSnapshot(number)) {
      return;
    }
    const target = number && this.index().nodes.has(number) ? number : null;
    if (!target) {
      const first = this.order()[0] ?? null;
      if (first) {
        this.scrollToSection(first, 'instant');
      }
      return;
    }
    this.scrollToSection(target, initial ? 'instant' : 'smooth');
  }

  /** Expand, highlight and scroll to a requirement (deep link `?req=`). */
  private revealRequirement(ref: string, clause: string): void {
    if (this.filtered()) {
      this.keepRefs.update((set) => new Set(set).add(ref));
    }
    this.expandedRefs.update((set) => new Set(set).add(ref));
    this.highlightRef.set(ref);
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
    }
    this.highlightTimer = setTimeout(() => this.highlightRef.set(null), HIGHLIGHT_MS);
    this.urlHoldUntil = Date.now() + DEEP_LINK_URL_HOLD_MS;
    this.scrollToSection(clause, 'instant', requirementAnchorId(ref));
  }

  /**
   * Scroll the document to a section (or an element inside it): render its
   * unit, then scroll once rendered. The spy is paused until the scroll
   * settles, so the TOC doesn't flicker through the sections passed over.
   */
  private scrollToSection(number: string, mode: ScrollMode, elementId?: string): void {
    if (!this.position().has(number) && this.filtered()) {
      // The target is filtered out by a content filter: show everything again.
      this.gapsOnly.set(false);
      this.suggestionsOnly.set(false);
    }
    const unit = this.unitOf().get(number);
    if (!unit) {
      return;
    }
    this.releasePin(false);
    this.spyLocked = true;
    this.setActive(number, false);
    if (!this.renderedUnits().has(unit)) {
      this.renderedUnits.update((set) => new Set(set).add(unit));
    }
    afterNextRender(() => this.performScroll(elementId ?? sectionDomId(number), mode), {
      injector: this.injector,
    });
  }

  private performScroll(elementId: string, mode: ScrollMode): void {
    const scroller = this.scrollerRef()?.nativeElement;
    const el = this.document.getElementById(elementId);
    if (!scroller || !el) {
      this.spyLocked = false;
      return;
    }
    const top = this.offsetWithin(scroller, el);
    const distance = Math.abs(top - scroller.scrollTop);
    const smooth =
      mode === 'smooth' && !this.prefersReducedMotion() && distance < scroller.clientHeight * 3;
    this.scrollTo(scroller, top, smooth);
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
    }
    // Once the scroll ends, correct for chapters that rendered in the meantime.
    this.settleTimer = setTimeout(
      () => {
        const target = this.document.getElementById(elementId);
        if (target) {
          const corrected = this.offsetWithin(scroller, target);
          if (Math.abs(corrected - scroller.scrollTop) > 3) {
            this.scrollTo(scroller, corrected, false);
          }
        }
        this.settleTimer = null;
        this.pin(elementId);
      },
      smooth ? 700 : 60,
    );
  }

  /**
   * Keep `elementId` at the top while chapters above it render (their real
   * heights replace the placeholders) until the reader scrolls themselves.
   * The scroll-spy stays paused meanwhile, so the highlight stays on the target.
   */
  private pin(elementId: string): void {
    this.pinnedId = elementId;
    this.spyLocked = true;
    if (this.pinTimer) {
      clearTimeout(this.pinTimer);
    }
    this.pinTimer = setTimeout(() => this.releasePin(), PIN_MAX_MS);
  }

  /** The reader took over scrolling (or a new jump starts): stop re-anchoring. */
  private releasePin(unlockSpy = true): void {
    if (this.pinTimer) {
      clearTimeout(this.pinTimer);
      this.pinTimer = null;
    }
    const wasPinned = this.pinnedId !== null;
    this.pinnedId = null;
    if (unlockSpy && wasPinned && !this.settleTimer) {
      this.spyLocked = false;
    }
  }

  /** After content rendered above a pinned target, put it back at the top. */
  private reanchor(): void {
    const id = this.pinnedId;
    const scroller = this.scrollerRef()?.nativeElement;
    const el = id ? this.document.getElementById(id) : null;
    if (!scroller || !el) {
      return;
    }
    const top = this.offsetWithin(scroller, el);
    if (Math.abs(top - scroller.scrollTop) > 2) {
      this.scrollTo(scroller, top, false);
    }
  }

  private offsetWithin(scroller: HTMLElement, el: HTMLElement): number {
    const top =
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    return Math.max(0, Math.round(top - SCROLL_OFFSET));
  }

  private scrollTo(scroller: HTMLElement, top: number, smooth: boolean): void {
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    } else {
      scroller.scrollTop = top;
    }
  }

  /** Make `number` current: TOC highlight + its path expanded; spy updates also sync the URL. */
  private setActive(number: string, fromSpy: boolean): void {
    this.active.set(number);
    // A manual collapse only sticks while the reader stays on that path.
    const path = new Set(sectionPath(this.index(), number));
    const collapsed = this.tocUserCollapsed();
    if ([...collapsed].some((n) => !path.has(n))) {
      this.tocUserCollapsed.set(new Set([...collapsed].filter((n) => path.has(n))));
    }
    if (fromSpy) {
      this.scheduleUrlSync(number);
    }
  }

  private scheduleUrlSync(number: string): void {
    if (this.urlTimer) {
      clearTimeout(this.urlTimer);
    }
    this.urlTimer = setTimeout(
      () => {
        this.urlTimer = null;
        if (this.active() !== number || this.number() === number) {
          return;
        }
        this.expectedNumber = number;
        void this.router.navigate(['/standards', this.key(), number], { replaceUrl: true });
      },
      Math.max(URL_SYNC_MS, this.urlHoldUntil - Date.now()),
    );
  }

  private attachScroller(el: HTMLElement): void {
    this.detachScroll?.();
    this.scroll.attach(el);
    // Any scrolling gesture of the reader's own releases a pinned jump target.
    const release = (): void => this.releasePin();
    const onScroll = (): void => {
      this.lastScrollTop = el.scrollTop;
      if (this.spyLocked) {
        return;
      }
      if (isAtBottom(el.scrollTop, el.clientHeight, el.scrollHeight)) {
        const last = this.order()[this.order().length - 1];
        if (last && last !== this.active()) {
          this.setActive(last, true);
        }
      }
    };
    const gestures = ['wheel', 'touchstart', 'pointerdown'] as const;
    el.addEventListener('scroll', onScroll, { passive: true });
    gestures.forEach((type) => el.addEventListener(type, release, { passive: true }));
    this.detachScroll = () => {
      el.removeEventListener('scroll', onScroll);
      gestures.forEach((type) => el.removeEventListener(type, release));
    };
  }

  protected renderUnit(key: string): void {
    if (!this.renderedUnits().has(key)) {
      this.renderedUnits.update((set) => new Set(set).add(key));
      if (this.pinnedId) {
        afterNextRender(() => this.reanchor(), { injector: this.injector });
      }
    }
  }

  // --- TOC -------------------------------------------------------------------

  protected toggleTocNode(number: string): void {
    const onPath = this.activePath().includes(number);
    if (this.tocExpanded().has(number)) {
      this.tocUserExpanded.update((set) => {
        const next = new Set(set);
        next.delete(number);
        return next;
      });
      if (onPath) {
        this.tocUserCollapsed.update((set) => new Set(set).add(number));
      }
    } else {
      this.tocUserCollapsed.update((set) => {
        const next = new Set(set);
        next.delete(number);
        return next;
      });
      if (!onPath) {
        this.tocUserExpanded.update((set) => new Set(set).add(number));
      }
    }
  }

  protected collapseToc(): void {
    // Back to "only the current path": the highlight stays visible.
    this.tocUserExpanded.set(new Set());
    this.tocUserCollapsed.set(new Set());
  }

  /** Mobile drawer: keep Tab inside while it is open as a modal. */
  protected onDrawerKeydown(event: KeyboardEvent): void {
    const aside = this.tocAside()?.nativeElement;
    if (aside && this.drawerModal() && !event.defaultPrevented) {
      trapTabKey(aside, event);
    }
  }

  protected setGapsOnly(on: boolean): void {
    this.applyFilter(() => this.gapsOnly.set(on));
  }

  protected setSuggestionsOnly(on: boolean): void {
    this.applyFilter(() => this.suggestionsOnly.set(on));
  }

  private applyFilter(change: () => void): void {
    this.keepRefs.set(new Set());
    change();
    const current = this.active();
    const target = current && this.position().has(current) ? current : (this.order()[0] ?? null);
    if (target) {
      this.scrollToSection(target, 'instant');
    }
  }

  protected showToc(): void {
    if (this.isDesktop()) {
      if (this.tocHidden()) {
        this.tocHidden.set(false);
        this.savePrefs();
      }
    } else {
      this.drawerOpen.set(true);
    }
    afterNextRender({ write: () => this.toc()?.focusSearch() }, { injector: this.injector });
  }

  protected hideToc(): void {
    if (this.isDesktop()) {
      this.tocHidden.set(true);
      this.savePrefs();
      afterNextRender(
        { write: () => this.tocButton()?.nativeElement.focus() },
        { injector: this.injector },
      );
    } else {
      this.closeDrawer();
    }
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
    afterNextRender(
      { write: () => this.tocButton()?.nativeElement.focus() },
      { injector: this.injector },
    );
  }

  protected startResize(event: PointerEvent): void {
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startWidth = this.tocWidth();
    handle.setPointerCapture?.(event.pointerId);
    const move = (e: PointerEvent): void =>
      this.tocWidth.set(clampWidth(startWidth + e.clientX - startX));
    const up = (): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      this.savePrefs();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  protected resizeKey(event: KeyboardEvent): void {
    const width = this.tocWidth();
    const targets: Record<string, number> = {
      ArrowLeft: width - 16,
      ArrowRight: width + 16,
      Home: TOC_MIN,
      End: TOC_MAX,
    };
    if (!(event.key in targets)) {
      return;
    }
    event.preventDefault();
    this.tocWidth.set(clampWidth(targets[event.key]));
    this.savePrefs();
  }

  // --- Inline work ---------------------------------------------------------

  protected toggleIn(target: WritableSignal<ReadonlySet<string>>, value: string): void {
    target.update((set) => {
      const next = new Set(set);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  /** An assessment was saved: patch the tree, recomputing every roll-up on its path. */
  protected onRequirementUpdated(detail: RequirementDetail): void {
    if (this.filtered()) {
      this.keepRefs.update((set) => new Set(set).add(detail.ref));
    }
    this.tree.update((tree) => applyRequirementDetails(tree, [detail]));
  }

  /** Evidence changed: the server recomputes the status, so refetch that clause and patch it in. */
  protected onLinksChanged(ref: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const clause = clauseOfRequirement(this.tree(), ref);
    if (!orgId || !clause) {
      return;
    }
    if (this.filtered()) {
      this.keepRefs.update((set) => new Set(set).add(ref));
    }
    this.clauseSubs.get(clause)?.unsubscribe();
    this.clauseSubs.set(
      clause,
      this.api.getClause(orgId, this.key(), clause).subscribe({
        next: (detail) => {
          this.tree.update((tree) => applyRequirementDetails(tree, detail.requirements));
          this.setLicensed(clause, { status: 'loaded', text: detail.licensed_text });
        },
        error: () => undefined,
      }),
    );
  }

  protected toggleLicensed(number: string): void {
    this.toggleIn(this.openLicensed, number);
    const state = this.licensed().get(number);
    if (
      !this.openLicensed().has(number) ||
      state?.status === 'loaded' ||
      state?.status === 'loading'
    ) {
      return;
    }
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.setLicensed(number, { status: 'loading' });
    this.api.getClause(orgId, this.key(), number).subscribe({
      next: (detail) => this.setLicensed(number, { status: 'loaded', text: detail.licensed_text }),
      error: () => this.setLicensed(number, { status: 'error' }),
    });
  }

  private setLicensed(number: string, state: LicensedState): void {
    this.licensed.update((map) => new Map(map).set(number, state));
  }

  // --- Jobs ----------------------------------------------------------------

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
        if (isAiNotConfigured(err)) {
          this.availability.markUnavailable();
        }
        this.mapStartError.set(standardsErrorKey(err, 'map'));
      },
    });
  }

  protected onMapFinished(job: StandardJob | null): void {
    this.mapRunning.set(false);
    const jobId = this.mapJobId();
    if (jobId) {
      this.finishedMapJobs.add(jobId);
    }
    if (job?.status === 'done') {
      // The status line ("last mapped …") takes over from the progress bar.
      this.mapJobId.set(null);
      this.load(this.selectedOrg.currentOrgId(), this.key(), false);
    }
  }

  /**
   * Enabling a standard queues a whole-standard mapping on its own: watch a
   * running `last_mapping` like one started here (once per job).
   */
  private watchRunningMapping(std: StandardSummary | null): void {
    const mapping = std?.enabled ? std.last_mapping : null;
    if (
      !mapping ||
      mappingState(mapping) !== 'running' ||
      this.mapJobId() ||
      this.finishedMapJobs.has(mapping.job_id)
    ) {
      return;
    }
    this.mapRunning.set(true);
    this.mapJobId.set(mapping.job_id);
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
      // Newly extracted text: drop the per-clause cache and refresh has_licensed_text.
      this.licensed.set(new Map());
      this.load(this.selectedOrg.currentOrgId(), this.key(), false);
    }
  }

  // --- Loading & preferences -----------------------------------------------

  private load(orgId: string | null, key: string, showSpinner: boolean): void {
    this.sub?.unsubscribe();
    this.loadedOrgId = orgId;
    if (key !== this.loadedKey) {
      this.remember();
      this.loadedKey = key;
      this.resetDocumentState();
    }
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
        const std = list.find((s) => s.key === key) ?? null;
        this.standard.set(std);
        this.tree.set(tree);
        this.watchRunningMapping(std);
        this.loading.set(false);
      },
      error: () => {
        if (showSpinner) {
          this.standard.set(null);
          this.tree.set([]);
        }
        this.loading.set(false);
      },
    });
  }

  /** Remember what is open and where the reader is, for Back from an evidence link. */
  private remember(): void {
    const orgId = this.loadedOrgId;
    const key = this.loadedKey;
    if (!orgId || !key || !this.routeSynced) {
      return;
    }
    this.memory.save(orgId, key, {
      active: this.active(),
      scrollTop: this.lastScrollTop,
      expandedRefs: this.expandedRefs(),
      renderedUnits: this.renderedUnits(),
      openGuidance: this.openGuidance(),
      openLicensed: this.openLicensed(),
      tocUserExpanded: this.tocUserExpanded(),
      gapsOnly: this.gapsOnly(),
      suggestionsOnly: this.suggestionsOnly(),
      keepRefs: this.keepRefs(),
    });
  }

  /**
   * Back / forward into the workspace: reopen what was open and return to the
   * exact scroll position (same chapters rendered, so the same heights).
   * Returns false when there is nothing to restore for this URL.
   */
  private restoreSnapshot(number: string | null): boolean {
    this.restoreFromMemory = false;
    const orgId = this.loadedOrgId;
    const key = this.loadedKey;
    const snap = orgId && key ? this.memory.get(orgId, key) : null;
    if (!snap || (number !== null && number !== snap.active)) {
      return false;
    }
    this.gapsOnly.set(snap.gapsOnly);
    this.suggestionsOnly.set(snap.suggestionsOnly);
    this.keepRefs.set(snap.keepRefs);
    this.expandedRefs.set(snap.expandedRefs);
    this.openGuidance.set(snap.openGuidance);
    this.openLicensed.set(snap.openLicensed);
    this.tocUserExpanded.set(snap.tocUserExpanded);
    this.renderedUnits.set(snap.renderedUnits);
    this.spyLocked = true;
    if (snap.active) {
      this.setActive(snap.active, false);
    }
    afterNextRender(
      () => {
        const scroller = this.scrollerRef()?.nativeElement;
        if (scroller) {
          scroller.scrollTop = snap.scrollTop;
          this.lastScrollTop = snap.scrollTop;
        }
        this.settleTimer = setTimeout(() => {
          this.settleTimer = null;
          this.spyLocked = false;
        }, 150);
      },
      { injector: this.injector },
    );
    return true;
  }

  private resetDocumentState(): void {
    this.routeSynced = false;
    this.expectedNumber = null;
    this.handledReq = null;
    this.active.set(null);
    this.renderedUnits.set(new Set());
    this.tocUserExpanded.set(new Set());
    this.tocUserCollapsed.set(new Set());
    this.expandedRefs.set(new Set());
    this.openGuidance.set(new Set());
    this.openLicensed.set(new Set());
    this.licensed.set(new Map());
    this.keepRefs.set(new Set());
  }

  private watchViewport(): void {
    const view = this.document.defaultView;
    if (!view?.matchMedia) {
      return;
    }
    const query = view.matchMedia('(min-width: 1024px)');
    this.isDesktop.set(query.matches);
    const onChange = (e: MediaQueryListEvent): void => {
      this.isDesktop.set(e.matches);
      this.drawerOpen.set(false);
    };
    query.addEventListener?.('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener?.('change', onChange));
  }

  private prefersReducedMotion(): boolean {
    return !!this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  private restorePrefs(): void {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(PREFS_KEY);
      const prefs = raw ? (JSON.parse(raw) as WorkspacePrefs) : null;
      if (typeof prefs?.tocWidth === 'number') {
        this.tocWidth.set(clampWidth(prefs.tocWidth));
      }
      if (typeof prefs?.tocHidden === 'boolean') {
        this.tocHidden.set(prefs.tocHidden);
      }
    } catch {
      // Storage unavailable (private mode, blocked): defaults are fine.
    }
  }

  private savePrefs(): void {
    try {
      const prefs: WorkspacePrefs = { tocWidth: this.tocWidth(), tocHidden: this.tocHidden() };
      this.document.defaultView?.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Not persisted — a per-viewer convenience only.
    }
  }
}
