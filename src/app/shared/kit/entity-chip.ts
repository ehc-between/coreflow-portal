import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { Tone, toneFor } from '../ui/tones';
import { provideKitScope } from './kit-scope';

/** Status dot colour per tone (the badge palette's solid colours). */
const DOT: Readonly<Record<Tone, string>> = {
  pass: 'bg-pass',
  warn: 'bg-warn',
  fail: 'bg-fail',
  info: 'bg-info',
  accent: 'bg-accent',
  neutral: 'bg-fg-subtle',
};

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
 * Compact reference to any record: type, code, title and a status dot (P4). Links to the
 * record's page when it has one (in-app navigation, keeping middle-click /
 * open-in-new-tab working); plain text otherwise.
 */
@Component({
  selector: 'app-entity-chip',
  imports: [NgTemplateOutlet, TranslocoPipe],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = ref();
    @if (r.url) {
      <a
        [href]="r.url"
        class="group max-w-full min-w-0 rounded text-ui text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        [class]="stacked() ? 'flex flex-col gap-0.5' : 'inline-flex items-baseline gap-2'"
        [attr.aria-label]="'kit.chip.open' | transloco: { type: typeLabel(), title: r.title }"
        (click)="open($event, r.url)"
      >
        <ng-container [ngTemplateOutlet]="stacked() ? stackedBody : body" />
      </a>
    } @else {
      <span
        class="max-w-full min-w-0 text-ui text-fg"
        [class]="stacked() ? 'flex flex-col gap-0.5' : 'inline-flex items-baseline gap-2'"
        [title]="'kit.chip.noAccessUrl' | transloco"
      >
        <ng-container [ngTemplateOutlet]="stacked() ? stackedBody : body" />
      </span>
    }
    <ng-template #body>
      @if (showType()) {
        <span
          class="flex-none text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase"
          data-testid="entity-chip-type"
          >{{ typeLabel() }}</span
        >
      }
      @if (r.code) {
        <span class="flex-none font-mono text-meta text-fg-muted">{{ r.code }}</span>
      }
      <span class="min-w-0 truncate font-medium group-hover:text-accent group-hover:underline">{{
        r.title
      }}</span>
      @if (r.status) {
        @if (statusText()) {
          <span
            class="inline-flex flex-none items-center gap-1 self-center text-micro font-semibold text-fg-muted"
            data-testid="entity-chip-status"
            ><span aria-hidden="true" class="h-2 w-2 rounded-full" [class]="dotClass()"></span
            >{{ statusLabel() }}</span
          >
        } @else {
          <span
            class="h-2 w-2 flex-none self-center rounded-full"
            [class]="dotClass()"
            role="img"
            [attr.aria-label]="statusLabel()"
            [title]="statusLabel()"
            data-testid="entity-chip-status"
          ></span>
        }
      }
    </ng-template>
    <ng-template #stackedBody>
      <span class="flex min-w-0 items-center gap-1.5 text-micro text-fg-subtle">
        @if (showType()) {
          <span
            class="truncate font-semibold tracking-[0.04em] uppercase"
            data-testid="entity-chip-type"
            >{{ typeLabel() }}</span
          >
        }
        @if (r.code) {
          <span class="flex-none font-mono">{{ r.code }}</span>
        }
        @if (r.status) {
          @if (statusText()) {
            <span
              class="inline-flex flex-none items-center gap-1 font-semibold text-fg-muted normal-case"
              data-testid="entity-chip-status"
              ><span aria-hidden="true" class="h-2 w-2 rounded-full" [class]="dotClass()"></span
              >{{ statusLabel() }}</span
            >
          } @else {
            <span
              class="h-2 w-2 flex-none rounded-full"
              [class]="dotClass()"
              role="img"
              [attr.aria-label]="statusLabel()"
              [title]="statusLabel()"
              data-testid="entity-chip-status"
            ></span>
          }
        }
      </span>
      <span
        class="line-clamp-2 font-medium [overflow-wrap:anywhere] group-hover:text-accent group-hover:underline"
        >{{ r.title }}</span
      >
    </ng-template>
  `,
  host: { class: 'min-w-0 max-w-full' },
})
export class EntityChip {
  private readonly router = inject(Router);
  private readonly types = inject(EntityTypesService);

  readonly ref = input.required<EntityChipRef>();
  /** Show the status as words next to the dot (default: the dot only, with a tooltip). */
  readonly statusText = input(false);
  /** Show the record type in front (off where a heading already names it). */
  readonly showType = input(true);
  /** Two lines (type · code · status, then the title): for narrow columns. */
  readonly stacked = input(false);

  protected readonly typeLabel = computed(() =>
    this.types.label(this.ref().entity_type, this.ref().label_key),
  );
  protected readonly statusLabel = computed(() =>
    this.types.statusLabel(this.ref().status ?? '', this.ref().module),
  );

  protected readonly dotClass = computed(() => DOT[toneFor('lifecycle', this.ref().status)]);

  protected open(event: MouseEvent, url: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    void this.router.navigateByUrl(url);
  }
}
