import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { shortRef } from '../../core/standards/standards-data';
import { RequirementLink } from '../../core/standards/standards.models';
import { Icon } from '../ui/icon/icon';

/** Chips shown before the "+N" overflow chip. */
export const REQUIREMENT_CHIPS_MAX = 6;

/**
 * A compact row of the requirements a record supports: one chip per
 * requirement ref (confirmed first; AI suggestions marked with a spark and a
 * dashed border), each deep-linking to the requirement in its standard's
 * workspace (`/standards/{key}/{clause}?req={ref}`). Past `max` chips a "+N"
 * chip emits `more` (the host reveals the full panel). Renders nothing when
 * there are no links.
 */
@Component({
  selector: 'app-requirement-chips',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sorted().length > 0) {
      <div class="flex flex-wrap items-center gap-1.5" data-testid="requirement-chips">
        <span class="mr-0.5 text-[12px] font-semibold text-fg-subtle">{{
          'standards.supports.title' | transloco
        }}</span>
        @for (link of shown(); track link.id) {
          <a
            [routerLink]="['/standards', link.standard_key, link.clause_number]"
            [queryParams]="{ req: link.requirement_ref }"
            class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11.5px] hover:border-accent hover:text-accent"
            [class]="
              link.status === 'suggested'
                ? 'border-dashed border-accent-border bg-accent-soft/40 text-accent'
                : 'border-border bg-surface-2 text-fg'
            "
            [title]="
              link.status === 'suggested'
                ? link.requirement_ref + ' — ' + ('standards.supports.suggested' | transloco)
                : link.requirement_ref
            "
            data-testid="requirement-chip"
          >
            @if (link.status === 'suggested') {
              <app-icon name="spark" [size]="11" />
            }
            {{ label(link) }}
          </a>
        }
        @if (hidden() > 0) {
          <button
            type="button"
            class="rounded-full border border-border px-2 py-0.5 text-[11.5px] font-semibold text-fg-muted hover:border-accent hover:text-accent"
            [attr.aria-label]="'standards.supports.moreLabel' | transloco: { count: hidden() }"
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
  /** The record's links (rejected ones are ignored). */
  readonly links = input<readonly RequirementLink[]>([]);
  readonly max = input(REQUIREMENT_CHIPS_MAX);

  /** The "+N" chip was clicked. */
  readonly more = output<void>();

  /** Confirmed before suggested, then by ref. */
  protected readonly sorted = computed(() =>
    this.links()
      .filter((l) => l.status !== 'rejected')
      .slice()
      .sort(
        (a, b) =>
          Number(a.status === 'suggested') - Number(b.status === 'suggested') ||
          a.requirement_ref.localeCompare(b.requirement_ref, 'en', { numeric: true }),
      ),
  );
  protected readonly shown = computed(() => this.sorted().slice(0, this.max()));
  protected readonly hidden = computed(() => Math.max(0, this.sorted().length - this.max()));

  protected label(link: RequirementLink): string {
    return shortRef(link.requirement_ref);
  }
}
