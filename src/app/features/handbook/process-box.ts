import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { pluralKey } from '../../shared/i18n/plural';
import { DOT_CLASS, firstName } from './data/handbook.logic';
import { HandbookBox } from './data/handbook.models';

/** Right-pointing arrow between boxes of the value chain (rotates when the chain stacks). */
@Component({
  selector: 'app-handbook-arrow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'grid flex-none place-items-center text-accent w-[34px] max-[820px]:h-7 max-[820px]:w-auto',
    'aria-hidden': 'true',
  },
  template: `
    <svg
      viewBox="0 0 24 24"
      class="size-6 max-[820px]:rotate-90"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  `,
})
export class HandbookArrow {}

/**
 * One process on the process map (prototype `procBox`): its name, a status dot and
 * "{n} prosedyrer · {owner}". In ordering mode it shows arrow buttons instead of
 * navigating.
 */
@Component({
  selector: 'app-handbook-process-box',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0' },
  template: `
    @let b = box();
    <a
      [routerLink]="['/handbook', b.id]"
      class="flex w-full min-w-0 flex-col gap-1.5 rounded-[12px] border border-border bg-surface-2 p-3 text-fg no-underline transition hover:-translate-y-px hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      [attr.data-testid]="'handbook-box-' + b.id"
    >
      <b class="leading-snug font-semibold [overflow-wrap:anywhere]">{{ b.title }}</b>
      <span class="flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-muted">
        <span
          class="inline-block size-2 flex-none rounded-full"
          [class]="dotClass()"
          role="img"
          [attr.aria-label]="'handbook.map.dots.' + b.dot | transloco"
        ></span>
        {{
          pluralKey('handbook.map.procedures', b.procedure_count)
            | transloco: { count: b.procedure_count }
        }}
        @if (owner()) {
          · {{ owner() }}
        }
        @if (b.status === 'draft') {
          <span class="rounded-full border border-border px-1.5 text-[11px]">{{
            'handbook.map.draft' | transloco
          }}</span>
        }
      </span>
    </a>
    @if (ordering()) {
      <span class="ml-1 flex flex-none flex-col justify-center gap-1">
        <button
          type="button"
          class="grid size-7 place-items-center rounded-tile border border-border bg-surface text-fg-muted hover:text-fg disabled:opacity-40"
          [disabled]="first()"
          [attr.aria-label]="'handbook.actions.moveUp' | transloco: { title: b.title }"
          (click)="move.emit(-1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="grid size-7 place-items-center rounded-tile border border-border bg-surface text-fg-muted hover:text-fg disabled:opacity-40"
          [disabled]="last()"
          [attr.aria-label]="'handbook.actions.moveDown' | transloco: { title: b.title }"
          (click)="move.emit(1)"
        >
          ↓
        </button>
      </span>
    }
  `,
})
export class HandbookProcessBox {
  readonly box = input.required<HandbookBox>();
  readonly ordering = input(false);
  readonly first = input(false);
  readonly last = input(false);
  readonly move = output<-1 | 1>();

  protected readonly pluralKey = pluralKey;
  protected readonly owner = computed(() => firstName(this.box().owner?.name));
  protected readonly dotClass = computed(() => DOT_CLASS[this.box().dot]);
}
