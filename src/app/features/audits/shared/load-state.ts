import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { LoadState } from './loadable';

/** Loading skeleton or the neutral error with "Prøv igjen" of an audit page or panel. */
@Component({
  selector: 'app-audit-load-state',
  imports: [ErrorState, LoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
  template: `
    @if (state() === 'loading') {
      <app-loading-state [rows]="rows()" />
    } @else if (state() === 'error') {
      <app-error-state (retry)="retry.emit()" />
    }
  `,
})
export class AuditLoadState {
  readonly state = input.required<LoadState>();
  readonly rows = input(4);
  readonly retry = output<void>();
}
