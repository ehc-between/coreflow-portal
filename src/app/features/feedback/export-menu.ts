import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { EXPORT_FORMATS, ExportFormat } from './data/feedback.models';

/**
 * "Eksporter ⋯": download the current view as Excel, CSV or PDF (audit evidence).
 * The page does the download; this only offers the formats.
 */
@Component({
  selector: 'app-feedback-export-menu',
  imports: [TranslocoPipe, OverflowMenu, MenuItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overflow-menu
      labelKey="feedback.export.button"
      [align]="align()"
      data-testid="export-menu"
    >
      @for (f of formats; track f) {
        <button
          appMenuItem
          type="button"
          (click)="!busy() && chosen.emit(f)"
          [attr.data-testid]="'export-' + f"
        >
          {{ 'feedback.export.formats.' + f | transloco }}
        </button>
      }
    </app-overflow-menu>
  `,
})
export class FeedbackExportMenu {
  readonly busy = input(false);
  readonly align = input<'start' | 'end'>('end');
  readonly chosen = output<ExportFormat>();
  protected readonly formats = EXPORT_FORMATS;
}
