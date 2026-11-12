import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Raci } from '../data/context.models';

const TONE: Readonly<Record<Raci, string>> = {
  R: 'bg-accent text-white',
  A: 'bg-fail text-white',
  C: 'bg-info-soft text-info',
  I: 'bg-surface-2 text-fg-muted',
};

/** The coloured R / A / C / I square used in assignments and the matrix. */
@Component({
  selector: 'app-context-raci-letter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span
      class="inline-flex h-6 w-6 items-center justify-center rounded-[6px] font-mono text-[12px] font-bold"
      [class]="tone()"
      aria-hidden="true"
      >{{ raci() }}</span
    >
  `,
})
export class RaciLetter {
  readonly raci = input.required<Raci>();
  protected readonly tone = computed(() => TONE[this.raci()]);
}
