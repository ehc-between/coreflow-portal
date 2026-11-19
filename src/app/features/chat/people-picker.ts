import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { ChatApi } from '../../core/chat/chat-api';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { DirectoryEntry, UserRef } from '../../core/chat/chat.models';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Icon } from '../../shared/ui/icon/icon';

let nextId = 0;

/**
 * Pick people from the chat directory (`GET chat/directory`, people holding
 * `chat:use`): a search field with an ARIA listbox and removable chips.
 * `max = 1` replaces the choice (direct messages).
 */
@Component({
  selector: 'app-chat-people-picker',
  imports: [TranslocoPipe, Avatar, Icon],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label class="block text-meta font-semibold text-fg" [for]="inputId">{{
      label() || ('chat.create.people' | transloco)
    }}</label>
    @if (selected().length) {
      <ul class="mt-1.5 flex flex-wrap gap-1.5">
        @for (person of selected(); track person.id) {
          <li
            class="inline-flex items-center gap-1.5 rounded-full bg-accent-soft py-0.5 pr-1 pl-2.5 text-meta font-semibold text-accent"
          >
            {{ person.name }}
            @if (!locked().includes(person.id)) {
              <button
                type="button"
                class="flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface"
                [attr.aria-label]="'chat.create.remove' | transloco: { name: person.name }"
                (click)="remove(person)"
              >
                <app-icon name="x" [size]="12" />
              </button>
            }
          </li>
        }
      </ul>
    }
    <div class="relative mt-1.5">
      <input
        [id]="inputId"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.aria-expanded]="results().length > 0"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="results().length ? listId + '-' + active() : null"
        [placeholder]="'chat.create.peopleSearch' | transloco"
        [disabled]="full()"
        [value]="query()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        data-testid="chat-people-search"
        class="h-10 w-full rounded-tile border border-border bg-surface px-3 text-ui text-fg focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none disabled:opacity-60"
      />
      @if (results().length) {
        <ul
          [id]="listId"
          role="listbox"
          class="absolute top-full left-0 z-30 mt-1 max-h-[240px] w-full overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-pop"
        >
          @for (r of results(); track r.id; let i = $index) {
            <li
              [id]="listId + '-' + i"
              role="option"
              [attr.aria-selected]="i === active()"
              class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2"
              [class]="i === active() ? 'bg-accent-soft' : 'hover:bg-surface-2'"
              (mousedown)="$event.preventDefault(); add(r)"
            >
              <app-avatar [name]="r.name" size="sm" [gradient]="false" />
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-ui font-semibold text-fg">{{ r.name }}</span>
                <span class="truncate text-micro text-fg-subtle">{{ r.detail }}</span>
              </span>
            </li>
          }
        </ul>
      } @else if (searched() && query().trim()) {
        <p class="mt-1 text-meta text-fg-subtle">{{ 'chat.create.noPeople' | transloco }}</p>
      }
    </div>
  `,
})
export class PeoplePicker {
  private readonly api = inject(ChatApi);
  private readonly store = inject(ChatStore);

  readonly selected = model<readonly UserRef[]>([]);
  readonly max = input(49);
  readonly label = input('');
  /** People that can't be removed (e.g. existing members). */
  readonly locked = input<readonly string[]>([]);
  /** People hidden from results (e.g. existing members). */
  readonly exclude = input<readonly string[]>([]);

  protected readonly inputId = `chat-people-${++nextId}`;
  protected readonly listId = `${this.inputId}-list`;
  protected readonly query = signal('');
  protected readonly results = signal<readonly DirectoryEntry[]>([]);
  protected readonly searched = signal(false);
  protected readonly active = signal(0);
  protected readonly full = computed(() => this.max() > 1 && this.selected().length >= this.max());
  private readonly query$ = new Subject<string>();

  constructor() {
    const sub = this.query$
      .pipe(
        debounceTime(150),
        switchMap((q) => {
          const orgId = this.store.orgId();
          if (!orgId || !q.trim()) {
            return of([] as DirectoryEntry[]);
          }
          return this.api.directory(orgId, q.trim(), 8).pipe(
            map((res) => res.items),
            catchError(() => of([] as DirectoryEntry[])),
          );
        }),
      )
      .subscribe((items) => {
        const me = this.store.meId();
        const taken = new Set([...this.selected().map((p) => p.id), ...this.exclude(), me ?? '']);
        this.results.set(items.filter((e) => e.type === 'user' && !taken.has(e.id)));
        this.searched.set(true);
        this.active.set(0);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.searched.set(false);
    this.query$.next(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    if (!count) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.active.set((this.active() + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.add(this.results()[this.active()]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.results.set([]);
    }
  }

  protected add(entry: DirectoryEntry): void {
    const person: UserRef = { id: entry.id, name: entry.name };
    this.selected.set(this.max() === 1 ? [person] : [...this.selected(), person]);
    this.query.set('');
    this.results.set([]);
    this.searched.set(false);
  }

  protected remove(person: UserRef): void {
    this.selected.set(this.selected().filter((p) => p.id !== person.id));
  }
}
