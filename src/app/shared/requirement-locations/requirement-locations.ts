import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LocationsApi } from '../../core/locations/locations-api';
import {
  LocationResult,
  RequirementLocations as Data,
} from '../../core/locations/locations.models';
import { LocationsService } from '../../core/locations/locations.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LocalDatePipe } from '../locale/locale-pipes';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { LocationAdjustAction, LocationCard } from './location-card';
import { TEXT_LINK, locationLink } from './location-links';
import { LocationOverrideDialog, OverrideMode } from './location-override-dialog';
import { LocationStatusIcon } from './location-status-icon';

/**
 * "Her fyller du ut dette" (design 6.1): where a requirement is filled in.
 * Mounted at the top of the requirement card. One card per primary place (what
 * you do there, the live status line, a button to the exact page), the
 * supporting places under "Også relevant", and the mappings the organisation
 * switched off folded behind "N tilpasninger". With `canManage`, each card has a
 * "Tilpass" menu and the block offers "Legg til et sted". Renders nothing when
 * the requirement has no mapping (or the call fails): the page then looks as
 * before, with the record links below.
 */
@Component({
  selector: 'app-requirement-locations',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    Icon,
    LocalDatePipe,
    LocationCard,
    LocationOverrideDialog,
    LocationStatusIcon,
  ],
  viewProviders: [provideSharedScope('locations')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
  template: `
    @if (data(); as d) {
      @if (hasAny()) {
        <section
          class="rounded-tile border border-accent-border bg-accent-soft/25 px-3.5 py-3"
          data-testid="requirement-locations"
          [attr.aria-label]="'locations.block.title' | transloco"
        >
          @if (d.primary.length > 0) {
            <h3 class="flex items-center gap-1.5 text-ui font-bold text-fg">
              <span class="flex text-accent"><app-icon name="target" [size]="15" /></span>
              {{ 'locations.block.title' | transloco }}
            </h3>
            <!-- The cards show the location's own status; say so only when it does not decide. -->
            @if (d.status.text && !d.status.basis.startsWith('location')) {
              <p class="mt-0.5 text-meta text-fg-muted" data-testid="requirement-locations-basis">
                {{ d.status.text }}
              </p>
            }
            <div class="mt-2.5 flex flex-col gap-2.5">
              @for (loc of d.primary; track loc.key) {
                <app-location-card
                  [location]="loc"
                  [ref]="ref()"
                  [canManage]="canManage()"
                  [canEnableModules]="canEnableModules()"
                  (adjust)="openAdjust(loc, $event)"
                />
              }
            </div>
          }

          @if (d.supporting.length > 0) {
            <div [class.mt-3]="d.primary.length > 0" data-testid="requirement-locations-supporting">
              <h4 class="mb-1 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase">
                {{ 'locations.block.supporting' | transloco }}
              </h4>
              <ul class="flex flex-col gap-1">
                @for (loc of d.supporting; track loc.key) {
                  <li class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ui">
                    <app-location-status-icon
                      [outcome]="loc.module_enabled ? loc.outcome : 'not_evaluable'"
                    />
                    @if (link(loc); as l) {
                      <a [routerLink]="l.path" [queryParams]="l.queryParams" [class]="textLink">{{
                        loc.label
                      }}</a>
                    } @else {
                      <span class="font-semibold text-fg">{{ loc.label }}</span>
                    }
                    @if (!loc.module_enabled) {
                      <span class="text-meta text-fg-subtle">{{
                        'locations.card.moduleOff' | transloco
                      }}</span>
                    } @else if (loc.text) {
                      <span class="text-meta text-fg-muted">{{ loc.text }}</span>
                    }
                  </li>
                }
              </ul>
            </div>
          }

          @if (d.disabled.length > 0) {
            <details class="mt-3 text-meta" data-testid="requirement-locations-disabled">
              <summary class="cursor-pointer font-semibold text-fg-muted">
                {{
                  (d.disabled.length === 1
                    ? 'locations.block.adjustedOne'
                    : 'locations.block.adjusted'
                  ) | transloco: { count: d.disabled.length }
                }}
              </summary>
              <ul class="mt-1.5 flex flex-col gap-2">
                @for (loc of d.disabled; track loc.key) {
                  <li class="rounded-tile bg-surface px-3 py-2">
                    <p class="font-semibold text-fg-muted line-through">{{ loc.label }}</p>
                    @if (loc.override; as ov) {
                      <p class="mt-0.5 text-fg-muted">
                        <span class="font-semibold"
                          >{{ 'locations.override.justification' | transloco }}:</span
                        >
                        {{ ov.justification }}
                      </p>
                      <p class="mt-0.5 text-micro text-fg-subtle">
                        @if (ov.by_name && ov.at) {
                          {{
                            'locations.block.adjustedBy'
                              | transloco
                                : { name: ov.by_name, date: (ov.at | localDate: 'mediumDate') }
                          }}
                        }
                        @if (ov.orphaned) {
                          · {{ 'locations.block.orphaned' | transloco }}
                        }
                      </p>
                      @if (canManage()) {
                        <app-button
                          class="mt-1.5 inline-block"
                          size="sm"
                          variant="ghost"
                          [loading]="restoring() === ov.id"
                          (click)="restore(ov.id)"
                          data-testid="location-restore"
                        >
                          {{ 'locations.block.restore' | transloco }}
                        </app-button>
                      }
                    }
                  </li>
                }
              </ul>
            </details>
          }

          @if (canManage()) {
            <div class="mt-2.5">
              <app-button size="sm" variant="ghost" (click)="openAdd()" data-testid="location-add">
                <app-icon name="plus" [size]="13" />
                {{ 'locations.adjust.add' | transloco }}
              </app-button>
            </div>
          }
          @if (restoreError()) {
            <p class="mt-1 text-meta text-fail" role="alert">
              {{ 'locations.override.saveError' | transloco }}
            </p>
          }
        </section>
      } @else if (canManage()) {
        <!-- No mapping: managers may still add the place where they fill this in. -->
        <app-button size="sm" variant="ghost" (click)="openAdd()" data-testid="location-add">
          <app-icon name="plus" [size]="13" />
          {{ 'locations.adjust.addFirst' | transloco }}
        </app-button>
      }
    }

    @if (canManage() && dialog(); as dlg) {
      <app-location-override-dialog
        [open]="true"
        [mode]="dlg.mode"
        [current]="dlg.location"
        [ref]="ref()"
        (closed)="dialog.set(null)"
        (saved)="dialog.set(null)"
      />
    }
  `,
})
export class RequirementLocations {
  private readonly api = inject(LocationsApi);
  private readonly locations = inject(LocationsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  /** The requirement ref (`iso9001-2026:4.2.r1`). */
  readonly ref = input.required<string>();
  /** `standards:manage`: adjust the places for this organisation. */
  readonly canManage = input(false);

  protected readonly textLink = TEXT_LINK;
  protected readonly data = signal<Data | null>(null);
  protected readonly dialog = signal<{
    readonly mode: OverrideMode;
    readonly location: LocationResult | null;
  } | null>(null);
  protected readonly restoring = signal<string | null>(null);
  protected readonly restoreError = signal(false);

  protected readonly hasAny = computed(() => {
    const d = this.data();
    return !!d && d.primary.length + d.supporting.length + d.disabled.length > 0;
  });

  protected readonly canEnableModules = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('org:manage'),
  );

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const ref = this.ref();
      const lang = this.language.active();
      this.locations.version();
      untracked(() => this.load(orgId, ref, lang));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected link(loc: LocationResult) {
    return locationLink(loc.url, this.ref());
  }

  protected openAdjust(location: LocationResult, action: LocationAdjustAction): void {
    this.dialog.set({ mode: action, location });
  }

  protected openAdd(): void {
    this.dialog.set({ mode: 'add', location: null });
  }

  protected restore(overrideId: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.restoring.set(overrideId);
    this.restoreError.set(false);
    this.api.deleteOverride(orgId, overrideId).subscribe({
      next: () => {
        this.restoring.set(null);
        this.locations.invalidate();
      },
      error: () => {
        this.restoring.set(null);
        this.restoreError.set(true);
      },
    });
  }

  private load(orgId: string | null, ref: string, lang: string): void {
    this.sub?.unsubscribe();
    if (!orgId || !ref) {
      this.data.set(null);
      return;
    }
    this.sub = this.api.forRequirement(orgId, ref, lang).subscribe({
      next: (data) => this.data.set(data),
      // Extra context only: on any failure the requirement page looks as before.
      error: () => this.data.set(null),
    });
  }
}
