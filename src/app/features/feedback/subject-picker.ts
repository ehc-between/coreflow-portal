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
import { EntityRefDto } from '../../core/entities/entity.models';
import { KitApi } from '../../core/kit/kit-api';
import { SearchHit } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { EntityChip } from '../../shared/kit/entity-chip';
import { Icon } from '../../shared/ui/icon/icon';
import { SUBJECT_TYPES } from './data/feedback.models';

let nextId = 0;
const MIN_QUERY = 2;

/** A search hit as a record reference. */
export function hitRef(hit: SearchHit): EntityRefDto {
  return {
    entity_type: hit.entity_type,
    entity_id: hit.entity_id,
    title: hit.title,
    code: hit.code ?? null,
    url: hit.url ?? null,
    status: null,
    module: hit.module ?? null,
    label_key: hit.label_key ?? null,
  };
}

/**
 * "What is this feedback about?": search suppliers, contracts, processes, assets,
 * interested parties, projects and AI systems (global search) and pick them. The
 * picked records show as chips with a remove button. The feedback is then listed
 * on each of those records too (the backend writes `relates_to` links).
 */
@Component({
  selector: 'app-feedback-subject-picker',
  imports: [TranslocoPipe, EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (picked().length) {
      <ul class="mb-2 flex flex-wrap gap-1.5" data-testid="subjects-picked">
        @for (r of picked(); track r.entity_type + r.entity_id) {
          <li
            class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface py-0.5 pr-1 pl-2"
          >
            <app-entity-chip [ref]="r" />
            @if (!disabled()) {
              <button
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="
                  'feedback.subjects.remove' | transloco: { name: r.code || r.title }
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
        <label [attr.for]="inputId" class="sr-only">{{
          'feedback.subjects.searchLabel' | transloco
        }}</label>
        <div
          class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
        >
          <app-icon name="search" [size]="15" class="text-fg-subtle" />
          <input
            [id]="inputId"
            type="search"
            autocomplete="off"
            class="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none"
            [placeholder]="'feedback.subjects.placeholder' | transloco"
            [value]="query()"
            (input)="onInput($any($event.target).value)"
            (keydown.escape)="clear()"
            [attr.aria-controls]="listId"
            data-testid="subjects-search"
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
                {{ 'feedback.subjects.searching' | transloco }}
              </p>
            } @else if (results().length === 0) {
              <p class="px-3 py-2 text-meta text-fg-muted">
                {{ 'feedback.subjects.noResults' | transloco }}
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
                        <span class="block truncate text-meta text-fg-subtle">{{
                          'feedback.subjectTypes.' + hit.entity_type | transloco
                        }}</span>
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
export class FeedbackSubjectPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly picked = input<readonly EntityRefDto[]>([]);
  readonly disabled = input(false);
  readonly selected = output<EntityRefDto>();
  readonly removed = output<EntityRefDto>();

  protected readonly minQuery = MIN_QUERY;
  protected readonly inputId = `cf-fb-subject-${++nextId}`;
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

  protected clear(): void {
    this.query.set('');
    this.hits.set([]);
  }

  protected pick(hit: SearchHit): void {
    this.selected.emit(hitRef(hit));
    this.clear();
  }

  private search(q: string): void {
    this.request.unsubscribe();
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || q.length < MIN_QUERY) {
      this.hits.set([]);
      this.searching.set(false);
      return;
    }
    const types: readonly string[] = SUBJECT_TYPES;
    this.searching.set(true);
    this.request = this.api.search(orgId, q, { types, limit: 10 }).subscribe({
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
