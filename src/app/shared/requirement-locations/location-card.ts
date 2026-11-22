import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LocationResult } from '../../core/locations/locations.models';
import { LocalDatePipe } from '../locale/locale-pipes';
import { Icon } from '../ui/icon/icon';
import { MenuItem, OverflowMenu } from '../ui/overflow-menu/overflow-menu';
import { PRIMARY_LINK, SECONDARY_LINK, TEXT_LINK, locationLink, placeName } from './location-links';
import { LocationStatusIcon } from './location-status-icon';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';

/** What the "Tilpass" menu of a card asks for. */
export type LocationAdjustAction = 'repoint' | 'rules' | 'disable';

/** Samples shown under a shortfall. */
export const LOCATION_SAMPLES_MAX = 5;

/**
 * One primary place of a requirement ("Her fyller du ut dette", design 6.1):
 * the place, what you do there, the live status line with its freshness, up to
 * five records that explain a shortfall, a button that opens the exact page
 * (tagged with `?fromRequirement=`), "Legg til ny" when the caller may create,
 * and — for `standards:manage` — the "Tilpass" menu. When the place's module is
 * off, the card says so and offers the module settings to those who may change them.
 */
@Component({
  selector: 'app-location-card',
  imports: [
    RouterLink,
    TranslocoPipe,
    Icon,
    LocalDatePipe,
    LocationStatusIcon,
    MenuItem,
    OverflowMenu,
  ],
  viewProviders: [provideSharedScope('locations')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '[style.display]': "reqVis.show() ? null : 'none'" },
  template: `
    @let loc = location();
    <article
      class="rounded-tile border border-border bg-surface px-4 py-3.5"
      data-testid="location-card"
      [attr.data-location]="loc.key"
      [attr.data-outcome]="loc.outcome"
    >
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <h4 class="text-card font-bold text-fg">{{ loc.label }}</h4>
          @if (loc.description) {
            <p class="mt-0.5 text-ui text-fg-muted">{{ loc.description }}</p>
          }
          @if (loc.note) {
            <p class="mt-1 text-meta text-fg-muted" data-testid="location-note">{{ loc.note }}</p>
          }
        </div>
        @if (canManage()) {
          <app-overflow-menu labelKey="locations.adjust.menu" data-testid="location-adjust">
            <button appMenuItem (click)="adjust.emit('repoint')">
              {{ 'locations.adjust.repoint' | transloco }}
            </button>
            <button appMenuItem (click)="adjust.emit('rules')">
              {{ 'locations.adjust.rules' | transloco }}
            </button>
            <button appMenuItem (click)="adjust.emit('disable')">
              {{ 'locations.adjust.disable' | transloco }}
            </button>
          </app-overflow-menu>
        }
      </div>

      @if (!loc.module_enabled) {
        <div
          class="mt-2.5 rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg-muted"
          data-testid="location-module-off"
        >
          <p class="flex items-center gap-2">
            <app-location-status-icon outcome="not_evaluable" />
            {{ 'locations.card.moduleOff' | transloco }}
          </p>
          <p class="mt-1 text-meta">
            @if (canEnableModules()) {
              <a routerLink="/settings/modules" [class]="textLink">{{
                'locations.card.enableModule' | transloco
              }}</a>
            } @else {
              {{ 'locations.card.askAdmin' | transloco }}
            }
          </p>
        </div>
      } @else {
        <p class="mt-2.5 flex items-start gap-2 text-ui text-fg" data-testid="location-status">
          <span class="mt-0.5 flex"><app-location-status-icon [outcome]="loc.outcome" /></span>
          <span class="min-w-0">
            <span class="font-semibold">{{
              loc.text || ('locations.outcome.' + loc.outcome | transloco)
            }}</span>
            @if (loc.as_of) {
              <span class="text-fg-subtle">
                ·
                {{
                  loc.fresh
                    ? ('locations.card.lastChanged'
                      | transloco: { date: (loc.as_of | localDate: 'mediumDate') })
                    : ('locations.card.notUpdated' | transloco)
                }}
              </span>
            }
          </span>
        </p>
        @if (samples().length > 0) {
          <p
            class="mt-1.5 flex flex-wrap gap-x-1 pl-6 text-meta text-fg-muted"
            data-testid="location-samples"
          >
            <span class="font-semibold text-fg-subtle">{{
              'locations.card.samples' | transloco
            }}</span>
            @for (s of samples(); track s.entity_id; let last = $last) {
              <span>
                @if (s.link; as link) {
                  <a [routerLink]="link.path" [queryParams]="link.queryParams" [class]="textLink">{{
                    s.name
                  }}</a>
                } @else {
                  {{ s.name }}
                }
                @if (!last) {
                  <span aria-hidden="true">,</span>
                }
              </span>
            }
          </p>
        }
        @if (loc.stale) {
          <p class="mt-1 pl-6 text-micro text-fg-subtle">
            {{ 'locations.card.updating' | transloco }}
          </p>
        }
        @if (loc.origin === 'override' && loc.override; as ov) {
          <p class="mt-1.5 pl-6 text-micro text-fg-subtle" data-testid="location-override">
            {{ 'locations.card.adjusted' | transloco: { reason: ov.justification } }}
          </p>
        }
      }

      <div class="mt-3 flex flex-wrap items-center gap-2">
        @if (goTo(); as link) {
          <a
            [routerLink]="link.path"
            [queryParams]="link.queryParams"
            [class]="primaryLink"
            data-testid="location-go"
          >
            {{ 'locations.card.goTo' | transloco: { label: name() } }}
            <app-icon name="arrow" [size]="14" />
          </a>
        }
        @if (loc.module_enabled && create(); as link) {
          <a
            [routerLink]="link.path"
            [queryParams]="link.queryParams"
            [class]="secondaryLink"
            data-testid="location-create"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'locations.card.create' | transloco }}
          </a>
        }
      </div>
    </article>
  `,
})
export class LocationCard {
  /** "Vis krav" (IA v2 §4.3): hidden unless the switch is on or on an expert page. */
  protected readonly reqVis = inject(RequirementsVisibilityService);
  readonly location = input.required<LocationResult>();
  /** The requirement the card belongs to (carried on the links as `?fromRequirement=`). */
  readonly ref = input.required<string>();
  /** `standards:manage`: shows the "Tilpass" menu. */
  readonly canManage = input(false);
  /** `org:manage`: a module that is off links to the module settings. */
  readonly canEnableModules = input(false);

  readonly adjust = output<LocationAdjustAction>();

  protected readonly primaryLink = PRIMARY_LINK;
  protected readonly secondaryLink = SECONDARY_LINK;
  protected readonly textLink = TEXT_LINK;

  protected readonly name = computed(() => placeName(this.location().label));
  protected readonly goTo = computed(() => locationLink(this.location().url, this.ref()));
  protected readonly create = computed(() => locationLink(this.location().create_url));
  protected readonly samples = computed(() =>
    this.location()
      .samples.slice(0, LOCATION_SAMPLES_MAX)
      .map((s) => ({
        entity_id: s.entity_id,
        name: s.code ? `${s.code} ${s.title}` : s.title,
        link: locationLink(s.url),
      })),
  );
}
