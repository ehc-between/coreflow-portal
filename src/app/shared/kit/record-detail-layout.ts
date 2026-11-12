import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { Attachments } from '../attachments/attachments';
import { Icon } from '../ui/icon/icon';
import { Comments } from './comments';
import { provideKitScope } from './kit-scope';
import { RelatedItems } from './related-items';
import { RevisionHistory } from './revision-history';
import { Timeline } from './timeline';

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

let nextId = 0;

/**
 * Standard detail page of a record: a header (`[header]`, else the
 * `titleKey` heading), actions (`[actions]`), and tabbed sections. "Details" is
 * the default slot and "Tasks" the `[tasks]` slot (project F2's
 * `<app-entity-tasks>`); related items, activity, comments, attachments and
 * revisions are the shared kit components, rendered when their tab is opened.
 * `[aside]` is a side column on wide screens (below the tabs on small ones).
 * The open tab is kept in the `?tab=` query parameter so links and reloads
 * return to it. Page context for the assistant is registered by the module
 * page, not here.
 */
@Component({
  selector: 'app-record-detail-layout',
  imports: [
    RouterLink,
    TranslocoPipe,
    Icon,
    Attachments,
    Comments,
    RelatedItems,
    RevisionHistory,
    Timeline,
  ],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @if (backLink(); as link) {
        <a
          [routerLink]="link"
          class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ backLabel() }}
        </a>
      }

      <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <ng-content select="[header]" />
          @if (title(); as heading) {
            <h1
              class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            >
              {{ heading }}
            </h1>
          }
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <ng-content select="[actions]" />
        </div>
      </header>

      <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div class="min-w-0 flex-1">
          <div
            role="tablist"
            data-tour="kit-tabs"
            [attr.aria-label]="'kit.detail.tabs' | transloco"
            class="mb-4 flex gap-1 overflow-x-auto border-b border-border"
          >
            @for (tab of visibleTabs(); track tab) {
              <button
                #tabButton
                type="button"
                role="tab"
                [id]="tabId(tab)"
                [attr.aria-selected]="tab === active()"
                [attr.aria-controls]="panelId"
                [tabindex]="tab === active() ? 0 : -1"
                class="-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent"
                [class]="
                  tab === active()
                    ? 'border-accent text-fg'
                    : 'border-transparent text-fg-muted hover:text-fg'
                "
                (click)="select(tab)"
                (keydown)="onTabKeydown($event)"
                [attr.data-testid]="'tab-' + tab"
              >
                {{ 'kit.detail.tab.' + tab | transloco }}
              </button>
            }
          </div>

          <div
            role="tabpanel"
            [id]="panelId"
            [attr.aria-labelledby]="tabId(active())"
            tabindex="0"
            class="outline-none"
          >
            <div [hidden]="active() !== 'details'">
              <ng-content />
            </div>
            <div [hidden]="active() !== 'tasks'">
              <ng-content select="[tasks]" />
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
              @case ('activity') {
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

        <aside class="flex w-full flex-col gap-4 empty:hidden lg:w-[300px] lg:flex-none">
          <ng-content select="[aside]" />
        </aside>
      </div>
    </div>
  `,
})
export class RecordDetailLayout {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** Heading when no `[header]` is projected (an i18n key). */
  readonly titleKey = input<string | undefined>(undefined);
  readonly tabs = input<readonly RecordTab[]>(DEFAULT_RECORD_TABS);
  /** Whether the user can edit the record (links, attachments). */
  readonly canEdit = input(false);
  readonly canComment = input(true);
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

  protected readonly panelId = `cf-record-panel-${++nextId}`;

  protected readonly visibleTabs = computed(() => {
    const tabs = this.tabs().filter((t) => KNOWN_TABS.has(t));
    return tabs.length > 0 ? tabs : DEFAULT_RECORD_TABS;
  });

  protected readonly active = linkedSignal<RecordTab>(() => {
    const requested = this.route.snapshot.queryParamMap.get('tab');
    const tabs = this.visibleTabs();
    return tabs.find((t) => t === requested) ?? tabs[0];
  });

  protected readonly title = computed(() => {
    const key = this.titleKey();
    return key ? this.language.translate(key) : null;
  });

  protected readonly backLabel = computed(() =>
    this.language.translate(this.backLabelKey() ?? 'kit.detail.back'),
  );

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
    const tabs = this.visibleTabs();
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
