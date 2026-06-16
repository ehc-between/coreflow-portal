import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Surface container with the design-system border, radius, padding and shadow. */
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="rounded-card border border-border bg-surface shadow-card"
      [class.p-0]="!padded()"
      [class.p-4]="padded()"
    >
      <ng-content />
    </div>
  `,
})
export class Card {
  readonly padded = input(true);
}
