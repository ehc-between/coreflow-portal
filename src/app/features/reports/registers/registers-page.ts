import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { internalLink } from '../../../core/search/internal-link';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ReportsAsk } from '../components/ask-button';
import { ColumnPicker } from '../components/column-picker';
import { RegisterFilters, supportedFilters } from '../components/register-filters';
import { LibraryNav } from '../../../shared/outputs/library-nav';
import { blobErrorKey, fileStem, reportErrorKey, saveBlob } from '../data/report-errors';
import {
  clauseText,
  columnCell,
  groupRegisters,
  labelOr,
  localized,
  moduleLabelKey,
} from '../data/report-display';
import {
  EXPORT_FORMATS,
  ExportFormat,
  REPORTS_MODULE,
  REPORTS_PERMISSIONS,
  REPORT_LANGS,
  Register,
  RegisterColumn,
  RegisterPreview,
  ReportFilters,
  ReportLang,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';

const PREVIEW_LIMIT = 50;

type Preview =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'needsStandard' }
  | { readonly status: 'error'; readonly messageKey: string }
  | { readonly status: 'ready'; readonly value: RegisterPreview };

/**
 * `/library/registers`: pick a register — the platform's own (tasks, deviations,
 * corrective actions, documents, the Statement of Applicability, the evidence index,
 * requirement coverage) and every module's (risks, legal requirements, objectives,
 * training, suppliers, assets, audits, management reviews, processing records, AI
 * systems, …) — filter it, choose columns, preview it in plain words and export it
 * as CSV, Excel or PDF. Each register says which requirements it is evidence for.
 * "Lagre som rapport" carries the choices to a new saved report. The register is
 * kept in `?register=`.
 */
@Component({
  selector: 'app-registers-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    TeachingEmpty,
    WhyItMatters,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    ReportsAsk,
    ColumnPicker,
    RegisterFilters,
    LibraryNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="reports.registers.title"
        descriptionKey="reports.registers.subtitle"
        [breadcrumbs]="[
          { labelKey: 'outputs.title', link: '/library' },
          { labelKey: 'reports.nav.registers' },
        ]"
      />
      <app-library-nav />
      <app-help-strip scope="reports" page="registers" lesson="exporting-registers" />

      @if (loadError(); as key) {
        <app-error-state [bodyKey]="key" (retry)="reloadRegisters()" />
      } @else if (!loaded()) {
        <app-loading-state [rows]="5" />
      } @else if (registers().length === 0) {
        <app-card>
          <app-teaching-empty scope="reports" page="registers" [showAction]="false" />
        </app-card>
      } @else {
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
          <nav
            class="lg:w-[260px] lg:flex-none"
            [attr.aria-label]="'reports.registers.pick' | transloco"
          >
            <label
              for="reg-select"
              class="mb-1 block text-ui font-semibold text-fg-muted lg:sr-only"
              >{{ 'reports.registers.pick' | transloco }}</label
            >
            <select
              id="reg-select"
              class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg lg:hidden"
              (change)="pick($any($event.target).value)"
            >
              @for (group of groups(); track group.module) {
                <optgroup [label]="group.name">
                  @for (reg of group.registers; track reg.key) {
                    <option [value]="reg.key" [selected]="reg.key === active()?.key">
                      {{ name(reg) }}
                    </option>
                  }
                </optgroup>
              }
            </select>
            <div class="hidden flex-col gap-3 lg:flex" data-testid="register-list">
              @for (group of groups(); track group.module) {
                <div>
                  <p class="mb-1 px-3 text-meta font-semibold text-fg-subtle">{{ group.name }}</p>
                  <ul class="flex flex-col gap-0.5">
                    @for (reg of group.registers; track reg.key) {
                      <li>
                        <button
                          type="button"
                          class="w-full rounded-tile px-3 py-1.5 text-left text-ui"
                          [class]="
                            reg.key === active()?.key
                              ? 'bg-accent-soft font-semibold text-accent'
                              : 'text-fg hover:bg-surface-2'
                          "
                          [attr.aria-current]="reg.key === active()?.key ? 'true' : null"
                          (click)="pick(reg.key)"
                        >
                          {{ name(reg) }}
                        </button>
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          </nav>

          @if (active(); as reg) {
            <div class="min-w-0 flex-1">
              <app-card class="mb-4 block">
                <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h2 class="text-section font-semibold text-fg">{{ name(reg) }}</h2>
                    <p class="text-meta text-fg-muted">{{ moduleName(reg.module) }}</p>
                    @if (clauses().length) {
                      <p class="mt-1 text-meta text-fg-muted" data-testid="register-clauses">
                        {{ 'reports.registers.evidenceFor' | transloco }}
                        <span class="text-fg">{{ clauses().join(', ') }}</span>
                      </p>
                    }
                  </div>
                  <div class="w-full sm:w-auto">
                    <label for="reg-lang" class="mb-1 block text-meta font-semibold text-fg-muted">
                      {{ 'reports.registers.language' | transloco }}
                    </label>
                    <select
                      id="reg-lang"
                      class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg sm:w-auto"
                      (change)="lang.set($any($event.target).value)"
                    >
                      @for (l of langs; track l) {
                        <option [value]="l" [selected]="l === lang()">
                          {{ 'reports.langs.' + l | transloco }}
                        </option>
                      }
                    </select>
                  </div>
                </div>
                <app-register-filters
                  [register]="reg"
                  [value]="filters()"
                  (valueChange)="filters.set($event)"
                />
                <app-column-picker
                  class="mt-3"
                  [columns]="reg.columns"
                  [selected]="columns()"
                  (selectedChange)="columns.set($event)"
                />
                <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <span class="text-ui font-semibold text-fg-muted">{{
                    'reports.registers.export' | transloco
                  }}</span>
                  @for (format of formats(); track format) {
                    <app-button
                      variant="secondary"
                      size="sm"
                      [loading]="exporting() === format"
                      [disabled]="!!exporting() || preview().status === 'needsStandard'"
                      (click)="export(format)"
                    >
                      {{ 'reports.formats.' + format | transloco }}
                    </app-button>
                  }
                  @if (canWrite()) {
                    <a
                      class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      routerLink="/library/reports/new"
                      [queryParams]="saveParams()"
                      data-testid="save-as-report"
                    >
                      <app-icon name="history" [size]="14" />
                      {{ 'reports.registers.saveAsReport' | transloco }}
                    </a>
                  }
                </div>
              </app-card>

              <app-card [padded]="false">
                @switch (preview().status) {
                  @case ('loading') {
                    <div class="p-4"><app-loading-state [rows]="4" /></div>
                  }
                  @case ('needsStandard') {
                    <p class="p-6 text-center text-ui text-fg-muted">
                      {{ 'reports.registers.needsStandard' | transloco }}
                    </p>
                  }
                  @case ('error') {
                    <div class="p-4">
                      <app-error-state [bodyKey]="previewError()" (retry)="reloadPreview()" />
                    </div>
                  }
                  @case ('ready') {
                    @if (previewData(); as data) {
                      <div
                        class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2"
                      >
                        <p
                          class="text-meta text-fg-muted"
                          aria-live="polite"
                          data-testid="preview-count"
                        >
                          {{
                            (data.total > data.rows.length
                              ? 'reports.registers.previewCount'
                              : 'reports.registers.previewAll'
                            ) | transloco: { shown: data.rows.length, total: data.total }
                          }}
                        </p>
                        <app-reports-ask
                          [prompt]="
                            'reports.registers.askAbout' | transloco: { register: name(reg) }
                          "
                          [field]="name(reg)"
                        />
                      </div>
                      @if (data.rows.length === 0) {
                        <p class="p-6 text-center text-ui text-fg-muted">
                          {{ 'reports.registers.noRows' | transloco }}
                        </p>
                      } @else {
                        @if (shownColumns().length > 3) {
                          <p class="px-4 pt-2 text-meta text-fg-subtle md:hidden">
                            {{ 'reports.registers.scrollHint' | transloco }}
                          </p>
                        }
                        <div class="overflow-x-auto">
                          <table class="w-full text-left text-meta" data-testid="preview-table">
                            <caption class="sr-only">
                              {{
                                name(reg)
                              }}
                            </caption>
                            <thead class="bg-surface-2 text-meta text-fg-muted">
                              <tr>
                                @for (col of shownColumns(); track col.key) {
                                  <th scope="col" class="px-3 py-2 font-semibold whitespace-nowrap">
                                    {{ colLabel(col) }}
                                  </th>
                                }
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-border">
                              @for (row of data.rows; track $index; let i = $index) {
                                <tr class="hover:bg-surface-2/60">
                                  @for (col of shownColumns(); track col.key; let first = $first) {
                                    <td
                                      class="max-w-[320px] truncate px-3 py-1.5 text-fg"
                                      [title]="cell(col, row, i)"
                                    >
                                      @if (first && rowLink(row); as target) {
                                        <a
                                          [routerLink]="target.path"
                                          [queryParams]="target.queryParams"
                                          class="font-semibold text-accent hover:underline"
                                        >
                                          {{ cell(col, row, i) }}
                                        </a>
                                      } @else {
                                        {{ cell(col, row, i) }}
                                      }
                                    </td>
                                  }
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                        @if (data.truncated || data.total > data.rows.length) {
                          <p class="border-t border-border px-4 py-2 text-meta text-fg-subtle">
                            {{ 'reports.registers.previewTruncated' | transloco }}
                          </p>
                        }
                      }
                    }
                  }
                }
              </app-card>
            </div>
          }
        </div>
      }

      <app-why-it-matters class="mt-6 block" scope="reports" page="registers" />
    </div>
  `,
})
export class RegistersPage {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  /** `?register=` (component input binding). */
  readonly register = input<string | undefined>(undefined);

  protected readonly langs = REPORT_LANGS;

  protected readonly registers = signal<readonly Register[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly preview = signal<Preview>({ status: 'idle' });
  protected readonly exporting = signal<ExportFormat | null>(null);

  protected readonly groups = computed(() =>
    groupRegisters(this.registers(), (m) => this.moduleName(m)),
  );

  protected readonly active = computed<Register | null>(() => {
    const list = this.registers();
    return list.find((r) => r.key === this.register()) ?? list[0] ?? null;
  });

  /** "Felles ISO-krav · 7.5" for each clause the register is evidence for. */
  protected readonly clauses = computed(() => {
    const lang = this.language.active();
    return (this.active()?.clauses ?? []).map((c) => clauseText(c, lang));
  });

  /** Filters and columns reset whenever the register changes. */
  protected readonly filters = linkedSignal<Register | null, ReportFilters>({
    source: this.active,
    computation: () => ({}),
  });
  protected readonly columns = linkedSignal<Register | null, string[]>({
    source: this.active,
    computation: () => [],
  });
  protected readonly lang = signal<ReportLang>(
    (REPORT_LANGS as readonly string[]).includes(this.language.active())
      ? (this.language.active() as ReportLang)
      : 'en',
  );

  protected readonly formats = computed(() => {
    const allowed = this.active()?.formats ?? EXPORT_FORMATS;
    return EXPORT_FORMATS.filter((f) => allowed.includes(f));
  });

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(REPORTS_PERMISSIONS.write),
  );

  private readonly effectiveFilters = computed(() =>
    supportedFilters(this.active(), this.filters()),
  );

  protected readonly previewData = computed(() => {
    const p = this.preview();
    return p.status === 'ready' ? p.value : null;
  });
  protected readonly previewError = computed(() => {
    const p = this.preview();
    return p.status === 'error' ? p.messageKey : 'ui.error.body';
  });

  protected readonly shownColumns = computed(() => {
    const all = this.previewData()?.columns ?? this.active()?.columns ?? [];
    const chosen = this.columns();
    return chosen.length ? all.filter((c) => chosen.includes(c.key)) : all;
  });

  protected readonly saveParams = computed(() => {
    const f = this.effectiveFilters();
    return {
      register: this.active()?.key ?? null,
      q: f.q || null,
      status: f.status?.length ? f.status.join(',') : null,
      from: f.from || null,
      to: f.to || null,
      standard_key: f.standard_key || null,
      columns: this.columns().length ? this.columns().join(',') : null,
      lang: this.lang(),
    };
  });

  private listSub = new Subscription();
  private previewSub = new Subscription();

  constructor() {
    providePageContext(() => {
      const reg = this.active();
      return {
        module: REPORTS_MODULE,
        entityType: null,
        view: 'list',
        title: reg
          ? this.language.translate('reports.registers.contextTitle', { register: this.name(reg) })
          : this.language.translate('reports.registers.title'),
        requirements: reg?.clauses?.map((c) => c.ref) ?? null,
      };
    });
    inject(DestroyRef).onDestroy(() => {
      this.listSub.unsubscribe();
      this.previewSub.unsubscribe();
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadRegisters(orgId));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const reg = this.active();
      const filters = this.effectiveFilters();
      const lang = this.lang();
      untracked(() => this.loadPreview(orgId, reg, filters, lang));
    });
  }

  protected name(reg: Register): string {
    return localized(reg.label, this.language.active(), reg.key);
  }

  protected colLabel(col: RegisterColumn): string {
    return localized(col.label, this.lang(), col.key);
  }

  protected moduleName(module: string): string {
    return labelOr((k) => this.language.translate(k), moduleLabelKey(module), module);
  }

  /** The cell as the export shows it (the backend's display text, else value words). */
  protected cell(
    col: RegisterColumn,
    row: Readonly<Record<string, unknown>>,
    index: number,
  ): string {
    const display = this.previewData()?.display?.[index]?.[col.key];
    return columnCell(col, row[col.key], display, this.lang());
  }

  protected rowLink(row: Readonly<Record<string, unknown>>) {
    const url = row['url'];
    return typeof url === 'string' ? internalLink(url) : null;
  }

  protected pick(key: string): void {
    void this.router.navigate([], {
      queryParams: { register: key },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected reloadRegisters(): void {
    this.loadRegisters(this.selectedOrg.currentOrgId());
  }

  protected reloadPreview(): void {
    this.loadPreview(
      this.selectedOrg.currentOrgId(),
      this.active(),
      this.effectiveFilters(),
      this.lang(),
    );
  }

  protected export(format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    const reg = this.active();
    if (!orgId || !reg || this.exporting()) {
      return;
    }
    this.exporting.set(format);
    this.api
      .exportRegister(orgId, reg.key, {
        ...this.effectiveFilters(),
        format,
        columns: this.columns(),
        lang: this.lang(),
      })
      .subscribe({
        next: (blob) => {
          this.exporting.set(null);
          const label = localized(reg.label, this.lang(), reg.key);
          saveBlob(blob, `${fileStem(label, reg.key)}.${format}`);
          this.notifications.success('reports.registers.exported');
        },
        error: (error: unknown) => {
          this.exporting.set(null);
          void blobErrorKey(error).then((key) => this.notifications.error(key));
        },
      });
  }

  private loadRegisters(orgId: string | null): void {
    this.listSub.unsubscribe();
    this.listSub = new Subscription();
    this.loaded.set(false);
    this.loadError.set(null);
    if (!orgId) {
      return;
    }
    this.listSub.add(
      this.api.registers(orgId).subscribe({
        next: (list) => {
          this.registers.set(list.items);
          this.loaded.set(true);
        },
        error: (error: unknown) => {
          this.loadError.set(reportErrorKey(error));
          this.loaded.set(true);
        },
      }),
    );
  }

  private loadPreview(
    orgId: string | null,
    reg: Register | null,
    filters: ReportFilters,
    lang: ReportLang,
  ): void {
    this.previewSub.unsubscribe();
    this.previewSub = new Subscription();
    if (!orgId || !reg) {
      this.preview.set({ status: 'idle' });
      return;
    }
    if (reg.requires_standard && !filters.standard_key) {
      this.preview.set({ status: 'needsStandard' });
      return;
    }
    this.preview.set({ status: 'loading' });
    this.previewSub.add(
      this.api
        .previewRegister(orgId, reg.key, { ...filters, lang, limit: PREVIEW_LIMIT })
        .subscribe({
          next: (value) => this.preview.set({ status: 'ready', value }),
          error: (error: unknown) =>
            this.preview.set({ status: 'error', messageKey: reportErrorKey(error) }),
        }),
    );
  }
}
