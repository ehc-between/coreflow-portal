import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RECORD_ROW_COLUMNS } from '../../../shared/ui/record-row/record-row';

/**
 * Column headers for a list of `app-record-row`s (from 1024 px) with the module's own
 * words for the owner and date columns ("Ansettende leder", "Oppstart", "Slettes" …).
 * Same grid as `app-record-row-header`; hidden from the list semantics.
 */
@Component({
  selector: 'app-recruitment-row-header',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hidden lg:block', 'aria-hidden': 'true' },
  template: `
    <div
      class="border-b border-border px-4 py-2 text-micro font-semibold tracking-wide text-fg-subtle uppercase"
      [class]="columns"
    >
      <span>{{ 'ui.recordRow.code' | transloco }}</span>
      <span>{{ titleKey() | transloco }}</span>
      <span>{{ 'ui.recordRow.coverage' | transloco }}</span>
      <span>{{ 'ui.recordRow.status' | transloco }}</span>
      <span>{{ ownerKey() ? (ownerKey()! | transloco) : '' }}</span>
      <span>{{ dateKey() ? (dateKey()! | transloco) : '' }}</span>
    </div>
  `,
})
export class RecruitmentRowHeader {
  readonly titleKey = input('ui.recordRow.title');
  readonly ownerKey = input<string | null>(null);
  readonly dateKey = input<string | null>(null);

  protected readonly columns = RECORD_ROW_COLUMNS;
}
