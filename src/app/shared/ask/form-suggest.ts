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
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { AiAvailability } from '../../core/ai/ai-availability';
import { FormSuggestApi, FormSuggestOffer, SuggestedField } from '../../core/ai/form-suggest-api';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { MarkdownPipe } from '../markdown/markdown.pipe';
import { MissingFactsHint } from './missing-facts-hint';

/** One field the suggestion may fill (backend field name + the host's label key). */
export interface FormSuggestFieldDef {
  readonly name: string;
  /** Label i18n key, translated in the host's scope. */
  readonly labelKey: string;
  /** Long text: preview shows the whole text (pre-wrapped). */
  readonly long?: boolean;
  /** Preview text of a value (enums, booleans, ...); default: the value / `display`. */
  readonly format?: (value: unknown, field: SuggestedField) => string;
}

/** Accepted values by field name (what the host patches into its form). */
export type AcceptedSuggestion = Readonly<Record<string, SuggestedField>>;

/**
 * Whole-form AI suggestion, placed at the TOP of a form (`variant="form"`), or a small
 * per-field "Skriv om" (`variant="field"` with `[only]="['statement']"`).
 *
 *   <app-form-suggest suggestKey="context.policy" labelKey="context.formSuggest.suggest"
 *     [fields]="fields" [values]="values()" [context]="{ from: 'context' }"
 *     [editing]="editing()" [titleOnly]="!!draft().title && !draft().statement"
 *     offerKeyPrefix="context.formSuggest.offers." (offerPicked)="startFrom($event)"
 *     (applied)="apply($event)" />
 *
 * - A new form lists the records the organisation is missing (`offers`); picking one
 *   emits `offerPicked` (the host sets e.g. the kind) and runs the suggestion for it.
 * - The suggestion opens a review panel: per field the current and the proposed value
 *   and a one-line reason; "Bruk alle" / "Bruk valgte" emit `applied`. Nothing is saved:
 *   the host only patches its form, the user saves as usual.
 * - Profile facts the suggestion lacked show as a hint linking to the company profile.
 * Hidden when AI is off. Labels from the host scope; its own texts from `ask`.
 */
@Component({
  selector: 'app-form-suggest',
  imports: [TranslocoPipe, Button, Icon, MissingFactsHint, MarkdownPipe],
  viewProviders: [provideSharedScope('ask')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      @if (variant() === 'field') {
        <span class="inline-flex flex-col items-start gap-1">
          <app-button
            variant="ghost"
            size="sm"
            [loading]="running()"
            [disabled]="running()"
            (click)="run()"
          >
            <app-icon name="spark" [size]="13" />
            {{ 'ask.formSuggest.rewrite' | transloco }}
          </app-button>
        </span>
      } @else {
        <section
          class="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          data-testid="form-suggest"
          [attr.aria-busy]="running()"
        >
          @if (offers().length && !editing() && !review()) {
            <ul class="flex flex-col gap-2">
              @for (offer of offers(); track offer.key) {
                <li class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-ui text-fg">
                    {{
                      'ask.formSuggest.missingRecord'
                        | transloco: { name: (offerKeyPrefix() + offer.key | transloco) }
                    }}
                  </span>
                  <app-button
                    variant="secondary"
                    size="sm"
                    [disabled]="running()"
                    (click)="pickOffer(offer)"
                  >
                    {{ 'ask.formSuggest.suggestIt' | transloco }}
                  </app-button>
                </li>
              }
            </ul>
          }
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <app-button
              variant="primary"
              size="sm"
              [loading]="running()"
              [disabled]="running()"
              data-testid="form-suggest-run"
              (click)="run()"
            >
              <app-icon name="spark" [size]="14" />
              {{ (editing() ? 'ask.formSuggest.improve' : labelKey()) | transloco }}
            </app-button>
            @if (running()) {
              <span class="text-meta text-fg-muted" role="status">
                {{ 'ask.formSuggest.running' | transloco }}
              </span>
            } @else if (titleOnly() && !editing()) {
              <span class="text-meta text-fg-muted">
                {{ 'ask.formSuggest.fromTitle' | transloco }}
              </span>
            } @else if (!review()) {
              <span class="text-meta text-fg-muted">
                {{ 'ask.formSuggest.hint' | transloco }}
              </span>
            }
          </div>
          @if (error()) {
            <p class="text-meta text-fail-ink" role="alert">
              {{ 'ask.formSuggest.failed' | transloco }}
            </p>
          }
          <app-missing-facts-hint [facts]="missingFacts()" />
        </section>
      }

      @if (review(); as items) {
        <section
          class="mt-3 flex flex-col gap-3 rounded-card border border-accent/40 bg-surface p-4"
          role="region"
          [attr.aria-label]="'ask.formSuggest.reviewTitle' | transloco"
          data-testid="form-suggest-review"
        >
          <div>
            <h2 class="font-display text-card font-bold text-fg">
              {{ 'ask.formSuggest.reviewTitle' | transloco }}
            </h2>
            <p class="text-meta text-fg-muted">{{ 'ask.formSuggest.reviewHint' | transloco }}</p>
          </div>
          @if (!items.length) {
            <p class="text-ui text-fg-muted">{{ 'ask.formSuggest.nothing' | transloco }}</p>
          }
          <ul class="flex flex-col gap-3">
            @for (item of items; track item.field.name) {
              <li class="rounded-tile border border-border p-3">
                <label class="flex items-start gap-2">
                  <input
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 flex-none"
                    [checked]="selected().has(item.field.name)"
                    (change)="toggle(item.field.name)"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block text-ui font-semibold text-fg">
                      {{ item.def.labelKey | transloco }}
                      @if (!item.field.changed) {
                        <span class="ml-1 text-meta font-normal text-fg-muted">
                          {{ 'ask.formSuggest.unchanged' | transloco }}
                        </span>
                      }
                    </span>
                    @if (item.field.changed && item.before) {
                      <span
                        class="mt-1 block text-meta text-fg-muted line-through"
                        [class.line-clamp-2]="item.def.long"
                      >
                        {{ item.before }}
                      </span>
                    }
                    @if (item.def.long) {
                      <div
                        class="cf-prose mt-1 max-h-72 overflow-y-auto text-ui leading-relaxed text-fg"
                        [innerHTML]="item.after | appMarkdown"
                      ></div>
                    } @else {
                      <span class="mt-1 block text-ui text-fg">{{ item.after }}</span>
                    }
                    @if (item.field.rationale) {
                      <span class="mt-1 block text-meta text-fg-subtle">
                        {{ item.field.rationale }}
                      </span>
                    }
                  </span>
                </label>
              </li>
            }
          </ul>
          <div class="flex flex-wrap justify-end gap-2">
            <app-button variant="ghost" size="sm" (click)="discard()">
              {{ 'ask.formSuggest.discard' | transloco }}
            </app-button>
            <app-button
              variant="secondary"
              size="sm"
              [disabled]="!selected().size"
              (click)="applySelected()"
            >
              {{ 'ask.formSuggest.applySelected' | transloco }}
            </app-button>
            <app-button
              variant="primary"
              size="sm"
              [disabled]="!items.length"
              data-testid="form-suggest-apply-all"
              (click)="applyAll()"
            >
              {{ 'ask.formSuggest.applyAll' | transloco }}
            </app-button>
          </div>
        </section>
      }
    }
  `,
})
export class FormSuggest {
  private readonly api = inject(FormSuggestApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly availability = inject(AiAvailability);

  /** The server's form suggest key, `<module>.<form>` (e.g. `context.policy`). */
  readonly suggestKey = input.required<string>();
  /** The fields the suggestion may fill, in form order. */
  readonly fields = input.required<readonly FormSuggestFieldDef[]>();
  /** Current form values by backend field name. */
  readonly values = input<Readonly<Record<string, unknown>>>({});
  /** Where the form was opened from (sent as `context`). */
  readonly context = input<Readonly<Record<string, unknown>>>({});
  /** Editing an existing record: "Forbedre med forslag" (mode `improve`), no offers. */
  readonly editing = input(false);
  /** Main button label key for a new record ("Foreslå policy"). */
  readonly labelKey = input('ask.formSuggest.suggest');
  /** Only a title is filled in: show "Foreslå resten ut fra tittelen". */
  readonly titleOnly = input(false);
  /** i18n key prefix of offer names (`<prefix><offer.key>`, host scope). */
  readonly offerKeyPrefix = input('');
  /** `field`: a small "Skriv om" for the `only` fields. */
  readonly variant = input<'form' | 'field'>('form');
  readonly only = input<readonly string[] | null>(null);

  /** The accepted values (nothing is saved). */
  readonly applied = output<AcceptedSuggestion>();
  /** An offer was picked: the host starts the form from `offer.values`. */
  readonly offerPicked = output<FormSuggestOffer>();

  protected readonly offers = signal<readonly FormSuggestOffer[]>([]);
  protected readonly missingFacts = signal<readonly string[]>([]);
  protected readonly running = signal(false);
  protected readonly error = signal(false);
  private readonly result = signal<readonly SuggestedField[] | null>(null);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  private readonly offerContext = signal<string | null>(null);
  private readonly serverOff = signal(false);

  protected readonly visible = computed(
    () => !this.availability.unavailable() && !this.serverOff(),
  );

  protected readonly review = computed(() => {
    const result = this.result();
    if (!result) {
      return null;
    }
    const defs = new Map(this.fields().map((def) => [def.name, def]));
    const values = this.values();
    return result
      .filter((field) => defs.has(field.name))
      .map((field) => {
        const def = defs.get(field.name)!;
        return {
          field,
          def,
          before: this.describeCurrent(def, values[field.name]),
          after: this.describe(def, field),
        };
      });
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const key = this.suggestKey();
      const form = this.variant() === 'form';
      if (orgId && form) {
        untracked(() => this.loadOptions(orgId, key));
      }
    });
  }

  /** Run the suggestion (also callable from a host menu). */
  run(extraValues: Readonly<Record<string, unknown>> = {}): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.running()) {
      return;
    }
    this.error.set(false);
    this.running.set(true);
    const offer = this.offerContext();
    const only = this.only();
    this.request.unsubscribe();
    this.request = this.api
      .suggest(orgId, this.suggestKey(), {
        values: { ...this.values(), ...extraValues },
        context: offer ? { ...this.context(), offer } : this.context(),
        mode: this.editing() || this.variant() === 'field' ? 'improve' : 'create',
        ...(only ? { fields: only } : {}),
      })
      .subscribe({
        next: (result) => {
          this.running.set(false);
          this.missingFacts.set(result.missing_facts);
          this.result.set(result.fields);
          this.selected.set(new Set(result.fields.filter((f) => f.changed).map((f) => f.name)));
        },
        error: (error: unknown) => {
          this.running.set(false);
          if (error instanceof HttpErrorResponse && error.status === 503) {
            this.availability.markUnavailable();
            return;
          }
          this.error.set(true);
        },
      });
  }

  protected pickOffer(offer: FormSuggestOffer): void {
    this.offerContext.set(offer.key);
    this.offerPicked.emit(offer);
    this.offers.set([]);
    this.run(offer.values);
  }

  protected toggle(name: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  protected applyAll(): void {
    this.emit((this.result() ?? []).map((f) => f.name));
  }

  protected applySelected(): void {
    this.emit([...this.selected()]);
  }

  protected discard(): void {
    this.result.set(null);
  }

  private emit(names: readonly string[]): void {
    const accepted: Record<string, SuggestedField> = {};
    for (const field of this.result() ?? []) {
      if (names.includes(field.name)) {
        accepted[field.name] = field;
      }
    }
    this.result.set(null);
    this.applied.emit(accepted);
  }

  private loadOptions(orgId: string, key: string): void {
    this.api.options(orgId, key).subscribe({
      next: (options) => {
        if (!options.ai_enabled) {
          this.serverOff.set(true);
          return;
        }
        this.offers.set(options.offers);
        this.missingFacts.set(options.missing_facts);
      },
      error: () => this.offers.set([]),
    });
  }

  private describe(def: FormSuggestFieldDef, field: SuggestedField): string {
    if (def.format) {
      return def.format(field.value, field);
    }
    if (field.display) {
      return Array.isArray(field.display) ? field.display.join(', ') : String(field.display);
    }
    return plain(field.value);
  }

  private describeCurrent(def: FormSuggestFieldDef, value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    if (def.format) {
      return def.format(value, {
        name: def.name,
        value,
        rationale: null,
        changed: false,
        display: null,
      });
    }
    return plain(value);
  }
}

function plain(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join(', ');
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
