import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StandardMapping } from '../../../core/standards/standards.models';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { mappingState } from './workspace-data';

/**
 * The workspace's "find evidence" status, from the standard's `last_mapping`:
 *
 * - never searched: a dismissible banner (shown once per standard) offering the
 *   one AI action, "Finn dokumentasjon med KI", and the AI-free "Foreslå fra
 *   eksisterende poster" (keyword suggestions from every module);
 * - running: a short "searching" line (the workspace shows live progress instead
 *   while it watches the job);
 * - done: "Sist gjennomsøkt med KI {date}". Suggestions waiting for review are
 *   counted once, in the workspace's "Neste anbefalte steg";
 * - failed: a note and "Prøv igjen".
 *
 * Purely presentational; the workspace starts the jobs and remembers the dismissal.
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
          class="relative flex flex-col gap-2 rounded-tile border border-accent-border bg-accent-soft/40 py-2.5 pr-10 pl-3 sm:flex-row sm:items-center sm:gap-3"
          data-testid="mapping-never"
        >
          <span class="min-w-0 flex-1 text-ui text-fg">
            <span class="font-semibold">{{ 'standards.reqs.mapping.never' | transloco }}</span>
            <span class="block text-meta text-fg-muted">{{
              (aiOff()
                ? 'standards.reqs.mapping.neverHintNoAi'
                : 'standards.reqs.mapping.neverHint'
              ) | transloco
            }}</span>
          </span>
          @if (canMap()) {
            <span class="flex flex-col gap-2 sm:flex-row sm:flex-none">
              @if (!aiOff()) {
                <app-button size="sm" [loading]="starting()" (click)="map.emit()">
                  <app-icon name="spark" [size]="14" />
                  {{ 'standards.view.mapWithAi' | transloco }}
                </app-button>
              }
              <app-button
                size="sm"
                variant="secondary"
                data-testid="mapping-suggest-records"
                [loading]="suggesting()"
                (click)="suggestFromRecords.emit()"
              >
                <app-icon name="link" [size]="14" />
                {{ 'standards.bulk.suggestAllShort' | transloco }}
              </app-button>
            </span>
          }
          <button
            type="button"
            class="absolute top-2 right-2 flex rounded-lg p-1.5 text-fg-subtle hover:bg-surface hover:text-fg"
            data-testid="mapping-dismiss"
            [attr.aria-label]="'standards.reqs.mapping.dismiss' | transloco"
            [title]="'standards.reqs.mapping.dismiss' | transloco"
            (click)="dismiss.emit()"
          >
            <app-icon name="x" [size]="14" />
          </button>
        </div>
      }
      @case ('running') {
        <p class="text-meta text-fg-muted" role="status" data-testid="mapping-running">
          {{ 'standards.reqs.mapping.running' | transloco }}
        </p>
      }
      @case ('done') {
        <p class="flex items-center gap-2 text-meta text-fg-muted" data-testid="mapping-done">
          <span class="flex text-accent"><app-icon name="spark" [size]="13" /></span>
          {{
            'standards.mapping.lastMappedOn'
              | transloco: { date: m?.finished_at | localDate: 'mediumDate' }
          }}
        </p>
      }
      @case ('failed') {
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-muted"
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
  /** The user may start a search (`standards:manage`). */
  readonly canMap = input(false);
  /** AI isn't configured (a 503 was seen): only the AI-free action is offered. */
  readonly aiOff = input(false);
  readonly starting = input(false);
  /** The AI-free suggestions are being computed. */
  readonly suggesting = input(false);

  readonly map = output<void>();
  readonly suggestFromRecords = output<void>();
  readonly dismiss = output<void>();

  protected readonly state = computed(() => mappingState(this.mapping()));
}
