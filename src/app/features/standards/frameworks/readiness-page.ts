import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import {
  FrameworkView,
  ReadinessParts,
  readinessParts,
} from '../../../core/standards/frameworks-data';
import { StandardsApi } from '../../../core/standards/standards-api';
import { pctColor } from '../../../core/standards/standards-data';
import {
  legalFormKey,
  legalFormOf,
  legalFormTone,
  standardName,
} from '../../../core/standards/standards-display';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ExportFormat, LegalForm } from '../../../core/standards/standards.models';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressRing } from '../../../shared/ui/progress-ring/progress-ring';
import { AskPanelService } from '../../ask/ask-panel.service';
import { loadFrameworks } from './frameworks-load';
import { ReadinessBar, SegmentLink } from './readiness-bar';
import { EntityTypesService } from '../../../core/kit/entity-types.service';
import { providePageContext } from '../../../core/ai/page-context';
import { pluralKey } from '../../../shared/i18n/plural';
import { BasisSummary } from '../../../shared/requirement-locations/basis-summary';

/** Each readiness segment opens the requirements behind it in the workspace. */
export function segmentLinks(
  standardKey: string,
): Partial<Record<keyof ReadinessParts, SegmentLink>> {
  const link = ['/standards', standardKey];
  return {
    stale: { link, queryParams: { filter: 'stale' } },
    partial: { link, queryParams: { filter: 'gaps' } },
    missing: { link: ['/standards/gaps', standardKey] },
  };
}

interface ReadinessRow {
  readonly view: FrameworkView;
  /** The standard's name in the UI language. */
  readonly name: string;
  readonly form: LegalForm;
  readonly links: Partial<Record<keyof ReadinessParts, SegmentLink>>;
  readonly score: number;
  readonly applicable: number;
  /** EU AI Act: points left out as not applicable (derived). */
  readonly derivedNotApplicable: number;
  readonly parts: ReadinessParts | null;
  /** Record types that document covered requirements, most first (top 6). */
  readonly sources: readonly EvidenceSource[];
  /** Covered requirements documented through a record field (origin "field"). */
  readonly fromFields: number;
  /** Applicable requirements not covered yet. */
  readonly gaps: number;
}

export interface EvidenceSource {
  readonly entityType: string;
  readonly count: number;
}

/** The record types documenting a standard's requirements, most first. */
export function evidenceSources(
  byType: Readonly<Record<string, number>> | undefined,
  max = 6,
): EvidenceSource[] {
  return Object.entries(byType ?? {})
    .filter(([, count]) => count > 0)
    .map(([entityType, count]) => ({ entityType, count }))
    .sort((a, b) => b.count - a.count || a.entityType.localeCompare(b.entityType))
    .slice(0, max);
}

/**
 * Readiness per enabled framework (`/standards/readiness`): the score ring,
 * the breakdown into covered-recent / covered-older / partial / not started,
 * a link into the standard, and a "Summarise" button that asks the assistant
 * what to do next. Teaches how the score works (guide + micro-lesson); an empty
 * org gets a teaching empty state pointing at the overview.
 */
@Component({
  selector: 'app-readiness-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    OverflowMenu,
    PageHeader,
    ProgressRing,
    ReadinessBar,
    BasisSummary, // requirement-locations (L4)
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
      <app-page-header
        titleKey="standards.readiness.title"
        descriptionKey="standards.readiness.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.standards', link: '/standards' },
          { labelKey: 'standards.readiness.crumb' },
        ]"
      />

      <app-help-strip scope="standards" page="readiness" lesson="readiness" />

      @if (loading()) {
        <app-loading-state [rows]="3" />
      } @else if (loadError()) {
        <app-error-state (retry)="reload()" />
      } @else if (rows().length === 0) {
        <app-empty-state
          icon="iso"
          titleKey="standards.readiness.empty.title"
          bodyKey="standards.readiness.empty.body"
          ctaKey="standards.readiness.empty.cta"
          ctaLink="/standards"
        />
      } @else {
        <p class="mb-3 text-meta text-fg-muted">
          {{ 'standards.readiness.weights' | transloco }}
        </p>
        <ul class="flex flex-col gap-4">
          @for (row of rows(); track row.view.standardKey) {
            <li>
              <app-card>
                <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <app-progress-ring
                    [value]="row.score"
                    [size]="72"
                    [color]="pctColor(row.score)"
                    [label]="'standards.readiness.score' | transloco"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="font-display text-card font-bold text-fg [overflow-wrap:anywhere]">
                        {{ row.name }}
                      </h2>
                      <app-badge [tone]="legalFormTone(row.form)">
                        {{ legalFormKey(row.form) | transloco }}
                      </app-badge>
                    </div>
                    <p class="mt-0.5 text-meta text-fg-subtle">
                      {{ 'standards.readiness.applicable' | transloco: { count: row.applicable } }}
                    </p>
                    @if (row.derivedNotApplicable > 0) {
                      <p
                        class="mt-0.5 text-meta text-fg-subtle"
                        data-testid="derived-not-applicable"
                      >
                        {{
                          'standards.readiness.derivedNotApplicable'
                            | transloco: { count: row.derivedNotApplicable }
                        }}
                      </p>
                    }
                    @if (row.parts; as parts) {
                      <div class="mt-3">
                        <app-readiness-bar
                          [parts]="parts"
                          [links]="row.links"
                          [label]="('standards.readiness.breakdown' | transloco) + ': ' + row.name"
                        />
                      </div>
                    }
                    @if (row.sources.length > 0) {
                      <p class="mt-3 text-meta text-fg-muted" data-testid="readiness-sources">
                        <span class="font-semibold text-fg">{{
                          'standards.reqs.readiness.documentedBy' | transloco
                        }}</span>
                        @for (s of row.sources; track s.entityType; let last = $last) {
                          {{ typeLabel(s.entityType) }} ({{ s.count }}){{ last ? '' : ' · ' }}
                        }
                      </p>
                    }
                    <!-- requirement-locations (L4) -->
                    <app-basis-summary [readiness]="row.view.breakdown" />
                    @if (row.fromFields > 0) {
                      <p class="mt-1 text-meta text-fg-subtle" data-testid="readiness-fields">
                        {{
                          plural('standards.reqs.readiness.fromFields', row.fromFields)
                            | transloco: { count: row.fromFields }
                        }}
                      </p>
                    }
                  </div>
                  <div class="flex flex-none flex-wrap gap-2 sm:flex-col sm:items-end">
                    <a
                      [routerLink]="['/standards', row.view.standardKey]"
                      class="inline-flex h-9 items-center justify-center gap-2 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg transition-colors hover:border-border-strong hover:bg-surface-2"
                    >
                      {{ 'standards.readiness.open' | transloco }}
                      <app-icon name="arrow" [size]="14" />
                    </a>
                    @if (row.gaps > 0) {
                      <a
                        [routerLink]="['/standards/gaps', row.view.standardKey]"
                        class="inline-flex h-8 items-center justify-center gap-2 rounded-tile px-3 text-ui font-semibold text-accent hover:bg-accent-soft"
                        data-testid="readiness-gaps"
                      >
                        {{
                          plural('standards.reqs.readiness.gaps', row.gaps)
                            | transloco: { count: row.gaps }
                        }}
                      </a>
                    }
                    @if (!aiUnavailable()) {
                      <app-button variant="ghost" size="sm" (click)="summarise(row)">
                        <app-icon name="spark" [size]="14" />
                        {{ 'standards.readiness.summarise' | transloco }}
                      </app-button>
                    }
                    <app-overflow-menu
                      labelKey="standards.export.menu"
                      [attr.data-testid]="'readiness-export-' + row.view.standardKey"
                    >
                      @for (format of exportFormats; track format) {
                        <button
                          appMenuItem
                          type="button"
                          [disabled]="exporting() !== null"
                          (click)="exportMatrix(row, format)"
                        >
                          <app-icon name="reports" [size]="15" />
                          {{ 'standards.export.' + format | transloco }}
                        </button>
                      }
                      <a appMenuItem routerLink="/library/audit-packs">
                        <app-icon name="qa" [size]="15" />
                        {{ 'standards.export.auditPack' | transloco }}
                      </a>
                    </app-overflow-menu>
                  </div>
                </div>
              </app-card>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class ReadinessPage {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);
  protected readonly aiUnavailable = inject(AiAvailability).unavailable;

  protected readonly pctColor = pctColor;
  protected readonly legalFormKey = legalFormKey;
  protected readonly legalFormTone = legalFormTone;
  protected readonly exportFormats: readonly ExportFormat[] = ['xlsx', 'csv', 'pdf'];
  protected readonly exporting = signal<string | null>(null);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly plural = pluralKey;
  private readonly entityTypes = inject(EntityTypesService);

  protected typeLabel(entityType: string): string {
    return this.entityTypes.label(entityType);
  }

  private readonly views = signal<readonly FrameworkView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  protected readonly rows = computed<readonly ReadinessRow[]>(() =>
    this.views()
      .filter((v) => v.enabled)
      .map((view) => ({
        view,
        name: view.standard ? standardName(view.standard, this.language.active()) : view.name,
        form: legalFormOf(view.standard, view.kind),
        links: segmentLinks(view.standardKey),
        score: view.standard?.score ?? view.readiness ?? view.standard?.completeness.pct ?? 0,
        applicable: view.breakdown?.applicable ?? view.standard?.completeness.applicable ?? 0,
        derivedNotApplicable: view.breakdown?.derived_not_applicable ?? 0,
        parts: view.breakdown ? readinessParts(view.breakdown) : null,
        sources: evidenceSources(view.breakdown?.by_entity_type),
        fromFields: view.breakdown?.by_origin?.field ?? 0,
        gaps: view.breakdown
          ? Math.max(0, view.breakdown.applicable - view.breakdown.covered)
          : Math.max(
              0,
              (view.standard?.completeness.applicable ?? 0) -
                (view.standard?.completeness.covered ?? 0),
            ),
      })),
  );

  private sub: Subscription | null = null;

  constructor() {
    this.entityTypes.ensureLoaded();
    providePageContext(() => ({
      module: 'standards',
      view: 'dashboard',
      selection: { field: 'readiness' },
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected summarise(row: ReadinessRow): void {
    const parts = row.parts ?? { fresh: 0, stale: 0, partial: 0, missing: row.applicable };
    this.ask.showWith(
      this.transloco.translate('standards.readiness.summarisePrompt', {
        name: row.name,
        score: row.score,
        applicable: row.applicable,
        ...parts,
      }),
    );
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  /** Download the standard's compliance matrix (requirement, status, evidence, owner …). */
  protected exportMatrix(row: ReadinessRow, format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    const key = row.view.standardKey;
    this.exporting.set(key);
    this.api.exportMatrix(orgId, key, format).subscribe({
      next: (blob) => {
        this.exporting.set(null);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${key}-${this.language.active()}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => {
        this.exporting.set(null);
        this.notifications.error('standards.export.error');
      },
    });
  }

  private load(orgId: string | null): void {
    this.sub?.unsubscribe();
    this.views.set([]);
    this.loadError.set(false);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.sub = loadFrameworks(this.api, orgId).subscribe({
      next: ({ views }) => {
        this.views.set(views);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }
}
