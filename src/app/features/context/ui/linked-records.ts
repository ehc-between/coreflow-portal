import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EntityChip, EntityChipRef } from '../../../shared/kit/entity-chip';
import { Icon } from '../../../shared/ui/icon/icon';

/** Icon per record type of a connection row (falls back to a link). */
const TYPE_ICONS: Readonly<Record<string, string>> = {
  document: 'documents',
  objective: 'target',
  process: 'procedures',
  risk: 'risk',
  opportunity: 'flag',
  task: 'checkcircle',
  deviation: 'alert',
  scope_statement: 'flag',
  policy: 'shield',
  interested_party: 'people',
  context_analysis: 'flag',
  responsibility: 'people',
  compliance_obligation: 'scale',
  supplier: 'link',
  contract: 'contract',
};

/** The icon of a record type in a connection row. */
export function linkedTypeIcon(entityType: string): string {
  return TYPE_ICONS[entityType] ?? 'link';
}

/**
 * Connected records as clear rows (docs/ux-guide.md §2.7, "make connections
 * clear"): type icon, then type · code · status and the title, the whole row a
 * link to the record.
 */
@Component({
  selector: 'app-context-linked-records',
  imports: [EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul class="flex flex-col gap-1.5" data-testid="linked-records">
      @for (ref of refs(); track ref.entity_type + ref.entity_id) {
        <li
          class="flex min-w-0 items-center gap-2.5 rounded-tile border border-border bg-surface py-1.5 pr-2 pl-2.5 hover:border-border-strong"
          data-testid="linked-record"
        >
          <span
            class="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-2 text-fg-muted"
            aria-hidden="true"
          >
            <app-icon [name]="icon(ref.entity_type)" [size]="15" />
          </span>
          <app-entity-chip
            class="min-w-0 flex-1"
            [ref]="ref"
            [statusText]="true"
            [stacked]="true"
          />
        </li>
      }
    </ul>
  `,
})
export class LinkedRecords {
  readonly refs = input.required<readonly EntityChipRef[]>();

  protected icon(entityType: string): string {
    return linkedTypeIcon(entityType);
  }
}
