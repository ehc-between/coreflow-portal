import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HubTile } from './hub-data';

/** Dot colours of the prototype tones. */
export const DOT_CLASS: Readonly<Record<string, string>> = {
  bad: 'bg-fail',
  warn: 'bg-warn',
  ok: 'bg-pass',
  info: 'bg-accent',
};

/**
 * The prototype's `.hub` grid (docs/prototype/fiken-style-ia.html): a door per
 * register, with its count, name and a grey line saying what it is for. Three
 * columns on desktop, two on tablets, one on phones.
 */
@Component({
  selector: 'app-hub-tiles',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3" data-testid="hub-tiles">
      @for (tile of tiles(); track tile.key) {
        <li class="min-w-0">
          <a
            [routerLink]="tile.link"
            [queryParams]="tile.query ?? null"
            class="flex h-full flex-col gap-1.5 rounded-card border border-border bg-surface p-[18px] text-fg no-underline hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            data-testid="hub-tile"
            [attr.data-key]="tile.key"
          >
            @if (tile.count !== null) {
              <span
                class="font-display text-[24px] leading-tight font-semibold tabular-nums"
                data-testid="hub-tile-count"
                >{{ tile.count }}</span
              >
            }
            <b class="text-card font-semibold">{{ tile.labelKey | transloco }}</b>
            <span class="text-ui text-fg-muted">{{ tile.hintKey | transloco }}</span>
            @if (tile.status; as s) {
              <span class="mt-1 flex items-center gap-2 text-ui text-fg-muted">
                <span class="h-2.5 w-2.5 flex-none rounded-full" [class]="dot(s.tone)"></span>
                {{ s.key | transloco: s.params }}
              </span>
            }
          </a>
        </li>
      }
    </ul>
  `,
})
export class HubTiles {
  readonly tiles = input.required<readonly HubTile[]>();

  protected dot(tone: string): string {
    return DOT_CLASS[tone] ?? 'bg-fg-subtle';
  }
}
