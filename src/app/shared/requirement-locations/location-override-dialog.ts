import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription, concatMap, of } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LocationsApi } from '../../core/locations/locations-api';
import {
  LocationResult,
  LocationRole,
  LocationRule,
  LocationVocabulary,
} from '../../core/locations/locations.models';
import { LocationsService } from '../../core/locations/locations.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Button } from '../ui/button/button';
import { SlideOver } from '../ui/slide-over/slide-over';
import { LocationStatusIcon } from './location-status-icon';

/** What the dialog does: re-point, add a place, change the rule, or switch a mapping off. */
export type OverrideMode = 'repoint' | 'add' | 'rules' | 'disable';

/** Max length of a justification (backend limit). */
export const JUSTIFICATION_MAX = 2000;

/** Rule kinds the dialog offers as plain sentences, in this order. */
export const PRESET_KINDS = [
  'has_entries',
  'all_in_state',
  'reviewed_within',
  'none_overdue',
] as const;
export type PresetKind = (typeof PRESET_KINDS)[number];

/** The editable values of the rule presets. */
export interface PresetState {
  readonly on: Readonly<Record<PresetKind, boolean>>;
  readonly min: number;
  readonly state: string;
  readonly days: number;
}

export const DEFAULT_PRESETS: PresetState = {
  on: { has_entries: true, all_in_state: false, reviewed_within: false, none_overdue: false },
  min: 1,
  state: '',
  days: 365,
};

/**
 * The rule JSON of the ticked presets (1:1 with the sentences, no free JSON).
 * `has_entries` counts active entries when the place declares an `active` state.
 */
export function presetRules(
  presets: PresetState,
  place: Pick<LocationVocabulary, 'rule_kinds' | 'states'> | null,
): LocationRule[] {
  const kinds = new Set(place?.rule_kinds ?? []);
  const hasActive = (place?.states ?? []).some((s) => s.key === 'active');
  const rules: LocationRule[] = [];
  for (const kind of PRESET_KINDS) {
    if (!presets.on[kind] || !kinds.has(kind)) {
      continue;
    }
    if (kind === 'has_entries') {
      const min = Math.max(1, Math.round(presets.min) || 1);
      rules.push(hasActive ? { kind, min, where: { state: 'active' } } : { kind, min });
    } else if (kind === 'all_in_state') {
      if (presets.state) {
        rules.push(
          hasActive && presets.state !== 'active'
            ? { kind, state: presets.state, among: 'active' }
            : { kind, state: presets.state },
        );
      }
    } else if (kind === 'reviewed_within') {
      rules.push({ kind, days: Math.max(1, Math.round(presets.days) || 365) });
    } else {
      rules.push({ kind });
    }
  }
  return rules;
}

/**
 * "Tilpass" for a requirement's places (design 6.5, `standards:manage`): use
 * another place (re-point = switch this one off, then add the new one), add a
 * place, change the rule, or switch the mapping off for this organisation.
 * Places come from the vocabulary of the enabled modules, grouped by module,
 * with search; rules are offered as plain sentences for the place's allowed
 * kinds. A justification is required, and the live result can be previewed
 * before saving. Emits `saved` after a successful change (the caller reloads).
 */
@Component({
  selector: 'app-location-override-dialog',
  imports: [FormsModule, TranslocoPipe, Button, SlideOver, LocationStatusIcon],
  viewProviders: [provideSharedScope('locations')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [width]="520"
      [title]="'locations.override.title.' + mode() | transloco"
      [subtitle]="current()?.label ?? ''"
      [closeLabel]="'locations.override.close' | transloco"
      (closed)="closed.emit()"
    >
      <div class="flex flex-col gap-4 px-5 py-4" data-testid="location-override-dialog">
        <p class="text-ui text-fg-muted">{{ 'locations.override.intro.' + mode() | transloco }}</p>

        @if (picksPlace()) {
          <div>
            <label class="mb-1 block text-ui font-semibold text-fg" for="loc-search">{{
              'locations.override.place' | transloco
            }}</label>
            <input
              id="loc-search"
              type="search"
              class="h-9 w-full rounded-tile border border-border bg-surface px-3 text-ui text-fg"
              [placeholder]="'locations.override.search' | transloco"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
            />
            <div
              class="mt-2 max-h-64 overflow-y-auto rounded-tile border border-border"
              role="listbox"
              [attr.aria-label]="'locations.override.place' | transloco"
            >
              @for (group of groups(); track group.module) {
                <div class="border-b border-border last:border-b-0">
                  <div class="bg-surface-2 px-3 py-1 text-micro font-bold text-fg-subtle uppercase">
                    {{ group.title }}
                  </div>
                  @for (place of group.places; track place.key) {
                    <button
                      type="button"
                      role="option"
                      class="block w-full px-3 py-1.5 text-left text-ui hover:bg-surface-2"
                      [class.bg-accent-soft]="place.key === pickedKey()"
                      [attr.aria-selected]="place.key === pickedKey()"
                      data-testid="location-option"
                      (click)="pick(place.key)"
                    >
                      <span class="block font-semibold text-fg">{{ place.label }}</span>
                      <span class="block text-meta text-fg-muted">{{ place.description }}</span>
                    </button>
                  }
                </div>
              } @empty {
                <p class="px-3 py-2 text-meta text-fg-muted">
                  {{ 'locations.override.noPlaces' | transloco }}
                </p>
              }
            </div>
          </div>
          @if (mode() === 'add') {
            <label class="flex items-center gap-2 text-ui text-fg">
              {{ 'locations.override.role' | transloco }}
              <select
                class="h-9 rounded-tile border border-border bg-surface px-2 text-ui text-fg"
                [ngModel]="role()"
                (ngModelChange)="role.set($event)"
              >
                <option value="primary">{{ 'locations.override.rolePrimary' | transloco }}</option>
                <option value="supporting">
                  {{ 'locations.override.roleSupporting' | transloco }}
                </option>
              </select>
            </label>
          }
        }

        @if (editsRules() && target(); as place) {
          <fieldset>
            <legend class="mb-1.5 text-ui font-semibold text-fg">
              {{ 'locations.override.rules' | transloco }}
            </legend>
            <div class="flex flex-col gap-2">
              @for (kind of offeredKinds(); track kind) {
                <label class="flex flex-wrap items-center gap-2 text-ui text-fg">
                  <input
                    type="checkbox"
                    [ngModel]="presets().on[kind]"
                    (ngModelChange)="toggle(kind, $event)"
                    [attr.data-testid]="'preset-' + kind"
                  />
                  @switch (kind) {
                    @case ('has_entries') {
                      {{ 'locations.override.preset.minBefore' | transloco }}
                      <input
                        type="number"
                        min="1"
                        class="h-8 w-16 rounded-tile border border-border bg-surface px-2 text-ui"
                        [attr.aria-label]="'locations.override.preset.minLabel' | transloco"
                        [ngModel]="presets().min"
                        (ngModelChange)="setPreset({ min: +$event })"
                      />
                      {{ 'locations.override.preset.minAfter' | transloco }}
                    }
                    @case ('all_in_state') {
                      {{ 'locations.override.preset.state' | transloco }}
                      <select
                        class="h-8 rounded-tile border border-border bg-surface px-2 text-ui"
                        [attr.aria-label]="'locations.override.preset.stateLabel' | transloco"
                        [ngModel]="presets().state"
                        (ngModelChange)="setPreset({ state: $event })"
                      >
                        @for (s of place.states; track s.key) {
                          <option [value]="s.key">{{ s.label }}</option>
                        }
                      </select>
                    }
                    @case ('reviewed_within') {
                      {{ 'locations.override.preset.daysBefore' | transloco }}
                      <input
                        type="number"
                        min="1"
                        class="h-8 w-20 rounded-tile border border-border bg-surface px-2 text-ui"
                        [attr.aria-label]="'locations.override.preset.daysLabel' | transloco"
                        [ngModel]="presets().days"
                        (ngModelChange)="setPreset({ days: +$event })"
                      />
                      {{ 'locations.override.preset.daysAfter' | transloco }}
                    }
                    @default {
                      {{ 'locations.override.preset.noneOverdue' | transloco }}
                    }
                  }
                </label>
              } @empty {
                <p class="text-meta text-fg-muted">
                  {{ 'locations.override.noRules' | transloco }}
                </p>
              }
            </div>
          </fieldset>
        }

        <div>
          <label class="mb-1 block text-ui font-semibold text-fg" for="loc-justification">{{
            'locations.override.justification' | transloco
          }}</label>
          <textarea
            id="loc-justification"
            rows="3"
            class="w-full rounded-tile border border-border bg-surface px-3 py-2 text-ui text-fg"
            [attr.maxlength]="justificationMax"
            [placeholder]="'locations.override.justificationHint' | transloco"
            [ngModel]="justification()"
            (ngModelChange)="justification.set($event)"
            data-testid="location-justification"
          ></textarea>
        </div>

        @if (preview(); as p) {
          <p
            class="flex items-start gap-2 rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg"
            data-testid="location-preview"
          >
            <span class="mt-0.5 flex"><app-location-status-icon [outcome]="p.outcome" /></span>
            <span>
              <span class="block text-micro font-bold text-fg-subtle uppercase">{{
                'locations.override.previewTitle' | transloco
              }}</span>
              {{ p.text || ('locations.outcome.' + p.outcome | transloco) }}
            </span>
          </p>
        }
        @if (error(); as key) {
          <p class="text-ui text-fail" role="alert">{{ key | transloco }}</p>
        }

        <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          @if (editsRules()) {
            <app-button
              variant="ghost"
              size="sm"
              [disabled]="!canPreview()"
              [loading]="previewing()"
              (click)="runPreview()"
              data-testid="location-preview-run"
            >
              {{ 'locations.override.preview' | transloco }}
            </app-button>
          }
          <app-button variant="secondary" size="sm" (click)="closed.emit()">
            {{ 'locations.override.cancel' | transloco }}
          </app-button>
          <app-button
            size="sm"
            [disabled]="!canSave()"
            [loading]="saving()"
            (click)="save()"
            data-testid="location-override-save"
          >
            {{ 'locations.override.save.' + mode() | transloco }}
          </app-button>
        </div>
      </div>
    </app-slide-over>
  `,
})
export class LocationOverrideDialog {
  private readonly api = inject(LocationsApi);
  private readonly locations = inject(LocationsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  readonly open = input(false);
  readonly mode = input<OverrideMode>('add');
  /** The requirement (or clause) ref the override targets. */
  readonly ref = input.required<string>();
  /** The place the menu was opened on (re-point, rules, disable). */
  readonly current = input<LocationResult | null>(null);

  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly justificationMax = JUSTIFICATION_MAX;
  protected readonly vocabulary = signal<readonly LocationVocabulary[]>([]);
  protected readonly query = signal('');
  protected readonly pickedKey = signal<string | null>(null);
  protected readonly role = signal<LocationRole>('primary');
  protected readonly presets = signal<PresetState>(DEFAULT_PRESETS);
  protected readonly justification = signal('');
  protected readonly preview = signal<LocationResult | null>(null);
  protected readonly previewing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly picksPlace = computed(
    () => this.mode() === 'add' || this.mode() === 'repoint',
  );
  protected readonly editsRules = computed(() => this.mode() !== 'disable');

  /** The place whose rules are edited: the picked one, or the card's own for "rules". */
  protected readonly target = computed<LocationVocabulary | null>(() => {
    const key = this.picksPlace() ? this.pickedKey() : (this.current()?.key ?? null);
    return this.vocabulary().find((v) => v.key === key) ?? null;
  });

  protected readonly offeredKinds = computed(() => {
    const kinds = new Set(this.target()?.rule_kinds ?? []);
    return PRESET_KINDS.filter((kind) => kinds.has(kind));
  });

  protected readonly rules = computed(() => presetRules(this.presets(), this.target()));

  protected readonly groups = computed(() => {
    const q = this.query().trim().toLocaleLowerCase();
    const skip = this.current()?.key;
    const byModule = new Map<string, LocationVocabulary[]>();
    for (const place of this.vocabulary()) {
      if (place.key === skip && this.mode() === 'repoint') {
        continue;
      }
      const hay = `${place.label} ${place.description}`.toLocaleLowerCase();
      if (q && !hay.includes(q)) {
        continue;
      }
      byModule.set(place.module, [...(byModule.get(place.module) ?? []), place]);
    }
    return [...byModule.entries()].map(([module, places]) => ({
      module,
      // The module part of the first label ("Kontekst og ledelse: interessenter").
      title: places[0].label.split(': ')[0],
      places,
    }));
  });

  protected readonly canPreview = computed(
    () => !!this.target() && this.rules().length > 0 && !this.previewing(),
  );

  protected readonly canSave = computed(() => {
    if (this.saving() || !this.justification().trim()) {
      return false;
    }
    if (this.mode() === 'disable') {
      return !!this.current();
    }
    if (!this.target()) {
      return false;
    }
    // A primary place must have at least one rule; a supporting one may be a pure pointer.
    const needsRule = this.mode() !== 'add' || this.role() === 'primary';
    return !needsRule || this.rules().length > 0;
  });

  private sub: Subscription | null = null;

  constructor() {
    // Reset and load the vocabulary each time the dialog opens.
    effect(() => {
      if (!this.open()) {
        return;
      }
      const orgId = this.selectedOrg.currentOrgId();
      const lang = this.language.active();
      untracked(() => {
        this.reset();
        if (orgId) {
          this.sub?.unsubscribe();
          this.sub = this.locations.vocabulary(orgId, lang).subscribe((v) => {
            this.vocabulary.set(v);
            this.seedState();
          });
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected pick(key: string): void {
    this.pickedKey.set(key);
    this.preview.set(null);
    this.seedState();
  }

  protected toggle(kind: PresetKind, on: boolean): void {
    this.presets.update((p) => ({ ...p, on: { ...p.on, [kind]: on } }));
    this.preview.set(null);
  }

  protected setPreset(patch: Partial<Omit<PresetState, 'on'>>): void {
    this.presets.update((p) => ({ ...p, ...patch }));
    this.preview.set(null);
  }

  protected runPreview(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = this.target();
    if (!orgId || !target) {
      return;
    }
    this.previewing.set(true);
    this.error.set(null);
    this.api
      .evaluate(
        orgId,
        { preview: { target_ref: this.ref(), location_key: target.key, rules: this.rules() } },
        this.language.active(),
      )
      .subscribe({
        next: (res) => {
          this.preview.set(res.preview ?? null);
          this.previewing.set(false);
        },
        error: () => {
          this.previewing.set(false);
          this.error.set('locations.override.previewError');
        },
      });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canSave()) {
      return;
    }
    const justification = this.justification().trim();
    const ref = this.ref();
    const current = this.current();
    const target = this.target();
    const steps: (() => Observable<unknown>)[] = [];
    const mode = this.mode();
    if ((mode === 'disable' || mode === 'repoint') && current) {
      steps.push(() =>
        this.api.createOverride(orgId, {
          target_ref: ref,
          location_key: current.key,
          action: 'disable',
          justification,
        }),
      );
    }
    if ((mode === 'add' || mode === 'repoint') && target) {
      steps.push(() =>
        this.api.createOverride(orgId, {
          target_ref: ref,
          location_key: target.key,
          action: 'add',
          role: mode === 'repoint' ? (current?.role ?? 'primary') : this.role(),
          rules: this.rules(),
          justification,
        }),
      );
    }
    if (mode === 'rules' && current) {
      steps.push(() =>
        this.api.createOverride(orgId, {
          target_ref: ref,
          location_key: current.key,
          action: 'replace_rules',
          role: current.role,
          rules: this.rules(),
          justification,
        }),
      );
    }
    this.saving.set(true);
    this.error.set(null);
    steps
      .reduce<Observable<unknown>>((chain, step) => chain.pipe(concatMap(() => step())), of(null))
      .subscribe({
        next: () => undefined,
        complete: () => {
          this.saving.set(false);
          this.locations.invalidate();
          this.saved.emit();
        },
        error: () => {
          this.saving.set(false);
          // A re-point may have switched the old place off already; reload so it shows.
          this.locations.invalidate();
          this.error.set('locations.override.saveError');
        },
      });
  }

  private reset(): void {
    this.query.set('');
    this.pickedKey.set(null);
    this.role.set('primary');
    this.presets.set(DEFAULT_PRESETS);
    this.justification.set('');
    this.preview.set(null);
    this.error.set(null);
  }

  /** Default state for `all_in_state`: the place's first state that is not "active". */
  private seedState(): void {
    const states = this.target()?.states ?? [];
    const first = states.find((s) => s.key !== 'active') ?? states[0];
    this.presets.update((p) => ({ ...p, state: first?.key ?? '' }));
  }
}
