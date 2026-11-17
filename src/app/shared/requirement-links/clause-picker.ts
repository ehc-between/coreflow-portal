import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { CatalogueClause } from '../../core/standards/standards.models';
import { Icon } from '../ui/icon/icon';
import { fixedShortName, frameworkOf, shortNameKey } from './requirement-label';

const DEBOUNCE_MS = 200;
const RESULT_LIMIT = 20;

let nextId = 0;

/** A stored clause ref split for display: framework + number. */
export interface ParsedClause {
  readonly ref: string;
  readonly framework: string;
  readonly number: string;
}

/**
 * Split a clause ref for display. Accepts the canonical form
 * (`iso27001:A.8.13`) and the standard-key form (`iso27001-2022:A.8.13`).
 * A value without a colon is shown as is (framework empty).
 */
export function parseClause(ref: string): ParsedClause {
  const at = ref.indexOf(':');
  if (at <= 0) {
    return { ref, framework: '', number: ref };
  }
  return { ref, framework: frameworkOf(ref.slice(0, at)), number: ref.slice(at + 1) };
}

/** Normalise a value from a form control into the list of refs. */
export function toRefs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  return typeof value === 'string' && value.trim() !== '' ? [value] : [];
}

interface Option {
  readonly clause: CatalogueClause;
  readonly id: string;
}

/**
 * Clause picker for record fields that name a clause, control or article
 * (plan 2.2). A ControlValueAccessor: the value is canonical clause refs
 * (`iso27001:A.8.13`), a `string[]` when `multiple` (default) or a
 * `string | null` otherwise. Searches the whole catalogue (`GET
 * requirement-catalogue`) by number, ref or English / Norwegian title;
 * `frameworks` narrows it (e.g. `['gdpr', 'nis2']`). Standards the org has not
 * enabled are marked: picking them is allowed, but they produce no evidence
 * links until enabled.
 *
 * Use it for every such field instead of free text or comma lists, inside an
 * `app-form-field` with `[inputId]` set to the same id.
 */
@Component({
  selector: 'app-clause-picker',
  imports: [TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('standards')],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ClausePicker), multi: true },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <div
      class="flex min-h-10 flex-wrap items-center gap-1.5 rounded-tile border border-border bg-bg px-2 py-1.5 focus-within:border-accent"
      [class.opacity-60]="disabled()"
    >
      @for (ref of refs(); track ref) {
        @let p = parsed(ref);
        <span
          class="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-border-strong bg-surface py-0.5 pr-1 pl-2 text-meta font-medium text-fg"
          [title]="titles()[ref] ?? ''"
          data-testid="clause-picker-value"
        >
          <span class="min-w-0 truncate">
            @if (shortKey(p.framework); as key) {
              {{ key | transloco }}
            } @else {
              {{ fixedShort(p.framework) ?? p.framework }}
            }
            @if (p.framework) {
              ·
            }
            {{ p.number }}</span
          >
          @if (!disabled()) {
            <button
              type="button"
              class="flex flex-none rounded-full p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fail"
              [attr.aria-label]="'standards.reqs.picker.remove' | transloco: { ref: p.number }"
              (click)="remove(ref)"
            >
              <app-icon name="x" [size]="12" />
            </button>
          }
        </span>
      }
      @if (multiple() || refs().length === 0) {
        <input
          #box
          type="text"
          role="combobox"
          autocomplete="off"
          class="h-7 min-w-[10rem] flex-1 bg-transparent px-1 text-ui text-fg outline-none placeholder:text-fg-placeholder"
          [id]="inputId() || autoId"
          [disabled]="disabled()"
          [value]="query()"
          [placeholder]="placeholderKey() || 'standards.reqs.picker.placeholder' | transloco"
          [attr.aria-label]="ariaLabel() || null"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeId()"
          aria-autocomplete="list"
          (input)="onInput(box.value)"
          (focus)="onFocus()"
          (keydown)="onKeydown($event)"
          (blur)="touch()"
        />
      }
    </div>
    <div class="relative">
      @if (open()) {
        <div
          class="absolute top-1 right-0 left-0 z-30 max-h-72 overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
        >
          @if (searching()) {
            <p class="px-2 py-1.5 text-meta text-fg-muted">{{ 'common.loading' | transloco }}</p>
          } @else if (error()) {
            <p class="px-2 py-1.5 text-meta text-fail" role="alert">
              {{ 'standards.reqs.picker.error' | transloco }}
            </p>
          } @else if (options().length === 0) {
            <p class="px-2 py-1.5 text-meta text-fg-muted">
              {{ 'standards.reqs.picker.noResults' | transloco }}
            </p>
          }
          <ul [id]="listId" role="listbox" [attr.aria-multiselectable]="multiple()">
            @for (option of options(); track option.id; let i = $index) {
              <li
                [id]="option.id"
                role="option"
                [attr.aria-selected]="i === active()"
                class="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5"
                [class.bg-surface-2]="i === active()"
                (mousedown)="$event.preventDefault()"
                tabindex="-1"
                (click)="pick(option.clause)"
                (keydown.enter)="pick(option.clause)"
                (mouseenter)="active.set(i)"
                data-testid="clause-picker-option"
              >
                <span class="min-w-0 flex-1">
                  <span class="block text-ui font-semibold text-fg"
                    >{{ option.clause.short }} · {{ option.clause.number }}</span
                  >
                  <span class="block truncate text-meta text-fg-muted">{{
                    option.clause.title
                  }}</span>
                </span>
                @if (!option.clause.enabled) {
                  <span
                    class="mt-0.5 flex-none rounded-full border border-border px-1.5 text-micro font-semibold text-fg-subtle"
                    >{{ 'standards.reqs.picker.notEnabled' | transloco }}</span
                  >
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class ClausePicker implements ControlValueAccessor {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** Several refs (`string[]`, default) or one (`string | null`). */
  readonly multiple = input(true);
  /** Framework keys to search (`iso27001`, `gdpr`, …); all when empty. */
  readonly frameworks = input<readonly string[] | null | undefined>(null);
  /** Id of the text box, so an `app-form-field` label points at it. */
  readonly inputId = input<string | null | undefined>(null);
  readonly placeholderKey = input<string | null | undefined>(null);
  readonly ariaLabel = input<string | null | undefined>(null);

  protected readonly autoId = `cf-clause-picker-${++nextId}`;
  protected readonly listId = `${this.autoId}-list`;

  protected readonly refs = signal<readonly string[]>([]);
  protected readonly query = signal('');
  protected readonly results = signal<readonly CatalogueClause[]>([]);
  protected readonly searching = signal(false);
  protected readonly error = signal(false);
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly disabled = signal(false);
  /** Clause titles seen in search results, for the tooltip of a chosen ref. */
  protected readonly titles = signal<Readonly<Record<string, string>>>({});

  protected readonly options = computed<readonly Option[]>(() => {
    const chosen = new Set(this.refs());
    return this.results()
      .filter((c) => !chosen.has(c.clause_ref))
      .map((clause, i) => ({ clause, id: `${this.autoId}-opt-${i}` }));
  });
  protected readonly activeId = computed(() => this.options()[this.active()]?.id ?? null);

  protected readonly parsed = parseClause;
  protected readonly shortKey = shortNameKey;
  protected readonly fixedShort = fixedShortName;

  private onChange: (value: string[] | string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private readonly search$ = new Subject<string>();
  private readonly sub: Subscription;

  constructor() {
    this.sub = this.search$
      .pipe(
        debounceTime(DEBOUNCE_MS),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || !q) {
            return of({ items: [] as CatalogueClause[], error: false });
          }
          return this.api
            .searchCatalogue(orgId, q, {
              frameworks: this.frameworks() ?? undefined,
              limit: RESULT_LIMIT,
            })
            .pipe(
              map((items) => ({ items, error: false })),
              catchError(() => of({ items: [] as CatalogueClause[], error: true })),
            );
        }),
      )
      .subscribe(({ items, error }) => {
        this.results.set(items);
        this.error.set(error);
        this.searching.set(false);
        this.active.set(items.length > 0 ? 0 : -1);
      });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
  }

  writeValue(value: unknown): void {
    this.refs.set(toRefs(value));
  }

  registerOnChange(fn: (value: string[] | string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    if (disabled) {
      this.open.set(false);
    }
  }

  protected onInput(value: string): void {
    this.query.set(value);
    const q = value.trim();
    this.error.set(false);
    if (!q) {
      this.results.set([]);
      this.searching.set(false);
      this.open.set(false);
      return;
    }
    this.open.set(true);
    this.searching.set(true);
    this.search$.next(q);
  }

  protected onFocus(): void {
    if (this.query().trim()) {
      this.open.set(true);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        this.active.set(count ? (this.active() + 1) % count : -1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set(count ? (this.active() - 1 + count) % count : -1);
        break;
      case 'Enter': {
        const option = this.options()[this.active()];
        if (this.open() && option) {
          event.preventDefault();
          this.pick(option.clause);
        }
        break;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.open.set(false);
        }
        break;
      case 'Backspace':
        if (!this.query() && this.refs().length > 0 && this.multiple()) {
          this.remove(this.refs()[this.refs().length - 1]);
        }
        break;
    }
  }

  protected pick(clause: CatalogueClause): void {
    this.titles.update((t) => ({ ...t, [clause.clause_ref]: clause.title }));
    const next = this.multiple() ? [...this.refs(), clause.clause_ref] : [clause.clause_ref];
    this.refs.set(next);
    this.query.set('');
    this.results.set([]);
    this.open.set(false);
    this.emit();
  }

  protected remove(ref: string): void {
    this.refs.set(this.refs().filter((r) => r !== ref));
    this.emit();
  }

  protected touch(): void {
    this.onTouched();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  private emit(): void {
    const refs = [...this.refs()];
    this.onChange(this.multiple() ? refs : (refs[0] ?? null));
    this.onTouched();
  }
}
