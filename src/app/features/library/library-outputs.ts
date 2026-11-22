import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { GeneratedOutput } from '../../core/outputs/outputs.models';
import { StandardsApi } from '../../core/standards/standards-api';
import { StandardChoice } from '../../shared/outputs/generate-dialog';
import { ReportsNav } from '../reports/components/reports-nav';
import { OutputsPanel } from '../../shared/outputs/outputs-panel';
import { SECONDARY_LINK, TEXT_LINK } from '../../shared/requirement-locations/location-links';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { GeneratedRow } from '../../shared/outputs/generated-row';

/** Latest files shown under the catalogue. */
const RECENT = 5;

/**
 * `/library` — "Dokumenter og rapporter", tab Hent ut (simplify plan 3.1): every
 * output the caller can make, grouped by who it is for ("Til revisor", "Til
 * Datatilsynet"…). `?module=` (from a module's "Dokumenter og rapporter" button),
 * `?standard=` (from a standard page) and `?kind=` narrow the list; picking a
 * standard also shows readiness for per-standard outputs. The newest generated files
 * follow, with a link to the archive.
 */
@Component({
  selector: 'app-library-outputs',
  imports: [RouterLink, TranslocoPipe, Icon, ReportsNav, OutputsPanel, PageHeader, GeneratedRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="reports.hub.all.title"
        descriptionKey="reports.hub.all.description"
        [breadcrumbs]="[
          { labelKey: 'reports.hub.title', link: '/reports' },
          { labelKey: 'reports.hub.all.title' },
        ]"
      >
        @if (canExportRegisters()) {
          <a
            secondary
            routerLink="/reports/exports"
            [class]="secondaryLink"
            data-testid="library-registers"
          >
            <app-icon name="download" [size]="15" />
            {{ 'outputs.library.registers' | transloco }}
          </a>
        }
        @if (canOpenDocuments()) {
          <a
            secondary
            routerLink="/documents"
            [class]="secondaryLink"
            data-testid="library-documents"
          >
            <app-icon name="documents" [size]="15" />
            {{ 'outputs.library.documents' | transloco }}
          </a>
        }
      </app-page-header>
      <app-reports-nav />

      <div class="mb-5 flex flex-wrap items-end gap-3" data-testid="library-filters">
        <label class="flex min-w-[220px] flex-1 flex-col gap-1">
          <span class="text-ui font-semibold text-fg-muted">{{
            'outputs.library.search' | transloco
          }}</span>
          <input
            type="search"
            class="h-9 rounded-tile border border-border bg-surface px-3 text-ui"
            data-testid="library-search"
            [placeholder]="'outputs.library.searchPlaceholder' | transloco"
            [value]="search()"
            (input)="search.set(asValue($event))"
          />
        </label>
        @if (standards().length > 0) {
          <label class="flex min-w-[200px] flex-col gap-1">
            <span class="text-ui font-semibold text-fg-muted">{{
              'outputs.library.standard' | transloco
            }}</span>
            <select
              class="h-9 rounded-tile border border-border bg-surface px-2.5 text-ui"
              data-testid="library-standard"
              [value]="standard() ?? ''"
              (change)="setParam('standard', asValue($event))"
            >
              <option value="">{{ 'outputs.library.allStandards' | transloco }}</option>
              @for (s of standards(); track s.key) {
                <option [value]="s.key" [selected]="s.key === standard()">{{ s.name }}</option>
              }
            </select>
          </label>
        }
      </div>

      @if (module() || kind()) {
        <p
          class="mb-4 flex flex-wrap items-center gap-2 text-ui text-fg-muted"
          data-testid="library-scope"
        >
          @if (module(); as m) {
            {{ 'outputs.library.fromModule' | transloco: { module: moduleName() } }}
          } @else if (kind(); as k) {
            {{ 'outputs.library.ofKind' | transloco: { kind: ('outputs.kinds.' + k | transloco) } }}
          }
          <button
            type="button"
            class="font-semibold text-accent hover:underline"
            (click)="clearScope()"
            data-testid="library-scope-clear"
          >
            {{ 'outputs.library.showAll' | transloco }}
          </button>
        </p>
      }

      <app-outputs-panel
        [grouped]="true"
        [module]="module() ?? null"
        [standardKey]="standard() ?? null"
        [kind]="kind() ?? null"
        [excludeKinds]="hidesRegisterExports() ? registerExportKind : []"
        [query]="search()"
        [standards]="standards()"
      />

      @if (hidesRegisterExports()) {
        <p class="mt-4 text-ui" data-testid="library-register-exports">
          <a
            routerLink="."
            [queryParams]="{ kind: 'register_export' }"
            queryParamsHandling="merge"
            [class]="textLink"
          >
            {{ 'outputs.library.registerExports' | transloco }}
          </a>
        </p>
      }

      @if (recent().length > 0) {
        <section class="mt-8" data-testid="library-recent">
          <div class="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-display text-section font-bold text-fg">
              {{ 'outputs.library.recent' | transloco }}
            </h2>
            <a routerLink="/library/saved" [class]="textLink" class="text-ui">
              {{ 'outputs.library.seeAll' | transloco: { count: recentTotal() } }}
            </a>
          </div>
          <ul class="divide-y divide-border rounded-card border border-border bg-surface">
            @for (file of recent(); track file.id) {
              <li><app-generated-row [file]="file" /></li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class LibraryOutputs {
  private readonly api = inject(OutputsApi);
  private readonly standardsApi = inject(StandardsApi);
  private readonly language = inject(LanguageService);
  private readonly modules = inject(ModuleService);
  private readonly router = inject(Router);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Query params (component input binding). */
  readonly module = input<string | undefined>();
  readonly standard = input<string | undefined>();
  readonly kind = input<string | undefined>();

  protected readonly search = signal('');
  protected readonly standards = signal<readonly StandardChoice[]>([]);
  protected readonly recent = signal<readonly GeneratedOutput[]>([]);
  protected readonly recentTotal = signal(0);
  protected readonly secondaryLink = SECONDARY_LINK;
  protected readonly textLink = TEXT_LINK;
  protected readonly registerExportKind: readonly string[] = ['register_export'];

  /**
   * Unnarrowed, "Hent ut" lists the named documents only: one table export per
   * register would bury them (about 30 near-identical cards). Register exports show
   * once the user searches, comes from a module or picks them (the link below).
   */
  protected readonly hidesRegisterExports = computed(
    () => !this.module() && !this.kind() && !this.search().trim(),
  );

  protected readonly moduleName = computed(() => {
    const key = this.module();
    return key ? this.language.translate(`modules.names.${key}`) : '';
  });

  protected readonly canExportRegisters = computed(() => {
    const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
    return this.modules.enabledKeys().has('reports') && granted.includes('reports:read');
  });

  /** Styrende dokumenter: the controlled-document register. */
  protected readonly canOpenDocuments = computed(() => {
    const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
    return this.modules.enabledKeys().has('documents') && granted.includes('documents:read');
  });

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
      if (!orgId) {
        return;
      }
      this.loadRecent(orgId);
      if (granted.includes('standards:read')) {
        this.standardsApi.listFrameworks(orgId).subscribe({
          next: (items) =>
            this.standards.set(
              items.filter((i) => i.enabled).map((i) => ({ key: i.standard_key, name: i.name })),
            ),
          error: () => this.standards.set([]),
        });
      } else {
        this.standards.set([]);
      }
    });
  }

  private loadRecent(orgId: string): void {
    this.api.generated(orgId, { limit: RECENT }).subscribe({
      next: (list) => {
        this.recent.set(list.items);
        this.recentTotal.set(list.total);
      },
      // The archive tab shows its own error; the catalogue stays usable.
      error: () => this.recent.set([]),
    });
  }

  protected asValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected setParam(name: string, value: string): void {
    void this.router.navigate([], {
      queryParams: { [name]: value || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearScope(): void {
    void this.router.navigate([], {
      queryParams: { module: null, kind: null },
      queryParamsHandling: 'merge',
    });
  }
}
