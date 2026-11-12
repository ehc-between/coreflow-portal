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
import { toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiIncident } from '../data/ai-governance.models';
import { AI_GOVERNANCE_SCOPE } from '../data/ai-governance-display';

const MIN_QUERY = 2;

/**
 * The AI incident log of a system (Art. 73): deviations linked to it. AI
 * incidents are recorded in Deviations (the "AI incident" type); here they are
 * listed and an existing deviation can be linked by searching for it.
 */
@Component({
  selector: 'app-ai-system-incidents',
  imports: [RouterLink, TranslocoPipe, FieldHelp, Badge, Button, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 font-display text-[15px] font-bold text-fg">
          {{ 'aiGovernance.incidents.title' | transloco }}
          <app-field-help [scope]="scope" page="systemDetail" field="incidents" />
        </h2>
        @if (canWrite()) {
          <div class="flex flex-wrap gap-2">
            <a
              routerLink="/deviations/new"
              class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
            >
              <app-icon name="flag" [size]="14" />
              {{ 'aiGovernance.incidents.report' | transloco }}
            </a>
            @if (!pickerOpen()) {
              <app-button size="sm" variant="secondary" (click)="pickerOpen.set(true)">
                <app-icon name="link" [size]="14" />
                {{ 'aiGovernance.incidents.link' | transloco }}
              </app-button>
            }
          </div>
        }
      </div>

      @if (pickerOpen()) {
        <div
          class="mb-4 rounded-tile border border-border bg-surface-2 p-3"
          data-testid="incident-picker"
        >
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'aiGovernance.incidents.searchLabel' | transloco }}
            <input
              type="search"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
              [placeholder]="'aiGovernance.incidents.searchPlaceholder' | transloco"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
              (keydown.escape)="closePicker()"
            />
          </label>
          <ul class="mt-2 flex flex-col gap-1" aria-live="polite">
            @for (hit of hits(); track hit.entity_id) {
              <li
                class="flex items-center justify-between gap-2 rounded-tile px-2 py-1.5 hover:bg-surface"
              >
                <span class="min-w-0 truncate text-[13px] text-fg">
                  @if (hit.code) {
                    <span class="mr-1 font-mono text-[12px] text-fg-subtle">{{ hit.code }}</span>
                  }
                  {{ hit.title }}
                </span>
                @if (linkedIds().has(hit.entity_id)) {
                  <span class="text-[12px] text-fg-subtle">{{
                    'aiGovernance.incidents.alreadyLinked' | transloco
                  }}</span>
                } @else {
                  <app-button
                    size="sm"
                    variant="ghost"
                    [loading]="linking() === hit.entity_id"
                    (click)="link(hit)"
                  >
                    {{ 'aiGovernance.incidents.linkThis' | transloco }}
                  </app-button>
                }
              </li>
            } @empty {
              @if (query().trim().length >= minQuery) {
                <li class="px-2 py-1.5 text-[12.5px] text-fg-muted">
                  {{ 'aiGovernance.incidents.noHits' | transloco }}
                </li>
              }
            }
          </ul>
          <div class="mt-2 flex justify-end">
            <app-button size="sm" variant="ghost" (click)="closePicker()">{{
              'aiGovernance.common.close' | transloco
            }}</app-button>
          </div>
        </div>
      }

      @if (state() === 'error') {
        <p class="text-[13px] text-fail">{{ 'aiGovernance.common.loadFailed' | transloco }}</p>
      } @else if (state() === 'ready' && items().length === 0) {
        <p class="text-[13px] text-fg-muted">{{ 'aiGovernance.incidents.empty' | transloco }}</p>
      } @else {
        <ul class="divide-y divide-border" data-testid="incident-list">
          @for (i of items(); track i.entity_id) {
            <li class="flex items-center justify-between gap-2 py-2">
              @if (i.url) {
                <a
                  [routerLink]="i.url"
                  class="min-w-0 truncate text-[13.5px] font-semibold text-fg hover:underline"
                >
                  @if (i.code) {
                    <span class="mr-1 font-mono text-[12px] text-fg-subtle">{{ i.code }}</span>
                  }
                  {{ i.title }}
                </a>
              } @else {
                <span class="min-w-0 truncate text-[13.5px] text-fg">{{ i.title }}</span>
              }
              @if (i.status) {
                <app-badge tone="neutral">{{ i.status }}</app-badge>
              }
            </li>
          }
        </ul>
      }
    </app-card>
  `,
})
export class AiSystemIncidents {
  private readonly api = inject(AiGovernanceApi);
  private readonly search = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly systemId = input.required<string>();
  readonly canWrite = input(false);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly minQuery = MIN_QUERY;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly items = signal<readonly AiIncident[]>([]);
  protected readonly linkedIds = computed(() => new Set(this.items().map((i) => i.entity_id)));
  protected readonly pickerOpen = signal(false);
  protected readonly query = signal('');
  protected readonly hits = signal<readonly SearchItem[]>([]);
  protected readonly linking = signal<string | null>(null);
  private readonly reload = signal(0);

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.systemId();
      this.reload();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.api.listIncidents(orgId, id).subscribe({
          next: (res) => {
            this.items.set(res.items);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });

    const sub = toObservable(this.query)
      .pipe(
        map((q) => q.trim()),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || q.length < MIN_QUERY) {
            return of([] as readonly SearchItem[]);
          }
          return this.search.search(orgId, q, { types: ['deviation'], limit: 10 }).pipe(
            map((res) => res.items),
            catchError(() => of([] as readonly SearchItem[])),
          );
        }),
      )
      .subscribe((hits) => this.hits.set(hits));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.query.set('');
  }

  protected link(hit: SearchItem): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.linking()) {
      return;
    }
    this.linking.set(hit.entity_id);
    this.api.linkIncident(orgId, this.systemId(), hit.entity_id).subscribe({
      next: () => {
        this.linking.set(null);
        this.notifications.success('aiGovernance.incidents.linked');
        this.closePicker();
        this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => {
        this.linking.set(null);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
