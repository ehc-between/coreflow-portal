import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TasksApi } from '../../core/tasks/tasks-api';
import { WorkItem } from '../../core/tasks/task.models';
import { LocalizedTitlePipe } from '../../shared/i18n/localized-title.pipe';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { DOT_CLASS } from '../company/hub-kit/hub-tiles';
import { provideHubsScope } from '../company/hub-kit/hub-scope';
import { BTN_SMALL, LINK, PAGE } from '../company/hub-kit/hub-styles';
import { splitUrl } from '../dashboard/data/home-format';
import { isWaitingDocument, sortWaiting, waitingKind } from './documents-hub-data';

type State = 'loading' | 'error' | 'ready';

/**
 * Dokumenter › Venter på deg (`/documents/waiting`, docs/ia-v2.md §5.6): the
 * documents the user must approve or read and confirm, from My work
 * (`GET /my-work?module=documents`), one button each.
 */
@Component({
  selector: 'app-documents-waiting-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    EmptyState,
    ErrorState,
    LoadingState,
    LocalDayPipe,
    LocalizedTitlePipe,
    PageHeader,
  ],
  viewProviders: [provideHubsScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page">
      <app-page-header
        titleKey="hubs.waiting.title"
        descriptionKey="hubs.waiting.intro"
        [breadcrumbs]="[
          { labelKey: 'hubs.documents.title', link: '/documents' },
          { labelKey: 'hubs.waiting.title' },
        ]"
      />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (rows().length) {
            <ul
              class="m-0 divide-y divide-border rounded-card border border-border bg-surface p-0"
              data-testid="waiting-list"
            >
              @for (row of rows(); track row.key) {
                <li
                  class="flex list-none flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3.5"
                  data-testid="waiting-row"
                >
                  <span class="h-2.5 w-2.5 flex-none rounded-full" [class]="row.dot"></span>
                  <div class="min-w-0 flex-1 basis-[200px]">
                    <b class="block font-semibold text-fg [overflow-wrap:anywhere]">{{
                      row.item | localizedTitle
                    }}</b>
                    <span class="block text-ui text-fg-muted">
                      {{ row.kindKey | transloco }}
                      @if (row.overdue) {
                        · {{ 'hubs.waiting.overdue' | transloco }}
                      } @else if (row.due) {
                        · {{ 'hubs.waiting.due' | transloco: { date: (row.due | localDay) } }}
                      }
                    </span>
                  </div>
                  @if (row.link) {
                    <a
                      [routerLink]="row.link.path"
                      [queryParams]="row.link.query"
                      [class]="btnSmall"
                      data-testid="waiting-cta"
                    >
                      {{ row.ctaKey | transloco }}
                      <span class="sr-only">: {{ row.item | localizedTitle }}</span>
                    </a>
                  }
                </li>
              }
            </ul>
          } @else {
            <app-empty-state
              icon="check"
              titleKey="hubs.waiting.emptyTitle"
              bodyKey="hubs.waiting.emptyBody"
            />
          }
          <p class="mt-4 text-ui">
            <a routerLink="/my-work" [class]="link">{{ 'hubs.waiting.allWork' | transloco }}</a>
          </p>
        }
      }
    </div>
  `,
})
export class DocumentsWaitingPage {
  private readonly api = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly page = PAGE;
  protected readonly btnSmall = BTN_SMALL;
  protected readonly link = LINK;

  protected readonly state = signal<State>('loading');
  private readonly items = signal<readonly WorkItem[]>([]);

  protected readonly rows = computed(() =>
    sortWaiting(this.items().filter(isWaitingDocument)).map((item) => {
      const kind = waitingKind(item);
      return {
        key: `${item.source}:${item.id}`,
        item,
        kindKey: kind === 'approve' ? 'hubs.waiting.kindApprove' : 'hubs.waiting.kindAcknowledge',
        ctaKey: kind === 'approve' ? 'hubs.waiting.approve' : 'hubs.waiting.acknowledge',
        dot: DOT_CLASS[item.overdue ? 'bad' : kind === 'approve' ? 'warn' : 'info'],
        overdue: item.overdue,
        due: item.due_at,
        link: item.url ? splitUrl(item.url) : null,
      };
    }),
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  private load(orgId: string | null): void {
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.api.myWork(orgId, { module: 'documents' }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
