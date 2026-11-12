import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The small uppercase heading above a field on M01 detail pages. */
@Component({
  selector: 'app-context-field-heading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block mb-1 text-[12px] font-semibold tracking-[0.02em] text-fg-subtle uppercase',
  },
  template: `<ng-content />`,
})
export class FieldHeading {}
