import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LocatedRequirementFields } from '../../core/locations/locations.models';
import { LocationStatusIcon } from './location-status-icon';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';

/** The short location text of a requirement in the active language (falls back to English). */
export function locationText(
  req: Pick<LocatedRequirementFields, 'location_text'>,
  lang: string,
): string {
  const texts = req.location_text ?? {};
  return (texts[lang as 'en' | 'nb'] ?? texts.en ?? '').trim();
}

/**
 * Location glyph and short text next to a requirement's status in the catalogue
 * tree (design 6.2): "◐ 2 ikke håndtert". Reads the optional location fields the
 * tree payload carries for mapped requirements; renders nothing for
 * requirements without a mapping. The tooltip says where the status comes from.
 */
@Component({
  selector: 'app-location-hint',
  imports: [TranslocoPipe, LocationStatusIcon],
  viewProviders: [provideSharedScope('locations')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex min-w-0 empty:hidden',
    '[style.display]': "reqVis.show() ? null : 'none'",
  },
  template: `
    @if (text(); as t) {
      <span
        class="inline-flex min-w-0 items-center gap-1 text-[12px] text-fg-muted"
        [title]="basisKey() | transloco: { text: t }"
        data-testid="location-hint"
        [attr.data-outcome]="outcome()"
      >
        <app-location-status-icon [outcome]="outcome()" [size]="12" />
        <span class="max-w-[12rem] truncate">{{ t }}</span>
      </span>
    }
  `,
})
export class LocationHint {
  /** "Vis krav" (IA v2 §4.3): hidden unless the switch is on or on an expert page. */
  protected readonly reqVis = inject(RequirementsVisibilityService);
  private readonly language = inject(LanguageService);

  readonly requirement = input.required<LocatedRequirementFields>();

  protected readonly text = computed(() =>
    locationText(this.requirement(), this.language.active()),
  );
  protected readonly outcome = computed(
    () => this.requirement().location_outcome ?? 'not_evaluable',
  );
  protected readonly basisKey = computed(() =>
    this.requirement().basis === 'manual' ? 'locations.hint.manual' : 'locations.hint.location',
  );
}
