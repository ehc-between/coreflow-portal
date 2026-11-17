import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LinkOrigin, RequirementLabel } from '../../core/standards/standards.models';
import { Icon } from '../ui/icon/icon';
import { labelText, positionText, requirementRoute } from './requirement-label';

/**
 * Evidence chip for one requirement (plan 2.1, "two visual languages"): an
 * outlined pill reading "ISO 9001 · 8.4.1", with "(krav 2 av 3)" when the
 * clause has several requirements. Confirmed links show a solid check;
 * suggestions have a dashed border and the word "Forslag". The clause title
 * (and requirement text) is the tooltip. Links to the requirement in its
 * standard's workspace unless `link` is false.
 */
@Component({
  selector: 'app-requirement-chip',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex max-w-full min-w-0' },
  template: `
    @if (link()) {
      <a
        [routerLink]="route().commands"
        [queryParams]="route().queryParams"
        [class]="classes()"
        [title]="tooltip()"
        data-testid="requirement-chip"
        [attr.data-status]="status()"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <span
        [class]="classes()"
        [title]="tooltip()"
        data-testid="requirement-chip"
        [attr.data-status]="status()"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </span>
    }
    <ng-template #body>
      @if (status() === 'suggested') {
        <app-icon name="spark" [size]="12" class="flex-none" />
      } @else if (status() === 'confirmed') {
        <app-icon name="checkcircle" [size]="12" class="flex-none text-pass" />
      }
      <span class="min-w-0 truncate">{{ text() }}</span>
      @if (showPosition() && position(); as pos) {
        <span class="flex-none font-normal text-fg-subtle">{{
          pos.key | transloco: pos.params
        }}</span>
      }
      @if (status() === 'suggested' && marker()) {
        <span class="flex-none text-micro font-bold tracking-wide uppercase">{{
          'standards.reqs.suggestion' | transloco
        }}</span>
      }
    </ng-template>
  `,
})
export class RequirementChip {
  readonly label = input.required<RequirementLabel>();
  /** `plain`: a reference without evidence (e.g. a gap), no status icon. */
  readonly status = input<'confirmed' | 'suggested' | 'plain'>('confirmed');
  /** Why the link exists; only used for styling hooks / tests today. */
  readonly origin = input<LinkOrigin | null | undefined>(null);
  /** Render as a router link to the requirement (default) or as plain text. */
  readonly link = input(true);
  /**
   * Positions of the linked requirements when one chip stands for several of the
   * clause ("(krav 1 og 2 av 3)", "(alle 3 krav)"); default: the label's own.
   */
  readonly positions = input<readonly number[] | null>(null);
  /** Show the word "Forslag" on suggestions (off where the context already says so). */
  readonly marker = input(true);
  /** Show "(krav 2 av 3)" in the chip (off where the host shows it elsewhere). */
  readonly showPosition = input(true);

  protected readonly text = computed(() => labelText(this.label().short, this.label().number));
  protected readonly position = computed(() =>
    positionText(this.label(), this.positions() ?? [this.label().req_index]),
  );
  protected readonly route = computed(() => requirementRoute(this.label()));
  protected readonly tooltip = computed(() => {
    const { title, text } = this.label();
    return [title, text].filter((part) => !!part).join(' — ');
  });
  protected readonly classes = computed(
    () =>
      'inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
      (this.status() === 'suggested'
        ? 'border-dashed border-accent-border bg-surface text-accent'
        : 'border-border-strong bg-surface text-fg') +
      (this.link() ? ' hover:border-accent hover:text-accent' : ''),
  );
}
