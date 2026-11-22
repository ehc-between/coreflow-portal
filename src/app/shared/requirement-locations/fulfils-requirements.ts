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
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, filter, map, of, switchMap } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import {
  FulfilsItem,
  LocationOutcome,
  LocationRequirements,
} from '../../core/locations/locations.models';
import { LocationsService, locationForPath } from '../../core/locations/locations.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementLabel } from '../../core/standards/standards.models';
import { RequirementChip } from '../requirement-links/requirement-chip';
import { frameworkOf, reqIndexOf, requirementRoute } from '../requirement-links/requirement-label';
import { Icon } from '../ui/icon/icon';
import { provideLocationContext } from './location-context';
import { FROM_REQUIREMENT_PARAM, TEXT_LINK } from './location-links';
import { LocationStatusIcon, worstOutcome } from './location-status-icon';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';

/** Clause chips shown before "+ N". */
export const FULFILS_CHIPS_MAX = 4;

/** One clause of one standard the place fulfils ("ISO 9001 · 4.2"), its requirements merged. */
export interface FulfilsGroup {
  readonly id: string;
  readonly label: RequirementLabel;
  readonly outcome: LocationOutcome;
  readonly items: readonly FulfilsItem[];
}

/** The requirement's label as a chip label (the clause title only; no requirement text). */
export function chipLabel(item: FulfilsItem): RequirementLabel {
  return {
    ref: item.ref,
    short: item.label.short,
    number: item.label.number,
    title: item.label.title,
    text: '',
    standard_key: item.standard_key,
    framework: item.framework ?? frameworkOf(item.standard_key),
    req_index: reqIndexOf(item.ref) ?? 1,
    req_count: 1,
  };
}

const NATURAL = new Intl.Collator('en', { numeric: true });

/**
 * Items grouped per standard + clause. Clauses filled in here (any primary
 * requirement) come first, then the "also relevant" ones; within each, standards
 * and clause numbers in natural order (ISO 9001 before ISO 14001, 4.2 before 10.1).
 */
export function groupFulfils(items: readonly FulfilsItem[]): FulfilsGroup[] {
  const groups = new Map<string, FulfilsItem[]>();
  for (const item of items) {
    const id = `${item.standard_key}|${item.label.number}`;
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  const primary = (list: readonly FulfilsItem[]) => list.some((i) => i.role === 'primary');
  // Management-system standards before regulations, as the strip reads "ISO 9001 · 4.2 · …".
  const iso = (list: readonly FulfilsItem[]) => list[0].label.short.startsWith('ISO');
  return [...groups.entries()]
    .sort(
      ([, a], [, b]) =>
        Number(primary(b)) - Number(primary(a)) ||
        Number(iso(b)) - Number(iso(a)) ||
        NATURAL.compare(a[0].label.short, b[0].label.short) ||
        NATURAL.compare(a[0].label.number, b[0].label.number),
    )
    .map(([id, list]) => ({
      id,
      label: chipLabel(list[0]),
      outcome: worstOutcome(list.filter((i) => i.role === 'primary').map((i) => i.outcome)),
      items: [...list].sort((a, b) => NATURAL.compare(a.ref, b.ref)),
    }));
}

/** Route of a requirement from its ref alone (`iso9001-2026:4.2.r1`). */
export function routeOfRef(ref: string) {
  const [standardKey, rest = ''] = ref.split(':');
  return requirementRoute({ standard_key: standardKey, number: rest.replace(/\.r\d+$/, ''), ref });
}

/**
 * "Dette oppfyller" (design 6.3): a compact strip on a module's register page
 * listing the requirements of the enabled standards that are filled in here
 * ("ISO 9001 · 4.2 · ISO 14001 · 4.2 + 3"), each with the place's outcome, and
 * an expandable list with what is missing. When the page was opened from a
 * requirement (`?fromRequirement=`), the strip becomes a banner with that
 * requirement, its status here and "Tilbake til kravet". Also tells the
 * assistant which requirements this page fulfils.
 *
 * `locationKey` names the place; leave it out on pages that serve several places
 * from one component (the place is then matched on the current path).
 *
 *   <app-fulfils-requirements locationKey="processes.register" />
 */
@Component({
  selector: 'app-fulfils-requirements',
  imports: [RouterLink, TranslocoPipe, Icon, LocationStatusIcon, RequirementChip],
  viewProviders: [provideSharedScope('locations', 'standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden', '[style.display]': "reqVis.show() ? null : 'none'" },
  template: `
    @if (from(); as f) {
      <div
        class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-tile border border-accent-border bg-accent-soft/40 px-3.5 py-2.5 text-ui"
        data-testid="fulfils-banner"
        role="status"
      >
        <span class="flex text-accent"><app-icon name="target" [size]="15" /></span>
        <span class="min-w-0 flex-1 text-fg">
          @if (f.label; as l) {
            {{
              (l.title ? 'locations.fulfils.cameFrom' : 'locations.fulfils.cameFromNoTitle')
                | transloco: { short: l.short, number: l.number, title: l.title }
            }}
          } @else {
            {{ 'locations.fulfils.cameFromRequirement' | transloco }}
          }
          @if (f.item; as item) {
            @if (item.text) {
              <span class="ml-1 inline-flex items-center gap-1 text-fg-muted">
                · <app-location-status-icon [outcome]="item.outcome" [size]="13" />
                {{ item.text }}
              </span>
            }
          }
        </span>
        <a
          [routerLink]="f.route.commands"
          [queryParams]="f.route.queryParams"
          [class]="textLink"
          data-testid="fulfils-back"
          >{{ 'locations.fulfils.back' | transloco }}</a
        >
      </div>
    } @else if (groups().length > 0) {
      <div class="mb-4 text-ui" data-testid="fulfils-requirements" [attr.data-location]="key()">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span class="text-meta font-semibold text-fg-subtle">{{
            'locations.fulfils.title' | transloco
          }}</span>
          @for (g of shown(); track g.id) {
            <span class="inline-flex items-center gap-1" data-testid="fulfils-chip">
              <app-location-status-icon [outcome]="g.outcome" [size]="13" />
              <app-requirement-chip [label]="g.label" status="plain" [showPosition]="false" />
            </span>
          }
          @if (hidden() > 0 || hasDetail()) {
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-semibold text-accent hover:bg-accent-soft"
              [attr.aria-expanded]="expanded()"
              aria-controls="fulfils-detail"
              (click)="expanded.set(!expanded())"
              data-testid="fulfils-toggle"
            >
              @if (hidden() > 0 && !expanded()) {
                {{ 'locations.fulfils.more' | transloco: { count: hidden() } }}
              } @else {
                {{ (expanded() ? 'locations.fulfils.hide' : 'locations.fulfils.show') | transloco }}
              }
              <app-icon
                name="chevron"
                [size]="12"
                class="transition-transform motion-reduce:transition-none"
                [class]="expanded() ? 'rotate-180' : ''"
              />
            </button>
          }
        </div>
        @if (expanded()) {
          <ul
            id="fulfils-detail"
            class="mt-2 flex flex-col gap-1.5 rounded-tile border border-border bg-surface px-3 py-2.5"
            data-testid="fulfils-detail"
          >
            @for (g of groups(); track g.id) {
              <li>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <app-requirement-chip [label]="g.label" status="plain" [showPosition]="false" />
                  <span class="min-w-0 text-meta font-semibold text-fg">{{ g.label.title }}</span>
                </div>
                <ul class="mt-0.5 flex flex-col gap-0.5 pl-1">
                  @for (item of g.items; track item.ref) {
                    <li class="flex items-center gap-1.5 text-meta">
                      <app-location-status-icon [outcome]="item.outcome" [size]="12" />
                      <!-- A supporting pointer without rules has nothing to report. -->
                      @if (item.text || item.role === 'primary') {
                        <span class="text-fg-muted">{{
                          item.text || ('locations.outcome.' + item.outcome | transloco)
                        }}</span>
                      }
                      @if (item.role === 'supporting') {
                        <span class="text-micro text-fg-subtle">{{
                          'locations.fulfils.supporting' | transloco
                        }}</span>
                      }
                    </li>
                  }
                </ul>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class FulfilsRequirements {
  /** "Vis krav" (IA v2 §4.3): hidden unless the switch is on or on an expert page. */
  protected readonly reqVis = inject(RequirementsVisibilityService);
  private readonly locations = inject(LocationsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  /** The place this page is (`context.interested_parties`); matched on the path when empty. */
  readonly locationKey = input<string | null>(null);

  protected readonly textLink = TEXT_LINK;
  protected readonly data = signal<LocationRequirements | null>(null);
  protected readonly expanded = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** The current path without query: list filters must not reload the strip. */
  private readonly path = computed(() => this.url().split(/[?#]/)[0]);

  protected readonly key = computed(() => this.data()?.location.key ?? this.locationKey());
  protected readonly groups = computed(() => groupFulfils(this.data()?.items ?? []));
  protected readonly shown = computed(() => this.groups().slice(0, FULFILS_CHIPS_MAX));
  protected readonly hidden = computed(() => Math.max(0, this.groups().length - FULFILS_CHIPS_MAX));
  /** Whether the expanded list adds anything (texts or more than one requirement). */
  protected readonly hasDetail = computed(() => (this.data()?.items ?? []).some((i) => !!i.text));

  /** The requirement the user came from (`?fromRequirement=`), for the banner. */
  protected readonly from = computed(() => {
    const ref = this.router.parseUrl(this.url()).queryParams[FROM_REQUIREMENT_PARAM];
    if (typeof ref !== 'string' || !ref) {
      return null;
    }
    const item = this.data()?.items.find((i) => i.ref === ref) ?? null;
    const label = item ? chipLabel(item) : null;
    return { ref, item, label, route: label ? requirementRoute(label) : routeOfRef(ref) };
  });

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const lang = this.language.active();
      const explicit = this.locationKey();
      const path = explicit ? null : this.path();
      this.locations.version();
      untracked(() => this.load(orgId, lang, explicit, path));
    });
    provideLocationContext(() => {
      const items = this.data()?.items ?? [];
      return [
        ...items.filter((i) => i.role === 'primary'),
        ...items.filter((i) => i.role !== 'primary'),
      ].map((i) => i.ref);
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, lang: string, key: string | null, path: string | null): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      this.data.set(null);
      return;
    }
    const key$ = key
      ? of(key)
      : this.locations
          .vocabulary(orgId, lang)
          .pipe(map((vocabulary) => locationForPath(vocabulary, path ?? '')?.key ?? null));
    this.sub = key$
      .pipe(switchMap((k) => (k ? this.locations.requirementsOf(orgId, k, lang) : of(null))))
      .subscribe((data) => this.data.set(data));
  }
}
