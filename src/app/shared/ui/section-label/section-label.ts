import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Uppercase, tracked-out group heading (used for nav sections and the like). */
@Component({
  selector: 'app-section-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="px-2.5 pt-3 pb-1 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
      <ng-content />
    </div>
  `,
})
export class SectionLabel {}
