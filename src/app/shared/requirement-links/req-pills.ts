import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';

/** Small grey requirement chips ("ISO 27001 A.5.24"), shown only with Vis krav on. */
@Component({
  selector: 'app-req-pills',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (vis.show() && refs().length) {
      <div class="mt-1.5 flex flex-wrap gap-1.5" data-testid="req-pills">
        @for (r of refs(); track r) {
          <span class="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11.5px] text-fg-muted">{{ r }}</span>
        }
      </div>
    }
  `,
})
export class ReqPills {
  protected readonly vis = inject(RequirementsVisibilityService);
  readonly refs = input<readonly string[]>([]);
}
