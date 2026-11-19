import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * One connection of a continuity record, the same way everywhere (docs/ux-guide.md
 * §2.7): type icon and type word, code, title (a link when the reader may open it),
 * then the record's status and any short facts (projected), on one row that wraps on
 * phones. Put them in an element with `role="list"`; each one is a list item.
 */
@Component({
  selector: 'app-continuity-linked-record',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex items-start gap-2.5 rounded-tile border border-border bg-surface px-3 py-2 text-ui',
    role: 'listitem',
    'data-testid': 'linked-record',
  },
  template: `
    <span
      class="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-tile bg-surface-2 text-fg-muted"
      aria-hidden="true"
    >
      <app-icon [name]="icon()" [size]="15" />
    </span>
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span class="text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase">{{
          typeText() || (typeKey() | transloco)
        }}</span>
        @if (code()) {
          <span class="font-mono text-meta text-fg-muted">{{ code() }}</span>
        }
      </span>
      @if (link(); as target) {
        <a
          [routerLink]="target"
          class="min-w-0 font-semibold [overflow-wrap:anywhere] text-fg hover:text-accent hover:underline"
          >{{ title() }}</a
        >
      } @else {
        <span class="min-w-0 font-semibold [overflow-wrap:anywhere] text-fg">{{ title() }}</span>
      }
      <span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted empty:hidden"
        ><ng-content
      /></span>
    </span>
  `,
})
export class ContinuityLinkedRecord {
  readonly icon = input.required<string>();
  /** i18n key of the record type ("Kontinuitetsplan"). */
  readonly typeKey = input<string>('');
  /** The record type as text (wins over `typeKey`), e.g. from the entity-type registry. */
  readonly typeText = input<string | null | undefined>(null);
  readonly code = input<string | null | undefined>(null);
  readonly title = input.required<string>();
  readonly link = input<string | readonly unknown[] | null | undefined>(null);
}
