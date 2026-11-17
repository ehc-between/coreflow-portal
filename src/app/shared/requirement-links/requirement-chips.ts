import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { RequirementLabel, RequirementLink } from '../../core/standards/standards.models';
import { pluralKey } from '../i18n/plural';
import { RequirementChip } from './requirement-chip';
import {
  compareNumbers,
  fallbackLabel,
  fixedShortName,
  frameworkOf,
  shortNameKey,
} from './requirement-label';

/** Chips shown before the "+N" overflow chip. */
export const REQUIREMENT_CHIPS_MAX = 6;

interface ChipView {
  readonly id: string;
  readonly label: RequirementLabel;
  readonly status: 'confirmed' | 'suggested';
}

/**
 * A compact row of the requirements a record documents: one
 * `app-requirement-chip` per link (confirmed first; suggestions dashed with
 * "Forslag"), each deep-linking to the requirement. Past `max` chips a "+N"
 * chip emits `more` (the host reveals the full panel). Renders nothing when
 * there are no links.
 */
@Component({
  selector: 'app-requirement-chips',
  imports: [TranslocoPipe, RequirementChip],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sorted().length > 0) {
      <div class="flex flex-wrap items-center gap-1.5" data-testid="requirement-chips">
        <span class="mr-0.5 text-meta font-semibold text-fg-subtle">{{
          'standards.reqs.title' | transloco
        }}</span>
        @for (chip of shown(); track chip.id) {
          <app-requirement-chip [label]="chip.label" [status]="chip.status" />
        }
        @if (hidden() > 0) {
          <button
            type="button"
            class="rounded-full border border-border px-2 py-0.5 text-meta font-semibold text-fg-muted hover:border-accent hover:text-accent"
            [attr.aria-label]="
              plural('standards.reqs.moreLabel', hidden()) | transloco: { count: hidden() }
            "
            data-testid="requirement-chips-more"
            (click)="more.emit()"
          >
            +{{ hidden() }}
          </button>
        }
      </div>
    }
  `,
})
export class RequirementChips {
  private readonly transloco = inject(TranslocoService);

  /** The record's links (rejected ones are ignored). */
  readonly links = input<readonly RequirementLink[]>([]);
  readonly max = input(REQUIREMENT_CHIPS_MAX);

  /** The "+N" chip was clicked. */
  readonly more = output<void>();

  protected readonly plural = pluralKey;
  /** Confirmed before suggested, then by standard and clause number. */
  protected readonly sorted = computed<readonly ChipView[]>(() =>
    this.links()
      .filter((l) => l.status !== 'rejected')
      .map<ChipView>((l) => ({
        id: l.id,
        label: l.label ?? fallbackLabel(l, this.short(l.standard_key)),
        status: l.status === 'suggested' ? 'suggested' : 'confirmed',
      }))
      .sort(
        (a, b) =>
          Number(a.status === 'suggested') - Number(b.status === 'suggested') ||
          a.label.short.localeCompare(b.label.short) ||
          compareNumbers(a.label.number, b.label.number) ||
          a.label.req_index - b.label.req_index,
      ),
  );
  protected readonly shown = computed(() => this.sorted().slice(0, this.max()));
  protected readonly hidden = computed(() => Math.max(0, this.sorted().length - this.max()));

  private short(standardKey: string): string {
    const framework = frameworkOf(standardKey);
    const key = shortNameKey(framework);
    return key ? this.transloco.translate(key) : (fixedShortName(framework) ?? standardKey);
  }
}
