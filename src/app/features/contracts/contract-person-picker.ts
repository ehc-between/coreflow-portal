import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DocumentsApi } from '../../core/documents/documents-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';

export interface PersonOption {
  readonly id: string;
  readonly name: string;
  /** Shown under the name so people with the same name can be told apart. */
  readonly email: string;
}

/** Case- and accent-insensitive match on name or email. */
export function matchPeople(people: readonly PersonOption[], text: string): PersonOption[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(text.trim());
  return people.filter((p) => !q || fold(p.name).includes(q) || fold(p.email).includes(q));
}

/**
 * Searchable owner picker: type part of a name or an email, pick from the org's
 * members (name plus email, so two "Kari"s are distinguishable). `emptyLabel` adds
 * a first option for "no choice" (e.g. "Me" on a new contract, which the server
 * resolves to the caller). Without `documents:read` the list holds only the user.
 */
@Component({
  selector: 'app-contract-person-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <input
      [id]="inputId()"
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="inputId() + '-list'"
      [value]="open() ? text() : selectedLabel()"
      [placeholder]="'contracts.form.ownerSearch' | transloco"
      (focus)="openList()"
      (input)="text.set($any($event.target).value); open.set(true)"
      (keydown.escape)="open.set(false)"
      (keydown.enter)="$event.preventDefault(); pickFirst()"
      (blur)="closeSoon()"
      data-testid="owner-picker"
    />
    @if (open()) {
      <ul
        [id]="inputId() + '-list'"
        role="listbox"
        class="absolute right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
      >
        @if (emptyLabel(); as empty) {
          <li role="option" [attr.aria-selected]="!value()">
            <button
              type="button"
              class="w-full rounded-lg px-2.5 py-1.5 text-left text-ui text-fg hover:bg-surface-2"
              (mousedown)="$event.preventDefault()"
              (click)="pick('')"
            >
              {{ empty }}
            </button>
          </li>
        }
        @for (p of matches(); track p.id) {
          <li role="option" [attr.aria-selected]="value() === p.id">
            <button
              type="button"
              class="w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2"
              [class.bg-accent-soft]="value() === p.id"
              (mousedown)="$event.preventDefault()"
              (click)="pick(p.id)"
              [attr.data-testid]="'owner-option-' + p.id"
            >
              <span class="block text-ui text-fg">{{ p.name }}</span>
              @if (p.email && p.email !== p.name) {
                <span class="block text-meta text-fg-subtle">{{ p.email }}</span>
              }
            </button>
          </li>
        } @empty {
          <li class="px-2.5 py-1.5 text-meta text-fg-muted">
            {{ 'contracts.form.ownerNoMatch' | transloco }}
          </li>
        }
      </ul>
    }
  `,
})
export class ContractPersonPicker {
  private readonly documents = inject(DocumentsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly inputId = input.required<string>();
  /** The chosen user id ('' = none). */
  readonly value = input('');
  /** Name to show for a value that is not (or not yet) in the list. */
  readonly fallbackName = input<string | null>(null);
  readonly emptyLabel = input<string | null>(null);
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly text = signal('');
  private readonly loaded = signal<readonly PersonOption[]>([]);

  protected readonly people = computed<readonly PersonOption[]>(() => {
    const me = this.auth.user();
    const list = this.loaded();
    if (me && !list.some((p) => p.id === me.id)) {
      return [{ id: me.id, name: me.full_name || me.email, email: me.email }, ...list];
    }
    return list;
  });
  protected readonly matches = computed(() => matchPeople(this.people(), this.text()).slice(0, 50));
  protected readonly selectedLabel = computed(() => {
    const id = this.value();
    if (!id) {
      return this.emptyLabel() ?? '';
    }
    const person = this.people().find((p) => p.id === id);
    return person ? person.name : (this.fallbackName() ?? '');
  });

  private request = new Subscription();
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
      }
    });
    effect(() => {
      const org = this.selectedOrg.currentOrg();
      untracked(() => this.load(org?.id ?? null, org?.permissions ?? []));
    });
  }

  protected openList(): void {
    this.text.set('');
    this.open.set(true);
  }

  protected pick(id: string): void {
    this.open.set(false);
    this.text.set('');
    this.valueChange.emit(id);
  }

  protected pickFirst(): void {
    const first = this.matches()[0];
    if (first) {
      this.pick(first.id);
    }
  }

  protected closeSoon(): void {
    this.closeTimer = setTimeout(() => this.open.set(false), 150);
  }

  private load(orgId: string | null, permissions: readonly string[]): void {
    this.request.unsubscribe();
    if (!orgId || !permissions.includes('documents:read')) {
      this.loaded.set([]);
      return;
    }
    this.request = this.documents.listAccessSubjects(orgId).subscribe({
      next: (subjects) =>
        this.loaded.set(
          [...subjects.users]
            .map((u) => ({ id: u.id, name: u.name || u.email, email: u.email }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      error: () => this.loaded.set([]),
    });
  }
}
