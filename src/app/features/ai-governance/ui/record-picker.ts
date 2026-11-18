import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { KitApi } from '../../../core/kit/kit-api';
import { SearchHit } from '../../../core/kit/kit.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Icon } from '../../../shared/ui/icon/icon';
import { EntityRef } from '../data/ai-governance.models';

let nextId = 0;
const MIN_QUERY = 2;

/** A search hit as a record reference. */
export function hitToRef(hit: SearchHit): EntityRef {
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
 * Pick one real record of another module (supplier, processing activity,
 * document, course …) through global search over `types`. The chosen record
 * shows as an entity chip with a remove button, so the AI system links to the
 * record instead of repeating it as free text.
 */
@Component({
  selector: 'app-ai-record-picker',
  imports: [TranslocoPipe, EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (value(); as ref) {
      <div
        class="flex min-h-10 items-center gap-2 rounded-tile border border-border bg-surface px-3 py-1.5"
        data-testid="record-picked"
      >
        <app-entity-chip class="min-w-0 flex-1" [ref]="ref" />
        @if (!disabled()) {
          <button
            type="button"
            class="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-label]="
              'aiGovernance.picker.remove' | transloco: { name: ref.code || ref.title }
            "
            (click)="cleared.emit()"
            data-testid="record-clear"
          >
            <app-icon name="x" [size]="13" />
          </button>
        }
      </div>
    } @else if (!disabled()) {
      <div class="relative">
        <div
          class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
        >
          <app-icon name="search" [size]="15" class="text-fg-subtle" />
          <input
            [id]="inputId() || autoId"
            type="search"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            [attr.aria-expanded]="query().trim().length >= minQuery"
            [attr.aria-controls]="listId"
            [attr.aria-describedby]="describedBy() || null"
            class="h-full min-w-0 flex-1 border-0 bg-transparent text-ui text-fg outline-none"
            [placeholder]="placeholderKey() | transloco"
            [value]="query()"
            (input)="onInput($any($event.target).value)"
            (keydown.escape)="reset()"
            data-testid="record-search"
          />
        </div>
        @if (query().trim().length >= minQuery) {
          <div
            [id]="listId"
            class="absolute right-0 left-0 z-30 mt-1 rounded-tile border border-border bg-surface shadow-pop"
            aria-live="polite"
          >
            @if (searching()) {
              <p class="px-3 py-2 text-meta text-fg-muted">
                {{ 'aiGovernance.common.loading' | transloco }}
              </p>
            } @else if (hits().length === 0) {
              <p class="px-3 py-2 text-meta text-fg-muted">
                {{ 'aiGovernance.picker.noResults' | transloco }}
              </p>
            } @else {
              <ul class="max-h-64 divide-y divide-border overflow-y-auto" role="listbox">
                @for (hit of hits(); track hit.entity_type + hit.entity_id) {
                  <li role="option" [attr.aria-selected]="false">
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                      (click)="pick(hit)"
                      data-testid="record-option"
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
export class AiRecordPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Entity types to search. */
  readonly types = input.required<readonly string[]>();
  readonly value = input<EntityRef | null | undefined>(null);
  readonly inputId = input('');
  readonly describedBy = input('');
  readonly placeholderKey = input('aiGovernance.picker.placeholder');
  readonly disabled = input(false);
  readonly picked = output<EntityRef>();
  readonly cleared = output<void>();

  protected readonly minQuery = MIN_QUERY;
  protected readonly autoId = `cf-ai-picker-${++nextId}`;
  protected readonly listId = `${this.autoId}-list`;
  protected readonly query = signal('');
  protected readonly searching = signal(false);
  protected readonly hits = signal<readonly SearchHit[]>([]);

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

  protected reset(): void {
    this.query.set('');
    this.hits.set([]);
  }

  protected pick(hit: SearchHit): void {
    this.picked.emit(hitToRef(hit));
    this.reset();
  }

  private search(q: string): void {
    this.request.unsubscribe();
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || q.length < MIN_QUERY) {
      this.hits.set([]);
      this.searching.set(false);
      return;
    }
    const types = this.types();
    this.searching.set(true);
    this.request = this.api.search(orgId, q, { types, limit: 8 }).subscribe({
      next: (res) => {
        this.searching.set(false);
        this.hits.set((res?.items ?? []).filter((h) => types.includes(h.entity_type)));
      },
      error: () => {
        this.searching.set(false);
        this.hits.set([]);
      },
    });
  }
}
