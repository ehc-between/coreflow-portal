import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../core/ai/ai-availability';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { LanguageService } from '../../core/i18n/language.service';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { WatchButton } from '../activity/watch-button';
import { Attachments } from '../attachments/attachments';
import { SupportsRequirements } from '../requirement-links/supports-requirements';
import { Icon } from '../ui/icon/icon';
import { MenuItem, OverflowMenu } from '../ui/overflow-menu/overflow-menu';
import { Breadcrumb, PageHeader } from '../ui/page-header/page-header';
import { Comments } from './comments';
import { ConnectionMap } from './connection-map';
import { ConnectionsPanel } from './connections-panel';
import { ConnectionsStore } from './connections-store';
import { CreateFromHere } from './create-from-here';
import { provideKitScope } from './kit-scope';
import { RecordMissingItem, RecordPageContext } from './record-page-context';
import { RelatedItems } from './related-items';
import { RevisionHistory } from './revision-history';
import { Timeline } from './timeline';

export type { RecordMissingItem } from './record-page-context';

/** The sections a record detail page can show. */
export type RecordTab =
  | 'details'
  | 'related'
  | 'activity'
  | 'comments'
  | 'attachments'
  | 'revisions'
  | 'tasks';

export const DEFAULT_RECORD_TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
];

const KNOWN_TABS = new Set<string>([...DEFAULT_RECORD_TABS, 'revisions', 'tasks']);

/** Tabs that always sit in the tab row (U29): Detaljer · Relatert · Aktivitet. */
const ROW_TABS = new Set<RecordTab>(['details', 'related', 'activity']);
/** Tabs in the row before the rest go under "Mer ▾". */
export const RECORD_ROW_TABS = 3;

/**
 * Split a page's tabs into the tab row and "Mer ▾" (U29: one row of at most
 * four: Detaljer · Relatert · Aktivitet · Mer). Details, related and activity
 * stay in the row; when a page has fewer of them, the next tabs fill the row.
 * A single leftover tab is shown in the row rather than alone under "Mer".
 */
export function splitRecordTabs(tabs: readonly RecordTab[]): {
  row: RecordTab[];
  more: RecordTab[];
} {
  const row = tabs.filter((t) => ROW_TABS.has(t)).slice(0, RECORD_ROW_TABS);
  for (const tab of tabs) {
    if (row.length >= RECORD_ROW_TABS) break;
    if (!row.includes(tab)) row.push(tab);
  }
  const ordered = tabs.filter((t) => row.includes(t));
  const more = tabs.filter((t) => !row.includes(t));
  return more.length === 1 ? { row: [...ordered, ...more], more: [] } : { row: ordered, more };
}

let nextId = 0;

/**
 * Standard detail page of a record (docs/ux-guide.md, "Detail"; simplify U29,
 * "record page diet"):
 *
 *   app-page-header — breadcrumbs, h1 (`title` / `titleKey`), `[meta]` line
 *   (code · type · status), `[primary]` / `[secondary]` / `[overflow]` actions,
 *   the module's `settingsLink` gear and the page's "?" (help);
 *   one tab row: Detaljer · Relatert · Aktivitet · Mer ▾ (comments,
 *   attachments, revisions, tasks), with count badges (`counts`);
 *   an aside with ordered slots: "Hva mangler" (`missing` plus what the kit
 *   knows is waiting: suggested requirements and links), `[aside-requirements]`
 *   (Krav dette dokumenterer; with `requirementsPanel` the default
 *   `app-supports-requirements` renders, compact: three chips and "+N"),
 *   `[aside-connections]` (compact connections panel), `[aside]` (module
 *   summary) and `[aside-learn]`.
 *
 * "Mer ⋯" in the header holds what used to sit on the page: Følg (the follow
 * button), Lag ny fra denne (`createFlows`), Vis kart, Spør om koblingene and
 * Foreslå flere krav, then the page's own `[overflow]` items. The page's help
 * strip (`[help]`) shows as the "?" in the header only. The module's
 * sub-navigation (`[nav]`) is not shown on record pages: the breadcrumbs lead
 * back to the module. Kit pieces find the page through {@link RecordPageContext}.
 *
 * Connections (P4): by default `[aside-connections]` renders
 * `app-connections-panel`, and the Related tab gets its count from the same data
 * (unless `counts.related` is passed). `connectionsPanel` / `createFlows` turn
 * them off.
 *
 * Older pages keep working: `[header]` is shown above the heading area (pages that
 * render their own h1 there pass no title), and `[actions]` sit with the
 * secondary actions. "Details" is the default slot and "Tasks" the `[tasks]` slot
 * (project F2's `<app-entity-tasks>`); related items, activity, comments,
 * attachments and revisions are the shared kit components, rendered when their
 * tab is opened (`customActivity` swaps the activity tab for the `[activity]`
 * slot). `[aside]` is a side column on wide screens (below the tabs on small
 * ones). The open tab is kept in the `?tab=` query parameter so links and
 * reloads return to it. Page context for the assistant is registered by the
 * module page, not here.
 */
@Component({
  selector: 'app-record-detail-layout',
  imports: [
    RouterLink,
    TranslocoPipe,
    PageHeader,
    SupportsRequirements,
    Attachments,
    Comments,
    ConnectionMap,
    ConnectionsPanel,
    CreateFromHere,
    Icon,
    MenuItem,
    OverflowMenu,
    RelatedItems,
    RevisionHistory,
    Timeline,
    WatchButton,
  ],
  // One connections store per page: the aside panel, the Related tab and its
  // count share it (P4). One page context: the kit pieces projected into the
  // page hand their controls to the layout (U29).
  providers: [ConnectionsStore, RecordPageContext],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [title]="title()"
        [titleKey]="titleKey()"
        [titleParams]="titleParams()"
        [descriptionKey]="descriptionKey()"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink()"
        [backLink]="backLink() ?? null"
        [backLabelKey]="backLabelKey() ?? 'kit.detail.back'"
      >
        <ng-container ngProjectAs="[lead]"><ng-content select="[header]" /></ng-container>
        <ng-container ngProjectAs="[meta]"><ng-content select="[meta]" /></ng-container>
        <ng-container ngProjectAs="[secondary]">
          @if (aiAvailable()) {
            <!-- §2.7: every assistant action of the page in one "Spør KI" menu. -->
            <app-overflow-menu
              icon="spark"
              [label]="'kit.detail.ask.label' | transloco"
              triggerTestId="record-ask-menu"
            >
              <ng-content select="[ask]" />
              @if (anatomy()) {
                @if (connectionsPanel()) {
                  <button appMenuItem type="button" data-testid="record-ask" (click)="askAbout()">
                    <app-icon name="spark" [size]="15" />
                    {{ 'kit.connections.askAbout' | transloco }}
                  </button>
                }
                @if (page.requirements()?.suggestMore; as suggestMore) {
                  <button
                    appMenuItem
                    type="button"
                    data-testid="record-find-requirements"
                    (click)="suggestMore()"
                  >
                    <app-icon name="spark" [size]="15" />
                    {{ 'kit.detail.findRequirements' | transloco }}
                  </button>
                }
              }
            </app-overflow-menu>
          }
          <ng-content select="[actions]" /><ng-content select="[secondary]" />
        </ng-container>
        <ng-container ngProjectAs="[primary]"><ng-content select="[primary]" /></ng-container>
        <ng-container ngProjectAs="[overflow]">
          @if (watch()) {
            <app-watch-button variant="menu" [entityType]="entityType()" [entityId]="entityId()" />
          }
          @if (createFlows()) {
            <app-create-from-here
              variant="items"
              [entityType]="entityType()"
              [entityId]="entityId()"
            />
          }
          @if (connectionsPanel()) {
            <button
              appMenuItem
              type="button"
              data-testid="record-show-map"
              (click)="mapOpen.set(true)"
            >
              <app-icon name="grid" [size]="15" />
              {{ 'kit.connections.showMap' | transloco }}
            </button>
            @if (aiAvailable() && !anatomy()) {
              <button appMenuItem type="button" data-testid="record-ask" (click)="askAbout()">
                <app-icon name="spark" [size]="15" />
                {{ 'kit.connections.askAbout' | transloco }}
              </button>
            }
          }
          @if (!anatomy() || !aiAvailable()) {
            @if (page.requirements()?.suggestMore; as suggestMore) {
              <button
                appMenuItem
                type="button"
                data-testid="record-find-requirements"
                (click)="suggestMore()"
              >
                <app-icon name="spark" [size]="15" />
                {{ 'kit.detail.findRequirements' | transloco }}
              </button>
            }
          }
          <div role="separator" class="my-1 border-t border-border last:hidden"></div>
          <ng-content select="[overflow]" />
        </ng-container>
        <ng-container ngProjectAs="[page-help]">
          @if (page.help(); as openHelp) {
            <button
              type="button"
              data-testid="record-help"
              aria-haspopup="dialog"
              [attr.aria-label]="'ui.help.open' | transloco"
              [title]="'ui.help.open' | transloco"
              class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-2.5 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              (click)="openHelp()"
            >
              <span
                class="flex h-5 w-5 items-center justify-center rounded-full border border-current text-meta leading-none font-bold"
                aria-hidden="true"
                >?</span
              >
              @if (beginner()) {
                <span class="hidden sm:inline" aria-hidden="true">{{
                  'ui.help.open' | transloco
                }}</span>
              }
            </button>
          }
        </ng-container>
      </app-page-header>
      <!-- U29: no module sub-navigation on record pages (the breadcrumbs lead back). -->
      @if (showModuleNav) {
        <ng-content select="[nav]" />
      }
      <ng-content select="[help]" />

      <div
        [class]="
          anatomy()
            ? 'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr] lg:items-start'
            : 'flex flex-col gap-6 lg:flex-row lg:items-start'
        "
      >
        <!-- §2.7 "Hovedinformasjon": first on every screen size. -->
        <div class="min-w-0 empty:hidden lg:col-start-1 lg:row-start-1">
          <ng-content select="[record-lead]" />
        </div>
        <div
          class="min-w-0 flex-1"
          [class.order-3]="anatomy()"
          [class.lg:col-start-1]="anatomy()"
          [class.lg:row-start-2]="anatomy()"
        >
          <div class="mb-4 flex items-end border-b border-border">
            <div
              role="tablist"
              data-tour="kit-tabs"
              [attr.aria-label]="'kit.detail.tabs' | transloco"
              class="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              @for (tab of rowTabs(); track tab) {
                <button
                  #tabButton
                  type="button"
                  role="tab"
                  [id]="tabId(tab)"
                  [attr.aria-selected]="tab === active()"
                  [attr.aria-controls]="panelId"
                  [tabindex]="tab === active() ? 0 : -1"
                  class="-mb-px border-b-2 px-3 py-2 text-ui font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  [class]="
                    tab === active()
                      ? 'border-accent text-fg'
                      : 'border-transparent text-fg-muted hover:text-fg'
                  "
                  (click)="select(tab)"
                  (keydown)="onTabKeydown($event)"
                  [attr.data-testid]="'tab-' + tab"
                >
                  {{ tabLabelKey(tab) | transloco }}
                  @if (countFor(tab); as count) {
                    <span
                      class="ml-1 rounded-full bg-surface-2 px-1.5 py-px text-micro font-semibold text-fg-muted"
                      [attr.data-testid]="'tab-count-' + tab"
                      >{{ count }}</span
                    >
                  }
                </button>
              }
            </div>
            @if (moreTabs().length > 0) {
              <app-overflow-menu
                class="flex-none"
                variant="tab"
                [active]="activeInMore()"
                [label]="moreLabel()"
                data-testid="tab-more"
              >
                @for (tab of moreTabs(); track tab) {
                  <button
                    appMenuItem
                    type="button"
                    [attr.aria-current]="tab === active() ? 'true' : null"
                    [class.font-semibold]="tab === active()"
                    (click)="select(tab)"
                    [attr.data-testid]="'tab-' + tab"
                  >
                    <span class="flex-1">{{ tabLabelKey(tab) | transloco }}</span>
                    @if (countFor(tab); as count) {
                      <span
                        class="rounded-full bg-surface-2 px-1.5 py-px text-micro font-semibold text-fg-muted"
                        [attr.data-testid]="'tab-count-' + tab"
                        >{{ count }}</span
                      >
                    }
                  </button>
                }
              </app-overflow-menu>
            }
          </div>

          <div
            role="tabpanel"
            [id]="panelId"
            [attr.aria-labelledby]="activeInMore() ? null : tabId(active())"
            [attr.aria-label]="activeInMore() ? (tabLabelKey(active()) | transloco) : null"
            tabindex="0"
            class="outline-none"
          >
            <div [hidden]="active() !== 'details'">
              <ng-content />
            </div>
            <div [hidden]="active() !== 'tasks'">
              <ng-content select="[tasks]" />
            </div>
            <div [hidden]="active() !== 'activity' || !customActivity()">
              <ng-content select="[activity]" />
            </div>
            @switch (active()) {
              @case ('related') {
                <app-related-items
                  [entityType]="entityType()"
                  [entityId]="entityId()"
                  [canEdit]="canEdit()"
                  [linkTypes]="linkTypes()"
                />
              }
              @case (customActivity() ? '' : 'activity') {
                <app-timeline
                  [entityType]="entityType()"
                  [entityId]="entityId()"
                  [includeAudit]="includeAudit()"
                />
              }
              @case ('comments') {
                <app-comments
                  [entityType]="entityType()"
                  [entityId]="entityId()"
                  [canComment]="canComment()"
                />
              }
              @case ('attachments') {
                <app-attachments
                  [entityType]="entityType()"
                  [entityId]="entityId()"
                  [canEdit]="canEdit()"
                />
              }
              @case ('revisions') {
                <app-revision-history
                  [entityType]="entityType()"
                  [entityId]="entityId()"
                  [fieldLabels]="fieldLabels()"
                />
              }
            }
          </div>
        </div>

        <aside
          class="flex w-full min-w-0 flex-col gap-4 empty:hidden lg:w-[300px] lg:flex-none"
          [class.order-2]="anatomy()"
          [class.lg:col-start-2]="anatomy()"
          [class.lg:row-start-1]="anatomy()"
          [class.lg:row-span-2]="anatomy()"
          [attr.aria-label]="'ui.detail.aside' | transloco"
        >
          <!-- §2.7: one "Oppfølging" card (anatomy) or the separate panels (legacy). -->
          <section
            [class]="
              anatomy()
                ? 'flex flex-col rounded-card border border-border bg-surface shadow-card'
                : 'contents'
            "
            [attr.aria-labelledby]="anatomy() ? panelId + '-follow-up' : null"
            [attr.data-testid]="anatomy() ? 'record-follow-up' : null"
          >
            @if (anatomy()) {
              <h2
                [id]="panelId + '-follow-up'"
                class="px-4 pt-4 pb-1 font-display text-card font-bold text-fg"
              >
                {{ 'kit.detail.followUp.title' | transloco }}
              </h2>
            }
            @if (todoItems().length > 0) {
              <section
                [class]="
                  anatomy()
                    ? 'px-4 pt-2 pb-4'
                    : 'rounded-card border border-warn/30 bg-warn-soft/50 p-4'
                "
                [attr.aria-labelledby]="panelId + '-missing'"
                data-testid="record-missing"
              >
                <h2
                  [id]="panelId + '-missing'"
                  [class]="
                    anatomy()
                      ? 'sr-only'
                      : 'mb-2 flex items-center gap-2 font-display text-card font-bold text-fg'
                  "
                >
                  {{ 'kit.detail.missing.title' | transloco }}
                  <span
                    class="rounded-full bg-surface px-1.5 text-micro font-semibold text-fg-muted"
                    data-testid="record-missing-count"
                    >{{ todoItems().length }}</span
                  >
                </h2>
                <ul class="flex flex-col" [class]="anatomy() ? 'gap-2' : 'gap-1.5'">
                  @for (item of todoItems(); track item.key) {
                    <li
                      data-testid="record-missing-item"
                      [class.flex]="anatomy()"
                      [class.gap-2]="anatomy()"
                    >
                      @if (anatomy()) {
                        <span
                          aria-hidden="true"
                          class="mt-1.5 h-2 w-2 flex-none rounded-full bg-warn"
                        ></span>
                      }
                      @if (item.link) {
                        <a
                          [routerLink]="item.link"
                          [queryParams]="item.queryParams"
                          [fragment]="item.fragment"
                          class="inline-flex min-h-6 items-start gap-1 text-ui font-semibold text-fg hover:text-accent hover:underline"
                          >{{ item.labelKey | transloco: item.params }}
                          <span aria-hidden="true" class="text-accent">→</span></a
                        >
                      } @else {
                        <button
                          type="button"
                          class="inline-flex min-h-6 items-start gap-1 text-left text-ui font-semibold text-fg hover:text-accent hover:underline"
                          (click)="item.action?.()"
                        >
                          {{ item.labelKey | transloco: item.params }}
                          <span aria-hidden="true" class="text-accent">→</span>
                        </button>
                      }
                    </li>
                  }
                </ul>
              </section>
            }
            <div
              [class]="
                anatomy()
                  ? 'border-t border-border px-4 py-4 empty:hidden [&_h2]:font-display [&_h2]:text-ui'
                  : 'contents'
              "
              data-testid="record-follow-up-requirements"
            >
              <ng-content select="[aside-requirements]">
                @if (requirementsPanel()) {
                  <app-supports-requirements
                    [entityType]="entityType()"
                    [entityId]="entityId()"
                    [canEdit]="canEdit()"
                  />
                }
              </ng-content>
              @if (anatomy() && pendingRequirements(); as reqs) {
                <button
                  type="button"
                  class="mt-2 inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
                  data-testid="record-confirm-requirements"
                  (click)="reqs.review()"
                >
                  {{
                    (reqs.pending === 1
                      ? 'kit.detail.followUp.confirmOne'
                      : 'kit.detail.followUp.confirm'
                    ) | transloco: { count: reqs.pending }
                  }}
                  <span aria-hidden="true">→</span>
                </button>
              }
            </div>
            <div
              [class]="anatomy() ? 'border-t border-border px-4 py-4' : 'contents'"
              data-testid="record-follow-up-connections"
            >
              <ng-content select="[aside-connections]">
                @if (connectionsPanel()) {
                  <app-connections-panel
                    [entityType]="entityType()"
                    [entityId]="entityId()"
                    [canEdit]="canEdit()"
                    [relatedTab]="hasRelatedTab()"
                    [compact]="true"
                    [variant]="anatomy() ? 'section' : 'card'"
                    [lastTypes]="connectionsLast()"
                    (showAll)="showRelated()"
                  />
                }
              </ng-content>
              <ng-content select="[follow-up-connections]" />
            </div>
            <div
              [class]="
                anatomy()
                  ? 'rounded-b-card border-t border-border bg-surface-2/50 px-4 py-3 empty:hidden'
                  : 'contents'
              "
            >
              <ng-content select="[follow-up-meta]" />
            </div>
          </section>
          <ng-content select="[aside]" />
          <ng-content select="[aside-learn]" />
        </aside>
      </div>
    </div>

    @if (connectionsPanel()) {
      <app-connection-map
        [open]="mapOpen()"
        [entityType]="entityType()"
        [entityId]="entityId()"
        (closed)="mapOpen.set(false)"
      />
    }
  `,
})
export class RecordDetailLayout {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly ai = inject(AiAvailability);
  private readonly ask = inject(AskPanelService);
  protected readonly page = inject(RecordPageContext);
  protected readonly beginner = inject(GuidanceService).isBeginner;

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** h1 as an i18n key. Pages that render their own h1 in `[header]` leave it unset. */
  readonly titleKey = input<string | undefined>(undefined);
  readonly titleParams = input<Record<string, unknown> | undefined>(undefined);
  /** h1 as literal text (the record's title); wins over `titleKey`. */
  readonly title = input<string | null | undefined>(null);
  readonly descriptionKey = input<string | null | undefined>(null);
  /** Module › sub-area › record. */
  readonly breadcrumbs = input<readonly Breadcrumb[]>([]);
  /** Gear link to the module's settings. */
  readonly settingsLink = input<string | readonly unknown[] | null | undefined>(null);
  /** Count badges on the tabs, e.g. `{ related: 3, attachments: 2 }` (0 and unset show none). */
  readonly counts = input<Partial<Record<RecordTab, number>> | undefined>(undefined);
  /** Render the default "Krav dette dokumenterer" panel in `[aside-requirements]`. */
  readonly requirementsPanel = input(false);
  /**
   * Render the default connections panel in `[aside-connections]` (P4): what the
   * record is connected to and "Link to…"; "Vis kart" and "Spør om koblingene"
   * are in "Mer ⋯".
   */
  readonly connectionsPanel = input(true);
  /** Entity types the connections part lists last (children such as measurements). */
  readonly connectionsLast = input<readonly string[]>([]);
  /**
   * Use the detail-page anatomy (docs/ux-guide.md §2.7): `[record-lead]`
   * ("Hovedinformasjon") first, one "Oppfølging" card in the aside (what is
   * missing, requirements, connections, `[follow-up-meta]`), assistant actions in
   * the header's "Spør KI" menu (`[ask]`), and on phones lead, card, then tabs.
   */
  readonly anatomy = input(false);
  /** Offer "Lag ny fra denne" in "Mer ⋯" (P4). */
  readonly createFlows = input(true);
  /** Offer "Følg" in "Mer ⋯" (U29; hidden by itself for types that can't be followed). */
  readonly watch = input(true);
  /**
   * What the record still needs, for the "Hva mangler" box (U29), e.g.
   * `[{ key: 'owner', labelKey: 'risk.missing.owner', link: [...] }]`. The kit
   * adds suggested requirements and links that wait for a decision.
   */
  readonly missing = input<readonly RecordMissingItem[]>([]);
  readonly tabs = input<readonly RecordTab[]>(DEFAULT_RECORD_TABS);
  /**
   * Module wording for a tab, e.g. `{ tasks: 'contracts.detail.obligationsTab' }`
   * when the tasks slot holds the contract's obligations.
   */
  readonly tabLabels = input<Partial<Record<RecordTab, string>> | undefined>(undefined);
  /** Whether the user can edit the record (links, attachments). */
  readonly canEdit = input(false);
  readonly canComment = input(true);
  /**
   * The module renders its own case history in the `[activity]` slot instead of
   * the generic timeline (one history per record, not two that disagree).
   */
  readonly customActivity = input(false);
  /** Start the activity tab with audit-log rows (for `audit:read` holders). */
  readonly includeAudit = input(false);
  /** Snapshot field -> i18n key, for the revisions tab. */
  readonly fieldLabels = input<Readonly<Record<string, string>> | undefined>(undefined);
  /** Limit the related tab to these link types. */
  readonly linkTypes = input<readonly string[] | undefined>(undefined);
  /** Router link of the "back to list" link (hidden when unset). */
  readonly backLink = input<string | readonly unknown[] | undefined>(undefined);
  readonly backLabelKey = input<string | undefined>(undefined);

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private readonly connections = inject(ConnectionsStore);

  protected readonly panelId = `cf-record-panel-${++nextId}`;
  /** The module sub-navigation is never shown on a record page (U29). */
  protected readonly showModuleNav = false;
  protected readonly mapOpen = signal(false);
  protected readonly aiAvailable = computed(() => !this.ai.unavailable());

  protected readonly visibleTabs = computed(() => {
    const tabs = this.tabs().filter((t) => KNOWN_TABS.has(t));
    return tabs.length > 0 ? tabs : DEFAULT_RECORD_TABS;
  });

  private readonly split = computed(() => splitRecordTabs(this.visibleTabs()));
  protected readonly rowTabs = computed(() => this.split().row);
  protected readonly moreTabs = computed(() => this.split().more);

  /** The live `?tab=` (a link to the same record without it opens the first tab again). */
  private readonly requestedTab = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('tab'))),
    { initialValue: this.route.snapshot.queryParamMap.get('tab') },
  );

  protected readonly active = linkedSignal<RecordTab>(() => {
    const requested = this.requestedTab();
    const tabs = this.visibleTabs();
    return tabs.find((t) => t === requested) ?? tabs[0];
  });

  protected readonly activeInMore = computed(() => this.moreTabs().includes(this.active()));

  /** "Mer", or the name of the open tab when it is one of "Mer"'s. */
  protected readonly moreLabel = computed(() =>
    this.language.translate(
      this.activeInMore() ? this.tabLabelKey(this.active()) : 'kit.detail.more',
    ),
  );

  protected readonly hasRelatedTab = computed(() => this.visibleTabs().includes('related'));

  /** The "Hva mangler" lines: the page's own, then the decisions the kit knows are waiting. */
  protected readonly missingItems = computed<readonly RecordMissingItem[]>(() => {
    const items = [...this.missing()];
    const reqs = this.page.requirements();
    if (reqs && reqs.pending > 0) {
      items.push({
        key: 'kit:requirements',
        labelKey:
          reqs.pending === 1
            ? 'kit.detail.missing.requirementsOne'
            : 'kit.detail.missing.requirements',
        params: { count: reqs.pending },
        action: () => reqs.review(),
      });
    }
    const links = this.connectionsPanel() && this.canEdit() ? this.connections.suggestions() : [];
    if (links.length > 0 && this.hasRelatedTab()) {
      items.push({
        key: 'kit:links',
        labelKey: links.length === 1 ? 'kit.detail.missing.linksOne' : 'kit.detail.missing.links',
        params: { count: links.length },
        action: () => this.showRelated(),
      });
    }
    return items;
  });

  /**
   * The lines of the "Hva mangler" list. With the anatomy the requirement
   * suggestions are confirmed in the card's requirements part instead.
   */
  protected readonly todoItems = computed(() =>
    this.anatomy()
      ? this.missingItems().filter((item) => item.key !== 'kit:requirements')
      : this.missingItems(),
  );

  /** Requirement suggestions waiting for a decision ("Bekreft 2 forslag"), or null. */
  protected readonly pendingRequirements = computed(() => {
    const reqs = this.page.requirements();
    return reqs && reqs.pending > 0 && !reqs.expanded ? reqs : null;
  });

  constructor() {
    // The Related tab's count and the aside panel read the same connections.
    effect(() => {
      const type = this.entityType();
      const id = this.entityId();
      untracked(() => {
        this.page.entityType.set(type);
        this.page.entityId.set(id);
      });
      if (this.hasRelatedTab() || this.connectionsPanel()) {
        untracked(() => this.connections.setRecord(type, id));
      }
    });
  }

  /** "Show all" in the connections panel: open the Related tab and bring it into view. */
  protected showRelated(): void {
    this.select('related');
    const index = this.rowTabs().indexOf('related');
    const button = index >= 0 ? this.tabButtons()[index]?.nativeElement : undefined;
    button?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    button?.focus({ preventScroll: true });
  }

  protected askAbout(): void {
    this.ask.showWith(
      this.language.translate('kit.connections.askPrompt', {
        type: this.entityTypes.label(this.entityType()),
        entity_type: this.entityType(),
        entity_id: this.entityId(),
      }),
    );
  }

  protected countFor(tab: RecordTab): number | null {
    const explicit = this.counts()?.[tab];
    const count =
      explicit === undefined && tab === 'related' && this.hasRelatedTab()
        ? this.connections.relatedCount()
        : explicit;
    return count && count > 0 ? count : null;
  }

  protected tabLabelKey(tab: RecordTab): string {
    return this.tabLabels()?.[tab] ?? `kit.detail.tab.${tab}`;
  }

  protected tabId(tab: RecordTab): string {
    return `${this.panelId}-${tab}`;
  }

  protected select(tab: RecordTab): void {
    if (tab === this.active()) {
      return;
    }
    this.active.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === this.visibleTabs()[0] ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onTabKeydown(event: KeyboardEvent): void {
    const tabs = this.rowTabs();
    const index = tabs.indexOf(this.active());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.select(tabs[next]);
    this.tabButtons()[next]?.nativeElement.focus();
  }
}
