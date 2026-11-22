import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FRAMEWORK_KEYS } from '../data/context.models';
import { ContextFrameworks } from '../data/context-frameworks';

let nextId = 0;

/** The keys to show: adopted (and already chosen) ones, or every key when expanded. */
export function visibleFrameworks(
  adopted: readonly string[],
  chosen: readonly string[],
  showAll: boolean,
): string[] {
  const known = FRAMEWORK_KEYS as readonly string[];
  if (showAll || adopted.length === 0) {
    const first = known.filter((k) => adopted.includes(k));
    return [...first, ...known.filter((k) => !first.includes(k))];
  }
  return known.filter((k) => adopted.includes(k) || chosen.includes(k));
}

/**
 * Which management systems (standards) a record applies to, as toggle chips.
 * The organisation's adopted standards come first; the rest are behind "Vis
 * alle". The hint explains the effect: the record then documents the matching
 * requirement in each chosen standard automatically.
 */
@Component({
  selector: 'app-context-framework-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset [attr.aria-describedby]="id + '-hint'">
      <legend class="mb-1 text-ui font-semibold text-fg-muted">
        {{ labelKey() | transloco }}
      </legend>
      <p [id]="id + '-hint'" class="mb-2 text-meta text-fg-muted">
        {{ hintKey() | transloco }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        @if (allKey(); as all) {
          <label
            class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-meta font-semibold focus-within:ring-2 focus-within:ring-accent"
            [class]="
              value().length === 0
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border text-fg-muted hover:text-fg'
            "
          >
            <input
              type="checkbox"
              class="sr-only"
              [id]="id + '-all'"
              [checked]="value().length === 0"
              [disabled]="disabled()"
              (change)="valueChange.emit([])"
            />
            {{ all | transloco }}
          </label>
        }
        @for (key of shown(); track key) {
          <label
            class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-meta font-semibold focus-within:ring-2 focus-within:ring-accent"
            [class]="
              value().includes(key)
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border text-fg-muted hover:text-fg'
            "
          >
            <input
              type="checkbox"
              class="sr-only"
              [id]="id + '-' + key"
              [checked]="value().includes(key)"
              [disabled]="disabled()"
              (change)="toggle(key, $any($event.target).checked)"
            />
            {{ 'context.frameworks.' + key | transloco }}
          </label>
        }
        @if (hiddenCount() > 0) {
          <button
            type="button"
            class="inline-flex min-h-8 items-center rounded-full px-3 text-meta font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            (click)="showAll.set(true)"
          >
            {{ 'context.form.showAllFrameworks' | transloco: { count: hiddenCount() } }}
          </button>
        }
      </div>
    </fieldset>
  `,
})
export class FrameworkPicker {
  private readonly frameworks = inject(ContextFrameworks);

  readonly value = input<readonly string[]>([]);
  readonly labelKey = input('context.fields.frameworks');
  readonly hintKey = input('context.form.frameworksHint');
  readonly disabled = input(false);
  /** Optional first chip meaning "every management system" (an empty list). */
  readonly allKey = input<string | null>(null);
  readonly valueChange = output<readonly string[]>();

  protected readonly id = `cf-fw-${++nextId}`;
  protected readonly showAll = signal(false);
  protected readonly shown = computed(() =>
    visibleFrameworks(this.frameworks.adopted(), this.value(), this.showAll()),
  );
  protected readonly hiddenCount = computed(() => FRAMEWORK_KEYS.length - this.shown().length);

  constructor() {
    this.frameworks.ensureLoaded();
  }

  protected toggle(key: string, on: boolean): void {
    const current = this.value().filter((k) => k !== key);
    this.valueChange.emit(
      on ? FRAMEWORK_KEYS.filter((k) => k === key || current.includes(k)) : current,
    );
  }
}
