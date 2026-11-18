import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { GapFillInFields } from '../../core/locations/locations.models';
import { TEXT_LINK, locationLink } from './location-links';
import { LocationStatusIcon } from './location-status-icon';

/**
 * "Fyll ut i" on a gap (design 6.2): the gap's primary place(s), linked to the
 * exact page (tagged with `?fromRequirement=`), each with its outcome and short
 * text. Placed before the "Kan dokumenteres med" create links. Renders nothing
 * when the gap has no mapped place.
 */
@Component({
  selector: 'app-location-fill-in',
  imports: [RouterLink, TranslocoPipe, LocationStatusIcon],
  viewProviders: [provideSharedScope('locations')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
  template: `
    @if (places().length > 0) {
      <div
        class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta"
        data-testid="gap-fill-in"
      >
        <span class="font-semibold text-fg-subtle">{{ 'locations.gaps.fillIn' | transloco }}</span>
        @for (p of places(); track p.key; let last = $last) {
          <span class="inline-flex min-w-0 items-center gap-1">
            <app-location-status-icon
              [outcome]="p.module_enabled ? p.outcome : 'not_evaluable'"
              [size]="13"
            />
            @if (p.link; as link) {
              <a [routerLink]="link.path" [queryParams]="link.queryParams" [class]="textLink">{{
                p.label
              }}</a>
            } @else {
              <span class="font-semibold text-fg">{{ p.label }}</span>
            }
            @if (!p.module_enabled) {
              <span class="text-fg-subtle">· {{ 'locations.card.moduleOff' | transloco }}</span>
            } @else if (p.text) {
              <span class="text-fg-muted">· {{ p.text }}</span>
            }
          </span>
        }
      </div>
    }
  `,
})
export class LocationFillIn {
  /** A gap of `GET frameworks/gaps` (its optional `fill_in`). */
  readonly gap = input.required<GapFillInFields>();

  protected readonly textLink = TEXT_LINK;
  protected readonly places = computed(() =>
    (this.gap().fill_in ?? []).map((p) => ({ ...p, link: locationLink(p.url, this.gap().ref) })),
  );
}
