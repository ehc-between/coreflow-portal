import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StandardMapping } from '../../../core/standards/standards.models';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { mappingState } from './workspace-data';

/**
 * The workspace header's AI mapping status, from the standard's `last_mapping`:
 *
 * - never mapped: a banner saying the existing documents aren't mapped yet,
 *   with a one-click "Map existing documents" (when the user may map and AI
 *   is set up);
 * - running: a short "mapping in progress" line (the workspace shows live
 *   progress instead while it watches the job);
 * - done: "Last mapped {date} · {n} suggestions" and a link that filters the
 *   document to the requirements with suggestions;
 * - failed: a note and "Try again".
 *
 * Purely presentational; the workspace starts the job and owns the filter.
 */
@Component({
  selector: 'app-mapping-status',
  imports: [TranslocoPipe, LocalDatePipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = mapping();
    @switch (state()) {
      @case ('never') {
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-tile border border-accent-border bg-accent-soft/40 px-3 py-2"
          data-testid="mapping-never"
        >
          <span class="flex text-accent"><app-icon name="spark" [size]="15" /></span>
          <span class="min-w-0 flex-1 text-[13px] text-fg">
            <span class="font-semibold">{{ 'standards.mapping.never' | transloco }}</span>
            @if (aiOff()) {
              <span class="block text-[12px] text-fg-muted">{{
                'standards.ai.notConfigured' | transloco
              }}</span>
            } @else {
              <span class="block text-[12px] text-fg-muted">{{
                'standards.mapping.neverHint' | transloco
              }}</span>
            }
          </span>
          @if (canMap() && !aiOff()) {
            <app-button size="sm" [loading]="starting()" (click)="map.emit()">
              <app-icon name="spark" [size]="14" />
              {{ 'standards.mapping.mapExisting' | transloco }}
            </app-button>
          }
        </div>
      }
      @case ('running') {
        <p class="text-[12.5px] text-fg-muted" role="status" data-testid="mapping-running">
          {{ 'standards.mapping.running' | transloco }}
        </p>
      }
      @case ('done') {
        <div
          class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-muted"
          data-testid="mapping-done"
        >
          <span class="flex text-accent"><app-icon name="spark" [size]="13" /></span>
          <span>{{
            'standards.mapping.lastMapped'
              | transloco
                : {
                    date: m?.finished_at | localDate: 'mediumDate',
                    count: m?.suggestions_created ?? 0,
                  }
          }}</span>
          @if (pendingCount() > 0) {
            <button
              type="button"
              class="font-semibold text-accent hover:underline"
              [attr.aria-pressed]="suggestionsOnly()"
              data-testid="mapping-show-suggestions"
              (click)="showSuggestions.emit()"
            >
              {{ 'standards.mapping.showSuggestions' | transloco: { count: pendingCount() } }}
            </button>
          }
        </div>
      }
      @case ('failed') {
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-muted"
          data-testid="mapping-failed"
        >
          <span>{{ 'standards.mapping.failed' | transloco }}</span>
          @if (canMap() && !aiOff()) {
            <button
              type="button"
              class="font-semibold text-accent hover:underline disabled:opacity-60"
              [disabled]="starting()"
              (click)="map.emit()"
            >
              {{ 'standards.mapping.retry' | transloco }}
            </button>
          }
        </div>
      }
    }
  `,
})
export class MappingStatus {
  readonly mapping = input<StandardMapping | null | undefined>(null);
  /** The user may start a mapping (`standards:manage`). */
  readonly canMap = input(false);
  /** AI isn't configured (a 503 was seen): no AI actions, a neutral hint. */
  readonly aiOff = input(false);
  readonly starting = input(false);
  /** Requirements that currently have suggestions waiting for review. */
  readonly pendingCount = input(0);
  readonly suggestionsOnly = input(false);

  readonly map = output<void>();
  readonly showSuggestions = output<void>();

  protected readonly state = computed(() => mappingState(this.mapping()));
}
