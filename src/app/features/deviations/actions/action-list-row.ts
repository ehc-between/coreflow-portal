import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActionListItem } from '../../../core/deviations/deviation.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { RecordRow } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  actionKindLabelKey,
  actionStatusLabelKey,
  actionStatusToneValue,
  isActionOverdue,
} from '../deviation-enums';

/**
 * One row of the cross-deviation action list on the shared row frame (audit
 * finding 3): the parent deviation's code, the action as the title, "kind · the
 * deviation" as the subtitle, the status badge, owner and due date ("Forfalt"
 * when late). The row links to the parent deviation, where the action is edited.
 * Below 640 px the slots stack, so nothing overlaps the title.
 */
@Component({
  selector: 'app-action-list-row',
  imports: [RecordRow, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = action();
    <app-record-row
      [code]="a.deviation_code"
      [title]="a.description"
      [subtitle]="subtitle()"
      [link]="['/deviations', a.deviation_id]"
      [owner]="showOwner() ? (a.owner_name ?? unassigned()) : null"
      [date]="a.due_at"
      dateKind="due"
      [overdue]="overdue()"
    >
      <app-status-badge
        badges
        meaning="lifecycle"
        [value]="statusValue(a.status)"
        [labelKey]="statusLabelKey(a.status)"
      />
    </app-record-row>
  `,
})
export class ActionListRow {
  private readonly language = inject(LanguageService);

  readonly action = input.required<ActionListItem>();
  /** Show the owner column (off where every row is the user's). */
  readonly showOwner = input(false);

  protected readonly overdue = computed(() =>
    isActionOverdue(this.action().due_at, this.action().status),
  );
  protected readonly subtitle = computed(() => {
    const a = this.action();
    return `${this.language.translate(actionKindLabelKey(a.kind))} · ${a.deviation_title}`;
  });
  protected readonly unassigned = computed(() =>
    this.language.translate('deviations.actions.unassigned'),
  );

  protected readonly statusLabelKey = actionStatusLabelKey;
  protected readonly statusValue = actionStatusToneValue;
}
