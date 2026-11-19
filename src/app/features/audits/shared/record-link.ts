import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon/icon';
import { Badge } from '../../../shared/ui/badge/badge';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { Tone, ToneMeaning, toneFor } from '../../../shared/ui/tones';

/** The status shown on an {@link AuditRecordLink}: a badge (module key or literal label). */
export interface RecordLinkStatus {
  readonly meaning: ToneMeaning;
  readonly value: string;
  /** Module label key; without one the badge shows the plain status word. */
  readonly labelKey?: string | null;
  /** Already translated label (another module's status); wins over `labelKey`. */
  readonly label?: string | null;
}

/**
 * One connected record on an audit page ("Funnet i revisjonen", "Del av
 * programmet", a linked deviation): type icon, type and code, the title and the
 * status, the whole row a link. Used where the connection is part of how the
 * audit works (docs/ux-guide.md §2.7: "what is connected to what").
 */
@Component({
  selector: 'app-audit-record-link',
  imports: [RouterLink, Badge, Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <a
      [routerLink]="link()"
      class="group flex min-w-0 items-start gap-2.5 rounded-tile outline-none focus-visible:ring-2 focus-visible:ring-accent"
      data-testid="audit-record-link"
    >
      <span
        class="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-tile bg-surface-2 text-fg-muted group-hover:text-accent"
        aria-hidden="true"
      >
        <app-icon [name]="icon()" [size]="15" />
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-micro text-fg-subtle">
          <span class="font-semibold tracking-[0.04em] uppercase">{{ type() }}</span>
          @if (code()) {
            <span class="font-mono">{{ code() }}</span>
          }
          @if (status(); as s) {
            @if (s.label) {
              <app-badge [tone]="tone(s)">{{ s.label }}</app-badge>
            } @else {
              <app-status-badge
                [meaning]="s.meaning"
                [value]="s.value"
                [labelKey]="s.labelKey"
                [plain]="!s.labelKey"
              />
            }
          }
        </span>
        <span
          class="line-clamp-2 text-ui font-medium text-fg [overflow-wrap:anywhere] group-hover:text-accent group-hover:underline"
          >{{ title() }}</span
        >
      </span>
    </a>
  `,
})
export class AuditRecordLink {
  readonly link = input.required<string | readonly unknown[]>();
  readonly icon = input('audit');
  /** Translated record type ("Revisjon"). */
  readonly type = input.required<string>();
  readonly code = input<string | null | undefined>(null);
  readonly title = input.required<string>();
  readonly status = input<RecordLinkStatus | null>(null);

  protected tone(s: RecordLinkStatus): Tone {
    return toneFor(s.meaning, s.value);
  }
}
