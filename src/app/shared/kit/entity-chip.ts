import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { provideKitScope } from './kit-scope';

/** The fields a chip needs; an `EntityRefDto` or a search hit both fit. */
export interface EntityChipRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code?: string | null;
  readonly url?: string | null;
  readonly status?: string | null;
  readonly label_key?: string | null;
  readonly module?: string | null;
}

/**
 * Compact reference to any record: type, code, title and status. Links to the
 * record's page when it has one (in-app navigation, keeping middle-click /
 * open-in-new-tab working); plain text otherwise.
 */
@Component({
  selector: 'app-entity-chip',
  imports: [NgTemplateOutlet, TranslocoPipe],
  providers: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = ref();
    @if (r.url) {
      <a
        [href]="r.url"
        class="group inline-flex max-w-full min-w-0 items-baseline gap-2 rounded-[6px] text-[13px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        [attr.aria-label]="'kit.chip.open' | transloco: { type: typeLabel(), title: r.title }"
        (click)="open($event, r.url)"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <span
        class="inline-flex max-w-full min-w-0 items-baseline gap-2 text-[13px] text-fg"
        [title]="'kit.chip.noAccessUrl' | transloco"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </span>
    }
    <ng-template #body>
      <span
        class="flex-none text-[11px] font-semibold tracking-[0.04em] text-fg-subtle uppercase"
        data-testid="entity-chip-type"
        >{{ typeLabel() }}</span
      >
      @if (r.code) {
        <span class="flex-none font-mono text-[12px] text-fg-muted">{{ r.code }}</span>
      }
      <span class="min-w-0 truncate font-medium group-hover:text-accent group-hover:underline">{{
        r.title
      }}</span>
      @if (r.status) {
        <span
          class="flex-none rounded-full border border-border bg-surface-2 px-2 text-[11px] font-semibold text-fg-muted"
          >{{ statusLabel() }}</span
        >
      }
    </ng-template>
  `,
  host: { class: 'min-w-0 max-w-full' },
})
export class EntityChip {
  private readonly router = inject(Router);
  private readonly types = inject(EntityTypesService);

  readonly ref = input.required<EntityChipRef>();

  protected readonly typeLabel = computed(() =>
    this.types.label(this.ref().entity_type, this.ref().label_key),
  );
  protected readonly statusLabel = computed(() =>
    this.types.statusLabel(this.ref().status ?? '', this.ref().module),
  );

  protected open(event: MouseEvent, url: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    void this.router.navigateByUrl(url);
  }
}
