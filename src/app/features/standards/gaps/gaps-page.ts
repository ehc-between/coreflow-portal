import { HttpErrorResponse } from '@angular/common/http';
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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { EntityTypesService } from '../../../core/kit/entity-types.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { internalLink } from '../../../core/search/internal-link';
import { StandardsApi } from '../../../core/standards/standards-api';
import { localized, statusLabelKey, statusTone } from '../../../core/standards/standards-data';
import {
  ClauseNode,
  EvidencingType,
  RequirementGap,
  StandardSummary,
} from '../../../core/standards/standards.models';
import { RequirementChip } from '../../../shared/requirement-links/requirement-chip';
import { LocationFillIn } from '../../../shared/requirement-locations/location-fill-in';
import {
  fixedShortName,
  frameworkOf,
  requirementRoute,
  shortNameKey,
} from '../../../shared/requirement-links/requirement-label';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pager } from '../../../shared/ui/pager/pager';
import { moduleName } from '../evidence-picker';

/** Gaps per page. */
export const GAPS_PAGE_SIZE = 25;

/** What a gap row offers: create a record of a type that would close it. */
export function fixActions(gap: RequirementGap): readonly EvidencingType[] {
  return gap.fix_in.filter((t) => t.enabled);
}

/**
 * "Mangler" for one enabled standard (`/standards/gaps/:key`): every
 * applicable requirement without confirmed evidence (`GET frameworks/gaps`),
 * by chapter, each with the record types that would close it ("Opprett
 * risiko", "Opprett leverandørvurdering", …, prefilled from the requirement)
 * and a link to the requirement itself. Answers "what should I do next?"
 * for a standard.
 */
@Component({
  selector: 'app-gaps-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    Pager,
    RequirementChip,
    LocationFillIn, // requirement-locations (L4)
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
      <app-page-header
        titleKey="standards.reqs.gaps.title"
        [titleParams]="{ name: shortName() }"
        descriptionKey="standards.reqs.gaps.subtitle"
        [breadcrumbs]="breadcrumbs()"
      >
        <a
          secondary
          [routerLink]="['/standards', key()]"
          class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2"
        >
          <app-icon name="iso" [size]="14" />
          {{ 'standards.reqs.gaps.openStandard' | transloco }}
        </a>
      </app-page-header>

      <app-help-strip scope="standards" page="gaps" />

      @if (notEnabled()) {
        <app-empty-state
          icon="iso"
          titleKey="standards.reqs.gaps.notEnabled"
          bodyKey="standards.reqs.gaps.notEnabledBody"
          ctaKey="standards.reqs.gaps.toOverview"
          ctaLink="/standards"
        />
      } @else if (loadError()) {
        <app-error-state bodyKey="standards.reqs.gaps.loadError" (retry)="reload()" />
      } @else {
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <label class="flex items-center gap-2 text-ui text-fg-muted">
            {{ 'standards.reqs.gaps.chapter' | transloco }}
            <select
              class="h-9 rounded-tile border border-border bg-surface px-2 text-ui text-fg"
              [value]="selectedChapter() ?? ''"
              (change)="setChapter($any($event.target).value)"
              data-testid="gaps-chapter"
            >
              <option value="">{{ 'standards.reqs.gaps.allChapters' | transloco }}</option>
              @for (c of chapters(); track c.number) {
                <option [value]="c.number">{{ c.number }} {{ c.title }}</option>
              }
            </select>
          </label>
          @if (!loading()) {
            <p class="text-ui text-fg-muted" data-testid="gaps-total" aria-live="polite">
              {{ plural('standards.reqs.gaps.count', total()) | transloco: { count: total() } }}
            </p>
          }
        </div>

        @if (loading()) {
          <app-loading-state />
        } @else if (items().length === 0) {
          <app-empty-state
            icon="checkcircle"
            titleKey="standards.reqs.gaps.none"
            bodyKey="standards.reqs.gaps.noneBody"
          />
        } @else {
          <ul class="flex flex-col gap-3" data-testid="gaps-list">
            @for (gap of items(); track gap.ref) {
              <li>
                <app-card>
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        @if (gap.label; as label) {
                          <app-requirement-chip [label]="label" status="plain" [link]="false" />
                        }
                        <app-badge [tone]="tone(gap)">{{ statusKey(gap) | transloco }}</app-badge>
                      </div>
                      <p class="mt-1.5 text-ui font-semibold text-fg">{{ gap.title }}</p>
                      @if (gap.text) {
                        <p class="mt-0.5 text-ui text-fg-muted">{{ gap.text }}</p>
                      }
                      <!-- requirement-locations (L4): "Fyll ut i" -->
                      <app-location-fill-in [gap]="gap" />
                      @if (fixes(gap).length > 0) {
                        <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span class="text-meta font-semibold text-fg-subtle">{{
                            'standards.reqs.gaps.fixWith' | transloco
                          }}</span>
                          @for (t of fixes(gap); track t.entity_type) {
                            @if (createUrl(t); as url) {
                              <a
                                [href]="url"
                                class="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-meta font-semibold text-fg hover:border-accent hover:text-accent"
                                data-testid="gap-create"
                                (click)="navigate($event, url)"
                              >
                                <app-icon name="plus" [size]="12" />
                                {{ typeLabel(t) }}
                              </a>
                            } @else {
                              <span
                                class="inline-flex h-7 items-center rounded-lg border border-dashed border-border px-2.5 text-meta text-fg-muted"
                                [title]="moduleLabel(t.module)"
                                >{{ typeLabel(t) }}</span
                              >
                            }
                          }
                        </div>
                      }
                    </div>
                    <a
                      [routerLink]="route(gap).commands"
                      [queryParams]="route(gap).queryParams"
                      class="inline-flex h-8 flex-none items-center gap-1.5 self-start rounded-tile px-3 text-ui font-semibold text-accent hover:bg-accent-soft"
                      data-testid="gap-open"
                    >
                      {{ 'standards.reqs.gaps.openRequirement' | transloco }}
                      <app-icon name="arrow" [size]="14" />
                    </a>
                  </div>
                </app-card>
              </li>
            }
          </ul>
          <div class="mt-4">
            <app-pager
              [offset]="offset()"
              [pageSize]="pageSize"
              [count]="items().length"
              [total]="total()"
              (pageChange)="setOffset($event)"
            />
          </div>
        }
      }
    </div>
  `,
})
export class GapsPage {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly router = inject(Router);

  /** Standard key (route param). */
  readonly key = input.required<string>();
  /** Chapter filter (`?chapter=`). */
  readonly chapter = input<string | undefined>(undefined);

  protected readonly pageSize = GAPS_PAGE_SIZE;
  protected readonly standard = signal<StandardSummary | null>(null);
  protected readonly tree = signal<readonly ClauseNode[]>([]);
  protected readonly items = signal<readonly RequirementGap[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly selectedChapter = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notEnabled = signal(false);
  private readonly reloadTick = signal(0);

  protected readonly standardName = computed(() => this.standard()?.name ?? this.key());
  /** "ISO 27001", "GDPR", "KI-forordningen": short enough for a page title. */
  protected readonly shortName = computed(() => {
    const framework = frameworkOf(this.key());
    const key = shortNameKey(framework);
    return key ? this.language.translate(key) : (fixedShortName(framework) ?? this.standardName());
  });
  protected readonly chapters = computed(() =>
    this.tree().map((n) => ({
      number: n.number,
      title: localized(n.title, this.language.active()),
    })),
  );
  protected readonly breadcrumbs = computed(() => [
    { labelKey: 'modules.names.standards', link: '/standards' },
    { label: this.shortName(), link: ['/standards', this.key()] },
    { labelKey: 'standards.reqs.gaps.crumb' },
  ]);

  protected readonly plural = (key: string, count: number): string =>
    count === 1 ? `${key}One` : key;

  private sub: Subscription | null = null;
  private metaSub: Subscription | null = null;

  constructor() {
    this.entityTypes.ensureLoaded();
    providePageContext(() => ({
      module: 'standards',
      entityType: 'standard',
      view: 'list',
      title: this.shortName(),
      selection: { field: 'gaps' },
    }));
    effect(() => {
      const chapter = this.chapter();
      untracked(() => {
        this.selectedChapter.set(chapter || null);
        this.offset.set(0);
      });
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const key = this.key();
      untracked(() => this.loadMeta(orgId, key));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const key = this.key();
      const chapter = this.selectedChapter();
      const offset = this.offset();
      this.language.active();
      this.reloadTick();
      untracked(() => this.load(orgId, key, chapter, offset));
    });
    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      this.metaSub?.unsubscribe();
    });
  }

  protected fixes(gap: RequirementGap): readonly EvidencingType[] {
    return fixActions(gap);
  }

  protected tone(gap: RequirementGap) {
    return statusTone(gap.status);
  }

  protected statusKey(gap: RequirementGap): string {
    return statusLabelKey(gap.status);
  }

  protected route(gap: RequirementGap) {
    return requirementRoute(
      gap.label ?? { standard_key: this.key(), number: gap.number, ref: gap.ref },
    );
  }

  protected typeLabel(t: EvidencingType): string {
    return this.entityTypes.label(t.entity_type, t.label_key);
  }

  protected moduleLabel(module: string): string {
    return moduleName(module, (key) => this.language.translate(key));
  }

  protected createUrl(t: EvidencingType): string | null {
    return t.create_url && t.can_create !== false && internalLink(t.create_url)
      ? t.create_url
      : null;
  }

  protected navigate(event: MouseEvent, url: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    void this.router.navigateByUrl(url);
  }

  protected setChapter(value: string): void {
    this.selectedChapter.set(value || null);
    this.offset.set(0);
    void this.router.navigate([], {
      queryParams: { chapter: value || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setOffset(offset: number): void {
    this.offset.set(offset);
  }

  protected reload(): void {
    this.reloadTick.update((n) => n + 1);
  }

  private loadMeta(orgId: string | null, key: string): void {
    this.metaSub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.metaSub = forkJoin({
      standards: this.api.list(orgId).pipe(catchError(() => of([] as StandardSummary[]))),
      tree: this.api.getTree(orgId, key).pipe(catchError(() => of([] as ClauseNode[]))),
    }).subscribe(({ standards, tree }) => {
      this.standard.set(standards.find((s) => s.key === key) ?? null);
      this.tree.set(tree);
    });
  }

  private load(orgId: string | null, key: string, chapter: string | null, offset: number): void {
    this.sub?.unsubscribe();
    this.loadError.set(false);
    this.notEnabled.set(false);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.sub = this.api.gaps(orgId, key, { chapter, offset, limit: GAPS_PAGE_SIZE }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.notEnabled.set(true);
        } else {
          this.loadError.set(true);
        }
      },
    });
  }
}
