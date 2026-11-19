import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import { toneFor } from '../../../shared/ui/tones';
import { DeviationRef } from '../data/inspection.models';

/** Status dot colour per tone. */
const DOT: Readonly<Record<string, string>> = {
  pass: 'bg-pass',
  warn: 'bg-warn',
  fail: 'bg-fail',
  info: 'bg-info',
  accent: 'bg-accent',
  neutral: 'bg-fg-subtle',
};

/** A deviation's workflow stage -> the shared lifecycle tone value. */
function toneValue(status: string): string {
  switch (status) {
    case 'investigating':
    case 'action':
      return 'in_progress';
    case 'verification':
      return 'under_review';
    default:
      return status;
  }
}

/**
 * The deviation a finding became, as one clear link: type icon, "Avvik", code,
 * status (dot + words) and an arrow (docs/ux-guide.md §2.7, "connections are
 * clear"). Status words come from the global `deviations.status.*`.
 */
@Component({
  selector: 'app-deviation-link',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex max-w-full' },
  template: `
    @let d = deviation();
    <a
      [routerLink]="d.url"
      class="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-tile border border-border bg-surface px-2 py-1 text-ui text-fg hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      data-testid="deviation-link"
    >
      <app-icon name="alert" [size]="13" class="flex-none text-fg-muted" />
      <span class="font-semibold">{{ 'inspections.findings.deviation' | transloco }}</span>
      <span class="font-mono text-meta text-fg-muted">{{ d.code }}</span>
      <span class="inline-flex flex-none items-center gap-1 text-meta font-semibold text-fg-muted">
        <span aria-hidden="true" class="h-2 w-2 rounded-full" [class]="dot()"></span>
        {{ 'deviations.status.' + d.status | transloco }}
      </span>
      <span aria-hidden="true" class="text-accent">→</span>
    </a>
  `,
})
export class DeviationLink {
  readonly deviation = input.required<DeviationRef>();
  protected readonly dot = computed(
    () => DOT[toneFor('lifecycle', toneValue(this.deviation().status))] ?? DOT['neutral'],
  );
}
