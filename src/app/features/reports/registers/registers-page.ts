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
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ColumnPicker } from '../components/column-picker';
import { RegisterFilters, supportedFilters } from '../components/register-filters';
import { ReportsLessonButton } from '../components/reports-lesson-button';
import { blobErrorKey, fileStem, reportErrorKey, saveBlob } from '../data/report-errors';
import { cellText, labelOr, localized, moduleLabelKey } from '../data/report-display';
import {
  EXPORT_FORMATS,
  ExportFormat,
  REPORTS_MODULE,
  REPORTS_PERMISSIONS,
  REPORT_LANGS,
  Register,
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
 * `/reports/registers`: pick a register (tasks, deviations, CAPA actions, the
 * master document list, the Statement of Applicability, the evidence index,
 * readiness — plus any a module registers), filter it, choose columns, preview
 * the first rows and export it as CSV, XLSX or PDF. "Save as report" carries
 * the choices to a new saved report. The register is kept in `?register=`.
 */
@Component({
  selector: 'app-registers-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    Button,
    Card,
    ColumnPicker,
    RegisterFilters,
    ReportsLessonButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'reports.registers.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">
            {{ 'reports.registers.subtitle' | transloco }}
          </p>
        </div>
        <app-reports-lesson-button lesson="exporting-registers" />
      </header>

      <app-guide-intro class="mb-4 block" scope="reports" page="registers" />

      @if (loadError(); as key) {
        <app-card>
          <p class="py-6 text-center text-[13.5px] text-fg-muted" role="alert">
            {{ key | transloco }}
          </p>
        </app-card>
      } @else if (!loaded()) {
        <p class="py-10 text-center text-[13.5px] text-fg-muted" role="status">
          {{ 'reports.common.loading' | transloco }}
        </p>
      } @else if (registers().length === 0) {
        <app-card>
          <app-teaching-empty scope="reports" page="registers" [showAction]="false" />
        </app-card>
      } @else {
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
          <nav
            class="lg:w-[250px] lg:flex-none"
            [attr.aria-label]="'reports.registers.pick' | transloco"
          >
            <label for="reg-select" class="sr-only">{{
              'reports.registers.pick' | transloco
            }}</label>
            <select
              id="reg-select"
              class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg lg:hidden"
              (change)="pick($any($event.target).value)"
            >
              @for (reg of registers(); track reg.key) {
                <option [value]="reg.key" [selected]="reg.key === active()?.key">
                  {{ name(reg) }}
                </option>
              }
            </select>
            <ul class="hidden flex-col gap-1 lg:flex">
              @for (reg of registers(); track reg.key) {
                <li>
                  <button
                    type="button"
                    class="w-full rounded-[10px] px-3 py-2 text-left text-[13px]"
                    [class]="
                      reg.key === active()?.key
                        ? 'bg-accent-soft font-semibold text-accent'
                        : 'text-fg hover:bg-surface-2'
                    "
                    [attr.aria-current]="reg.key === active()?.key ? 'true' : null"
                    (click)="pick(reg.key)"
                  >
                    {{ name(reg) }}
                    <span class="block text-[11.5px] font-normal text-fg-subtle">{{
                      moduleName(reg.module)
                    }}</span>
                  </button>
                </li>
              }
            </ul>
          </nav>

          @if (active(); as reg) {
            <div class="min-w-0 flex-1">
              <app-card class="mb-4 block">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="text-[15px] font-semibold text-fg">{{ name(reg) }}</h2>
                  <div class="flex items-center gap-2">
                    <label for="reg-lang" class="text-[12.5px] font-semibold text-fg-muted">
                      {{ 'reports.registers.language' | transloco }}
                    </label>
                    <select
                      id="reg-lang"
                      class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
                  <span class="text-[12.5px] font-semibold text-fg-muted">{{
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
                      class="ml-auto text-[13px] font-semibold text-accent hover:underline"
                      routerLink="/reports/definitions/new"
                      [queryParams]="saveParams()"
                    >
                      {{ 'reports.registers.saveAsReport' | transloco }}
                    </a>
                  }
                </div>
              </app-card>

              <app-card [padded]="false">
                @switch (preview().status) {
                  @case ('loading') {
                    <p class="p-6 text-center text-[13px] text-fg-muted" role="status">
                      {{ 'reports.common.loading' | transloco }}
                    </p>
                  }
                  @case ('needsStandard') {
                    <p class="p-6 text-center text-[13px] text-fg-muted">
                      {{ 'reports.registers.needsStandard' | transloco }}
                    </p>
                  }
                  @case ('error') {
                    <p class="p-6 text-center text-[13px] text-fg-muted" role="alert">
                      {{ previewError() | transloco }}
                    </p>
                  }
                  @case ('ready') {
                    @if (previewData(); as data) {
                      <div
                        class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5"
                      >
                        <p class="text-[12.5px] text-fg-muted" aria-live="polite">
                          {{
                            'reports.registers.previewCount'
                              | transloco: { shown: data.rows.length, total: data.total }
                          }}
                        </p>
                        <app-ask-about
                          [prompt]="
                            'reports.registers.askAbout' | transloco: { register: name(reg) }
                          "
                        />
                      </div>
                      @if (data.rows.length === 0) {
                        <p class="p-6 text-center text-[13px] text-fg-muted">
                          {{ 'reports.registers.noRows' | transloco }}
                        </p>
                      } @else {
                        <div class="overflow-x-auto">
                          <table class="w-full text-left text-[12.5px]">
                            <caption class="sr-only">
                              {{
                                name(reg)
                              }}
                            </caption>
                            <thead
                              class="bg-surface-2 text-[11.5px] tracking-[0.04em] text-fg-subtle uppercase"
                            >
                              <tr>
                                @for (col of shownColumns(); track col.key) {
                                  <th scope="col" class="px-3 py-2 font-semibold whitespace-nowrap">
                                    {{ colLabel(col.label, col.key) }}
                                  </th>
                                }
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-border">
                              @for (row of data.rows; track $index) {
                                <tr class="hover:bg-surface-2/60">
                                  @for (col of shownColumns(); track col.key; let first = $first) {
                                    <td class="max-w-[320px] truncate px-3 py-1.5 text-fg">
                                      @if (first && rowLink(row); as target) {
                                        <a
                                          [routerLink]="target.path"
                                          [queryParams]="target.queryParams"
                                          class="hover:text-accent hover:underline"
                                        >
                                          {{ cell(row[col.key]) }}
                                        </a>
                                      } @else {
                                        {{ cell(row[col.key]) }}
                                      }
                                    </td>
                                  }
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                        @if (data.truncated || data.total > data.rows.length) {
                          <p class="border-t border-border px-4 py-2 text-[12px] text-fg-subtle">
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

  protected readonly active = computed<Register | null>(() => {
    const list = this.registers();
    return list.find((r) => r.key === this.register()) ?? list[0] ?? null;
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
    return p.status === 'error' ? p.messageKey : '';
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
    providePageContext(() => ({
      module: REPORTS_MODULE,
      entityType: null,
      view: 'list',
      title: this.active() ? this.name(this.active()!) : null,
    }));
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

  protected colLabel(label: Readonly<Partial<Record<string, string>>>, key: string): string {
    return localized(label, this.lang(), key);
  }

  protected moduleName(module: string): string {
    return labelOr((k) => this.language.translate(k), moduleLabelKey(module), module);
  }

  protected cell(value: unknown): string {
    return cellText(value, this.language.active());
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
          saveBlob(blob, `${fileStem(this.name(reg), reg.key)}.${format}`);
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
