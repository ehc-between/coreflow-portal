import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';

/** Which kind of empty a list or panel is (see {@link EmptyState}). */
export type EmptyStateKind = 'first' | 'cleared' | 'filtered';

const DEFAULTS: Readonly<
  Record<EmptyStateKind, { titleKey: string; bodyKey: string; icon: string }>
> = {
  first: { titleKey: 'ui.empty.title', bodyKey: 'ui.empty.firstBody', icon: 'inbox' },
  cleared: { titleKey: 'ui.empty.cleared', bodyKey: 'ui.empty.clearedBody', icon: 'check' },
  filtered: { titleKey: 'ui.empty.noResults', bodyKey: 'ui.empty.noResultsBody', icon: 'search' },
};

/**
 * A plain empty state (no results for a filter, nothing to show in a panel).
 * Empty *lists* of a module use `app-teaching-empty` instead, which also explains
 * what the record is for. The CTA uses the same words as the page's primary button.
 *
 * Copy rules (U41): an empty state gives the reason, one action and, where the
 * module has templates, "Fill in from a template". Say which empty it is with `kind`:
 * - `first`: nothing registered yet ("Nothing here yet" + reason + action + template).
 * - `cleared`: a work queue that has been emptied ("You're all caught up").
 * - `filtered`: a filter / search matched nothing ("No matches" + "Clear filters").
 * Never "No data": name what is missing.
 *
 *   <app-empty-state titleKey="ui.empty.noResults" bodyKey="ui.empty.noResultsBody"
 *       ctaKey="ui.empty.clearFilters" (cta)="clearFilters()" />
 *   <app-empty-state kind="cleared" />
 *   <app-empty-state kind="first" bodyKey="x.empty.why" ctaKey="x.new" ctaLink="new"
 *       templateLink="/documents/templates" />
 */
@Component({
  selector: 'app-empty-state',
  imports: [RouterLink, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      data-testid="empty-state"
      [attr.data-kind]="kind() || null"
      class="flex flex-col items-center rounded-card border border-dashed border-border-strong bg-surface px-6 text-center"
      [class]="compact() ? 'py-6' : 'py-10'"
    >
      <span
        class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
        aria-hidden="true"
        ><app-icon [name]="iconName()" [size]="20"
      /></span>
      <p class="text-card font-semibold text-fg">{{ titleText() }}</p>
      @if (bodyText()) {
        <p class="mt-1 max-w-[52ch] text-ui text-fg-muted">{{ bodyText() }}</p>
      }
      @if (ctaText()) {
        <div class="mt-4">
          @if (ctaLink(); as link) {
            <a
              [routerLink]="link"
              class="inline-flex h-9 items-center gap-2 rounded-tile bg-accent px-4 text-ui font-semibold text-white hover:bg-accent-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
              >{{ ctaText() }}</a
            >
          } @else {
            <app-button [variant]="ctaVariant()" (click)="cta.emit()">{{ ctaText() }}</app-button>
          }
        </div>
      }
      @if (templateLink(); as link) {
        <a
          data-testid="empty-state-template"
          [routerLink]="link"
          class="mt-3 text-ui font-medium text-accent underline-offset-2 hover:underline"
          >{{ templateText() }}</a
        >
      }
    </div>
  `,
})
export class EmptyState {
  private readonly language = inject(LanguageService);

  /** Which empty this is; picks the default title / body / icon (see the class doc). */
  readonly kind = input<EmptyStateKind | null>(null);
  readonly icon = input<string | null>(null);
  readonly titleKey = input<string | null | undefined>(null);
  readonly titleParams = input<Record<string, unknown> | undefined>(undefined);
  readonly bodyKey = input<string | null | undefined>(null);
  readonly bodyParams = input<Record<string, unknown> | undefined>(undefined);
  readonly ctaKey = input<string | null | undefined>(null);
  /** Link for the CTA; without it the `cta` output fires. */
  readonly ctaLink = input<string | readonly unknown[] | null | undefined>(null);
  readonly ctaVariant = input<'primary' | 'secondary'>('primary');
  readonly compact = input(false);
  /** Link to the module's templates; shows "Fill in from a template" under the CTA. */
  readonly templateLink = input<string | readonly unknown[] | null | undefined>(null);
  readonly templateKey = input<string | null | undefined>(null);

  readonly cta = output<void>();

  protected readonly titleText = computed(() =>
    this.translate(
      this.titleKey() || DEFAULTS[this.kind() ?? 'first'].titleKey,
      this.titleParams(),
    ),
  );
  protected readonly bodyText = computed(() =>
    this.translate(this.bodyKey() || this.defaultBodyKey(), this.bodyParams()),
  );
  protected readonly iconName = computed(
    () => this.icon() || DEFAULTS[this.kind() ?? 'first'].icon,
  );
  protected readonly templateText = computed(() =>
    this.translate(this.templateKey() || 'ui.empty.fromTemplate'),
  );
  protected readonly ctaText = computed(() => this.translate(this.ctaKey()));

  /** Default body only when the kind is explicit (keeps legacy title-only usages unchanged). */
  private defaultBodyKey(): string | null {
    const kind = this.kind();
    return kind ? DEFAULTS[kind].bodyKey : null;
  }

  private translate(key: string | null | undefined, params?: Record<string, unknown>): string {
    return key ? this.language.translate(key, params) : '';
  }
}
