import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { KitApi } from '../../core/kit/kit-api';
import { SearchHit } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { EntityChip } from '../../shared/kit/entity-chip';
import { Icon } from '../../shared/ui/icon/icon';
import { EntityRef } from './data/project.models';

let nextId = 0;
const MIN_QUERY = 2;

/** A search hit as a record reference. */
export function hitRef(hit: SearchHit): EntityRef {
  return {
    entity_type: hit.entity_type,
    entity_id: hit.entity_id,
    title: hit.title,
    code: hit.code ?? null,
    url: hit.url ?? null,
    module: hit.module ?? null,
    label_key: hit.label_key ?? null,
  };
}

/**
 * Search for a record of the given types (global search) and pick it: the
 * picked records are shown as chips with a remove button. Used on the project
 * form (affected processes and documents, objectives), for review input
 * documents and for "connect a lesson to existing work".
 */
@Component({
  selector: 'app-project-record-picker',
  imports: [TranslocoPipe, EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showPicked() && picked().length) {
      <ul class="mb-2 flex flex-wrap gap-1.5" [attr.data-testid]="testId() + '-picked'">
        @for (r of picked(); track r.entity_type + r.entity_id) {
          <li
            class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface py-0.5 pr-1 pl-2"
          >
            <app-entity-chip [ref]="r" />
            @if (!disabled()) {
              <button
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg"
                [attr.aria-label]="
                  'projects.picker.remove' | transloco: { name: r.code || r.title }
                "
                (click)="removed.emit(r)"
              >
                <app-icon name="x" [size]="12" />
              </button>
            }
          </li>
        }
      </ul>
    }
    @if (!disabled()) {
      <div class="relative">
        <label [attr.for]="inputId" class="sr-only">{{ label() }}</label>
        <div
          class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
        >
          <app-icon name="search" [size]="15" class="text-fg-subtle" />
          <input
            [id]="inputId"
            type="search"
            autocomplete="off"
            class="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none"
            [placeholder]="placeholder()"
            [value]="query()"
            (input)="onInput($any($event.target).value)"
            [attr.aria-controls]="listId"
            [attr.data-testid]="testId() + '-search'"
          />
        </div>
        @if (query().trim().length >= minQuery) {
          <div
            [id]="listId"
            class="mt-1 rounded-tile border border-border bg-surface shadow-pop"
            aria-live="polite"
          >
            @if (searching()) {
              <p class="px-3 py-2 text-meta text-fg-muted">
                {{ 'projects.picker.searching' | transloco }}
              </p>
            } @else if (results().length === 0) {
              <p class="px-3 py-2 text-meta text-fg-muted">
                {{ 'projects.picker.noResults' | transloco }}
              </p>
            } @else {
              <ul class="max-h-64 divide-y divide-border overflow-y-auto">
                @for (hit of results(); track hit.entity_type + hit.entity_id) {
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                      (click)="pick(hit)"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-ui font-semibold text-fg">
                          @if (hit.code) {
                            <span class="font-mono text-meta text-fg-subtle">{{ hit.code }}</span>
                          }
                          {{ hit.title }}
                        </span>
                        @if (hit.snippet) {
                          <span class="block truncate text-meta text-fg-subtle">{{
                            hit.snippet
                          }}</span>
                        }
                      </span>
                      <app-icon name="plus" [size]="14" class="text-accent" />
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        }
      </div>
    }
  `,
})
export class ProjectRecordPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Entity types to search (global search `types`). */
  readonly types = input.required<readonly string[]>();
  readonly picked = input<readonly EntityRef[]>([]);
  /** Show the picked records as removable chips (off where the page lists them itself). */
  readonly showPicked = input(true);
  readonly label = input('');
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly testId = input('record-picker');
  readonly selected = output<EntityRef>();
  readonly removed = output<EntityRef>();

  protected readonly minQuery = MIN_QUERY;
  protected readonly inputId = `cf-p-pick-${++nextId}`;
  protected readonly listId = `${this.inputId}-list`;
  protected readonly query = signal('');
  protected readonly searching = signal(false);
  private readonly hits = signal<readonly SearchHit[]>([]);
  protected readonly results = computed(() => {
    const taken = new Set(this.picked().map((r) => `${r.entity_type}:${r.entity_id}`));
    return this.hits().filter((h) => !taken.has(`${h.entity_type}:${h.entity_id}`));
  });

  private readonly input$ = new Subject<string>();
  private request = new Subscription();

  constructor() {
    const sub = this.input$
      .pipe(debounceTime(250), distinctUntilChanged())
      .subscribe((q) => this.search(q));
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      this.request.unsubscribe();
    });
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.input$.next(value.trim());
  }

  protected pick(hit: SearchHit): void {
    this.selected.emit(hitRef(hit));
    this.query.set('');
    this.hits.set([]);
  }

  private search(q: string): void {
    this.request.unsubscribe();
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || q.length < MIN_QUERY) {
      this.hits.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.request = this.api.search(orgId, q, { types: this.types(), limit: 8 }).subscribe({
      next: (res) => {
        this.searching.set(false);
        this.hits.set((res?.items ?? []).filter((h) => this.types().includes(h.entity_type)));
      },
      error: () => {
        this.searching.set(false);
        this.hits.set([]);
      },
    });
  }
}
