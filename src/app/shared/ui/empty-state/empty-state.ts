import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';

/**
 * A plain empty state (no results for a filter, nothing to show in a panel).
 * Empty *lists* of a module use `app-teaching-empty` instead, which also explains
 * what the record is for. The CTA uses the same words as the page's primary button.
 *
 *   <app-empty-state titleKey="ui.empty.noResults" bodyKey="ui.empty.noResultsBody"
 *       ctaKey="ui.empty.clearFilters" (cta)="clearFilters()" />
 */
@Component({
  selector: 'app-empty-state',
  imports: [RouterLink, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      data-testid="empty-state"
      class="flex flex-col items-center rounded-card border border-dashed border-border-strong bg-surface px-6 text-center"
      [class]="compact() ? 'py-6' : 'py-10'"
    >
      <span
        class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
        aria-hidden="true"
        ><app-icon [name]="icon()" [size]="20"
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
    </div>
  `,
})
export class EmptyState {
  private readonly language = inject(LanguageService);

  readonly icon = input('inbox');
  readonly titleKey = input<string | null | undefined>(null);
  readonly titleParams = input<Record<string, unknown> | undefined>(undefined);
  readonly bodyKey = input<string | null | undefined>(null);
  readonly bodyParams = input<Record<string, unknown> | undefined>(undefined);
  readonly ctaKey = input<string | null | undefined>(null);
  /** Link for the CTA; without it the `cta` output fires. */
  readonly ctaLink = input<string | readonly unknown[] | null | undefined>(null);
  readonly ctaVariant = input<'primary' | 'secondary'>('primary');
  readonly compact = input(false);

  readonly cta = output<void>();

  protected readonly titleText = computed(() =>
    this.translate(this.titleKey() || 'ui.empty.title', this.titleParams()),
  );
  protected readonly bodyText = computed(() => this.translate(this.bodyKey(), this.bodyParams()));
  protected readonly ctaText = computed(() => this.translate(this.ctaKey()));

  private translate(key: string | null | undefined, params?: Record<string, unknown>): string {
    return key ? this.language.translate(key, params) : '';
  }
}
