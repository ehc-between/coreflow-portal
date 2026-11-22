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
import { OutputsApi } from '../../core/outputs/outputs-api';
import { GeneratedOutput } from '../../core/outputs/outputs.models';
import { GeneratedRow } from '../../shared/outputs/generated-row';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { provideHubsScope } from '../company/hub-kit/hub-scope';
import { LINK, PAGE } from '../company/hub-kit/hub-styles';

const PAGE_SIZE = 50;

type State = 'loading' | 'error' | 'ready';

/**
 * Dokumenter › Arkiv (`/documents/archive`, docs/ia-v2.md §5.6, gap M61): every
 * generated, locked report and minute the user may read, newest first, each stored
 * unchanged (`GET /generated-outputs`, the same rows as Rapporter's archive).
 */
@Component({
  selector: 'app-documents-archive-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    EmptyState,
    ErrorState,
    GeneratedRow,
    LoadingState,
    PageHeader,
  ],
  viewProviders: [provideHubsScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page">
      <app-page-header
        titleKey="hubs.archive.title"
        descriptionKey="hubs.archive.intro"
        [breadcrumbs]="[
          { labelKey: 'hubs.documents.title', link: '/documents' },
          { labelKey: 'hubs.archive.title' },
        ]"
      />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (items().length) {
            <p class="mb-2 text-meta text-fg-muted" data-testid="archive-total">
              {{ 'hubs.archive.total' | transloco: { count: total() } }}
            </p>
            <ul
              class="m-0 divide-y divide-border rounded-card border border-border bg-surface p-0"
              data-testid="archive-list"
            >
              @for (file of items(); track file.id) {
                <li class="list-none"><app-generated-row [file]="file" /></li>
              }
            </ul>
            @if (items().length < total()) {
              <div class="mt-4 flex justify-center">
                <app-button variant="secondary" [loading]="loadingMore()" (click)="more()">
                  {{ 'hubs.archive.more' | transloco }}
                </app-button>
              </div>
            }
          } @else {
            <app-empty-state
              icon="documents"
              titleKey="hubs.archive.emptyTitle"
              bodyKey="hubs.archive.emptyBody"
              ctaKey="hubs.archive.emptyCta"
              ctaLink="/reports"
            />
          }
          @if (canManageOrg()) {
            <p class="mt-4 text-ui">
              <a routerLink="/settings/deleted-documents" [class]="link">{{
                'hubs.archive.deleted' | transloco
              }}</a>
            </p>
          }
        }
      }
    </div>
  `,
})
export class DocumentsArchivePage {
  private readonly api = inject(OutputsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly page = PAGE;
  protected readonly link = LINK;

  protected readonly state = signal<State>('loading');
  protected readonly items = signal<readonly GeneratedOutput[]>([]);
  protected readonly total = signal(0);
  protected readonly loadingMore = signal(false);
  protected readonly canManageOrg = computed(
    () => !!this.selectedOrg.currentOrg()?.permissions.includes('org:manage'),
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

  protected more(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.loadingMore.set(true);
    this.api.generated(orgId, { limit: PAGE_SIZE, offset: this.items().length }).subscribe({
      next: (list) => {
        this.items.update((items) => [...items, ...list.items]);
        this.total.set(list.total);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  private load(orgId: string | null): void {
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.api.generated(orgId, { limit: PAGE_SIZE, offset: 0 }).subscribe({
      next: (list) => {
        this.items.set(list.items);
        this.total.set(list.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
