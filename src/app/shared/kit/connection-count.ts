import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../ui/icon/icon';
import { provideKitScope } from './kit-scope';

/**
 * How many records a list row is connected to, as a small link icon + number
 * (P4). Renders nothing while unknown; "0" is shown muted so unconnected rows
 * stand out. Pair with `ConnectionCountsService.load()`.
 */
@Component({
  selector: 'app-connection-count',
  imports: [TranslocoPipe, Icon],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @let n = count();
    @if (n !== null && n !== undefined) {
      <span
        class="inline-flex items-center gap-1 text-meta font-semibold"
        [class]="n > 0 ? 'text-fg-muted' : 'text-fg-subtle'"
        [title]="
          (n === 1 ? 'kit.connections.countOne' : 'kit.connections.count') | transloco: { count: n }
        "
        data-testid="connection-count"
      >
        <app-icon name="link" [size]="13" />
        <span aria-hidden="true">{{ n }}</span>
        <span class="sr-only">{{
          (n === 1 ? 'kit.connections.countOne' : 'kit.connections.count') | transloco: { count: n }
        }}</span>
      </span>
    }
  `,
})
export class ConnectionCount {
  readonly count = input<number | null | undefined>(null);
}
