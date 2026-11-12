import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { RelativeTimePipe } from '../../../shared/relative-time/relative-time';
import { Badge } from '../../../shared/ui/badge/badge';

/** One published version, in the shape both version lists share. */
export interface VersionEntry {
  readonly version: number;
  readonly published_at: string;
  readonly published_by_name: string | null;
  readonly change_note: string | null;
  /** Already-translated summary ("8 fields", "6 states, 9 transitions"). */
  readonly summary: string;
}

/**
 * The revision history of a record type or workflow: every published version
 * (immutable) with who published it, when and why. Records keep the version
 * they started on, so older versions stay viewable.
 */
@Component({
  selector: 'app-version-history',
  imports: [TranslocoPipe, Badge, LocalDatePipe, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-label]="'records.versions.title' | transloco">
      <h2 class="mb-2 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
        {{ 'records.versions.title' | transloco }}
      </h2>
      @if (versions().length === 0) {
        <p class="text-[12.5px] text-fg-muted">{{ 'records.versions.none' | transloco }}</p>
      } @else {
        <ol class="relative flex flex-col gap-3 border-l border-border pl-4">
          @for (v of versions(); track v.version) {
            <li class="relative">
              <span
                class="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface"
                [class]="v.version === current() ? 'bg-accent' : 'bg-border-strong'"
                aria-hidden="true"
              ></span>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="text-[13px] font-semibold text-accent hover:underline"
                  [attr.aria-pressed]="v.version === viewing()"
                  (click)="view.emit(v.version)"
                >
                  {{ 'records.versions.version' | transloco: { version: v.version } }}
                </button>
                @if (v.version === current()) {
                  <app-badge tone="pass">{{ 'records.versions.current' | transloco }}</app-badge>
                }
                @if (v.version === viewing() && v.version !== current()) {
                  <app-badge tone="info">{{ 'records.versions.viewing' | transloco }}</app-badge>
                }
              </div>
              <p
                class="text-[11.5px] text-fg-subtle"
                [attr.title]="v.published_at | localDate: 'medium'"
              >
                {{
                  'records.versions.publishedBy'
                    | transloco
                      : {
                          name: v.published_by_name ?? ('records.versions.someone' | transloco),
                          when: v.published_at | relativeTime: lang(),
                        }
                }}
                · {{ v.summary }}
              </p>
              @if (v.change_note) {
                <p class="mt-0.5 text-[12.5px] text-fg-muted">{{ v.change_note }}</p>
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class VersionHistory {
  protected readonly lang = inject(LanguageService).active;

  readonly versions = input<readonly VersionEntry[]>([]);
  readonly current = input<number | null>(null);
  readonly viewing = input<number | null>(null);

  readonly view = output<number>();
}
