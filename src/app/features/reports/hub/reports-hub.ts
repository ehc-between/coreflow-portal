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
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OutputsApi } from '../../../core/outputs/outputs-api';
import { GeneratedOutput, Output } from '../../../core/outputs/outputs.models';
import { internalLink } from '../../../core/search/internal-link';
import { StandardsApi } from '../../../core/standards/standards-api';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { GenerateDialog, StandardChoice } from '../../../shared/outputs/generate-dialog';
import { localized, saveFile } from '../../../shared/outputs/output-display';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import { SECONDARY_LINK, TEXT_LINK } from '../../../shared/requirement-locations/location-links';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { frameworkLabelKey } from '../data/report-display';
import { ReportsApi } from '../data/reports-api';
import { AuditPack, REPORTS_MODULE, REPORTS_PERMISSIONS } from '../data/reports.models';
import {
  GROUP_PREVIEW,
  Recipient,
  ReportGroup,
  ReportRow,
  StandardOutputs,
  buildRows,
  groupRows,
  isRecipient,
  shortStandardLabel,
} from './report-groups';

interface HubData {
  readonly catalogue: readonly Output[];
  readonly standards: readonly StandardOutputs[];
  readonly choices: readonly StandardChoice[];
  readonly files: readonly GeneratedOutput[];
  readonly pack: AuditPack | null;
}

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly data: HubData };

interface FooterLink {
  readonly key: string;
  readonly link: string;
}

/** Current generated files read for the per-record rows. */
const FILES_LIMIT = 100;

/**
 * Rapporter (`/reports`, IA v2 §5.9, prototype "rapporter"): what to deliver, and to
 * whom. Four recipient cards (Til revisor, Til Datatilsynet, Til styret, Til kunder og
 * ansatte) list every output the caller can make from `GET outputs`, each with its
 * status ("Klar", "Mangler N", "Utkast") and one button: "Last ned" (the existing
 * make-and-download dialog, or the stored file) or "Se hva som mangler" (the same
 * dialog, which lists each gap with a link to where it is filled in). `?to=` shows one
 * group. "Standarder (ekspertvisning)" opens the standards workspace; the links row
 * leads to the Reports module pages. Open to every member: each output is gated by its
 * own module and permission in the backend.
 */
@Component({
  selector: 'app-reports-hub',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    ErrorState,
    GenerateDialog,
    LoadingState,
    LocalDatePipe,
  ],
  viewProviders: [provideSharedScope('reports', 'outputs')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7" data-testid="reports-hub">
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 flex-1 basis-[min(100%,420px)]">
          @if (recipient(); as r) {
            <a
              routerLink="/reports"
              [class]="textLink"
              class="text-meta"
              data-testid="reports-hub-all"
            >
              {{ 'reports.hub.allRecipients' | transloco }}
            </a>
          }
          <h1 class="mt-1 font-display text-page font-bold text-fg" data-testid="page-title">
            {{ 'reports.hub.title' | transloco }}
          </h1>
          <p class="mt-1.5 max-w-[62ch] text-body text-fg-muted">
            {{ 'reports.hub.intro' | transloco }}
          </p>
        </div>
        @if (canStandards()) {
          <a
            routerLink="/standards"
            [class]="secondaryLink"
            class="mt-1 h-9"
            data-testid="reports-hub-standards"
          >
            {{ 'reports.hub.standards' | transloco }}
          </a>
        }
      </div>

      @switch (state().status) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state bodyKey="reports.hub.error" (retry)="reload()" />
        }
        @case ('loaded') {
          <div
            class="grid grid-cols-1 gap-[18px]"
            [class.min-[860px]:grid-cols-2]="!recipient()"
            data-testid="reports-hub-groups"
          >
            @for (group of shownGroups(); track group.recipient) {
              <section
                class="min-w-0 rounded-card border border-border bg-surface p-5"
                [id]="'to-' + group.recipient"
                [attr.data-testid]="'reports-group-' + group.recipient"
              >
                <div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 class="font-display text-section font-bold text-fg">
                    {{ 'reports.hub.groups.' + group.recipient + '.title' | transloco }}
                  </h2>
                  <span class="text-meta text-fg-muted">
                    {{ 'reports.hub.groups.' + group.recipient + '.hint' | transloco }}
                  </span>
                </div>
                @for (row of visibleRows(group); track row.id; let first = $first) {
                  <div
                    class="grid grid-cols-[minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                    [class.border-t]="!first"
                    [class.border-border]="!first"
                    [attr.data-testid]="'report-row-' + row.id"
                  >
                    <div class="min-w-0">
                      <p class="text-ui font-bold text-fg [overflow-wrap:anywhere]">
                        {{ rowTitle(row) }}
                        @if (row.standardLabelKey; as k) {
                          <span class="font-semibold text-fg-muted">
                            · {{ short(k | transloco) }}
                          </span>
                        }
                      </p>
                      <p class="line-clamp-2 text-meta text-fg-muted">
                        @if (row.file; as f) {
                          {{
                            'reports.hub.meta.made'
                              | transloco: { date: (f.generated_at | localDate: 'mediumDate') }
                          }}
                        } @else {
                          {{ description(row) }}
                          @if (row.standardCount > 1) {
                            ·
                            {{
                              'reports.hub.meta.standards' | transloco: { count: row.standardCount }
                            }}
                          }
                          @if (row.output.kind === 'pack' && pack(); as p) {
                            ·
                            {{
                              'reports.hub.meta.lastMade'
                                | transloco: { date: (p.generated_at | localDate: 'mediumDate') }
                            }}
                          } @else if (row.output.last; as last) {
                            ·
                            {{
                              'reports.hub.meta.lastMade'
                                | transloco: { date: (last.generated_at | localDate: 'mediumDate') }
                            }}
                          }
                        }
                      </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                      @let status = rowStatus(row);
                      <app-badge [tone]="status.tone" data-testid="report-status">
                        {{
                          'reports.hub.status.' + status.key
                            | transloco: { count: status.count ?? 0 }
                        }}
                      </app-badge>
                      @switch (row.action) {
                        @case ('flow') {
                          @if (flowLink(row); as l) {
                            <a
                              [routerLink]="l.path"
                              [queryParams]="l.queryParams"
                              [class]="secondaryLink"
                              data-testid="report-open"
                            >
                              {{ 'reports.hub.actions.open' | transloco }}
                            </a>
                          }
                        }
                        @case ('file') {
                          <app-button
                            variant="secondary"
                            size="sm"
                            [loading]="downloading() === row.id"
                            (click)="downloadFile(row)"
                            data-testid="report-download"
                          >
                            {{ 'reports.hub.actions.download' | transloco }}
                          </app-button>
                        }
                        @case ('missing') {
                          <app-button
                            variant="secondary"
                            size="sm"
                            (click)="openDialog(row)"
                            data-testid="report-missing"
                          >
                            {{ 'reports.hub.actions.missing' | transloco }}
                          </app-button>
                        }
                        @default {
                          <app-button
                            variant="secondary"
                            size="sm"
                            (click)="openDialog(row)"
                            data-testid="report-download"
                          >
                            {{ 'reports.hub.actions.download' | transloco }}
                          </app-button>
                        }
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="py-3 text-meta text-fg-muted" data-testid="reports-group-empty">
                    {{ 'reports.hub.empty' | transloco }}
                  </p>
                }
                @if (hiddenCount(group) > 0) {
                  <button
                    type="button"
                    class="mt-1 text-ui"
                    [class]="textLink"
                    (click)="expand(group.recipient)"
                    data-testid="reports-group-more"
                  >
                    {{ 'reports.hub.showAll' | transloco: { count: group.rows.length } }}
                  </button>
                }
              </section>
            }
          </div>

          @if (downloadError()) {
            <p class="mt-3 text-meta text-fail" role="alert">
              {{ 'reports.hub.downloadError' | transloco }}
            </p>
          }

          <p class="mt-4 text-meta text-fg-muted">{{ 'reports.hub.recordHint' | transloco }}</p>
        }
      }

      <nav
        class="mt-8 border-t border-border pt-5"
        [attr.aria-label]="'reports.hub.more' | transloco"
        data-testid="reports-hub-links"
      >
        <h2 class="mb-2.5 text-ui font-semibold text-fg-muted">
          {{ 'reports.hub.more' | transloco }}
        </h2>
        <ul class="flex flex-wrap gap-x-5 gap-y-2">
          @for (l of footerLinks(); track l.key) {
            <li>
              <a
                [routerLink]="l.link"
                [class]="textLink"
                class="text-ui"
                [attr.data-testid]="'reports-link-' + l.key"
              >
                {{ 'reports.hub.links.' + l.key | transloco }}
              </a>
            </li>
          }
        </ul>
      </nav>
    </div>

    @if (dialogRow(); as row) {
      <app-generate-dialog
        [open]="true"
        [output]="row.output"
        [standardKey]="row.standardKey"
        [standards]="choices()"
        (closed)="dialogRow.set(null)"
        (generated)="reload()"
      />
    }
  `,
})
export class ReportsHub {
  private readonly outputs = inject(OutputsApi);
  private readonly standardsApi = inject(StandardsApi);
  private readonly reports = inject(ReportsApi);
  private readonly language = inject(LanguageService);
  private readonly modules = inject(ModuleService);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** `?to=auditor|authority|board|people`: show one recipient group. */
  readonly to = input<string | undefined>();

  protected readonly secondaryLink = SECONDARY_LINK;
  protected readonly textLink = TEXT_LINK;
  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly dialogRow = signal<ReportRow | null>(null);
  protected readonly downloading = signal<string | null>(null);
  protected readonly downloadError = signal(false);
  private readonly expanded = signal<ReadonlySet<Recipient>>(new Set());
  private readonly reloads = signal(0);
  private sub: Subscription | null = null;

  private readonly granted = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  private readonly can = (permission: string) => this.granted().includes(permission);
  /** The Reports module pages below the hub (status, archive, exports…). */
  private readonly reportsOpen = computed(
    () => this.modules.isEnabled(REPORTS_MODULE) && this.can(REPORTS_PERMISSIONS.read),
  );

  protected readonly recipient = computed<Recipient | null>(() => {
    const to = this.to();
    return isRecipient(to) ? to : null;
  });

  protected readonly canStandards = computed(
    () => this.modules.isEnabled('standards') && this.can('standards:read'),
  );

  private readonly data = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.data : null;
  });
  protected readonly pack = computed(() => this.data()?.pack ?? null);
  protected readonly choices = computed(() => this.data()?.choices ?? []);

  private readonly groups = computed<ReportGroup[]>(() => {
    const data = this.data();
    return data ? groupRows(buildRows(data.catalogue, data.standards, data.files)) : [];
  });

  protected readonly shownGroups = computed(() => {
    const only = this.recipient();
    return only ? this.groups().filter((g) => g.recipient === only) : this.groups();
  });

  protected readonly footerLinks = computed<FooterLink[]>(() => {
    const open = this.reportsOpen();
    const links: FooterLink[] = [];
    if (open) {
      links.push({ key: 'status', link: '/reports/status' });
      links.push({ key: 'custom', link: '/reports/custom' });
    }
    links.push({ key: 'archive', link: open ? '/reports/saved' : '/library/saved' });
    if (open) {
      links.push({ key: 'exports', link: '/reports/exports' });
    }
    links.push({ key: 'all', link: open ? '/reports/all' : '/library' });
    links.push({ key: 'registers', link: '/registers' });
    if (this.can('org:manage')) {
      links.push({ key: 'branding', link: '/settings/branding' });
    }
    return links;
  });

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const lang = this.language.active();
      const withStandards = this.canStandards();
      const withPacks =
        this.modules.isEnabled(REPORTS_MODULE) && this.can(REPORTS_PERMISSIONS.auditPack);
      this.reloads();
      if (!orgId) {
        return;
      }
      untracked(() => this.load(orgId, lang, withStandards, withPacks));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  protected visibleRows(group: ReportGroup): readonly ReportRow[] {
    return this.recipient() || this.expanded().has(group.recipient)
      ? group.rows
      : group.rows.slice(0, GROUP_PREVIEW);
  }

  protected hiddenCount(group: ReportGroup): number {
    return group.rows.length - this.visibleRows(group).length;
  }

  protected expand(recipient: Recipient): void {
    this.expanded.update((set) => new Set([...set, recipient]));
  }

  protected rowTitle(row: ReportRow): string {
    return row.file ? row.file.title : localized(row.output.title, this.language.active());
  }

  protected description(row: ReportRow): string {
    return localized(row.output.description, this.language.active());
  }

  protected short(label: string): string {
    return shortStandardLabel(label);
  }

  /** An audit pack that has been made reads "Klar" instead of "Ny". */
  protected rowStatus(row: ReportRow): ReportRow['status'] {
    return row.output.kind === 'pack' && this.pack() ? { tone: 'pass', key: 'ready' } : row.status;
  }

  protected flowLink(row: ReportRow) {
    return internalLink(row.output.route);
  }

  protected openDialog(row: ReportRow): void {
    this.downloadError.set(false);
    this.dialogRow.set(row);
  }

  protected downloadFile(row: ReportRow): void {
    const orgId = this.selectedOrg.currentOrgId();
    const file = row.file;
    if (!orgId || !file) {
      return;
    }
    this.downloading.set(row.id);
    this.downloadError.set(false);
    this.outputs.download(orgId, file.id).subscribe({
      next: (blob) => {
        saveFile(blob, file.file_name);
        this.downloading.set(null);
      },
      error: () => {
        this.downloading.set(null);
        this.downloadError.set(true);
      },
    });
  }

  private load(orgId: string, lang: string, withStandards: boolean, withPacks: boolean): void {
    this.sub?.unsubscribe();
    if (this.state().status !== 'loaded') {
      this.state.set({ status: 'loading' });
    }
    this.sub = this.outputs
      .list(orgId, { readiness: true, lang })
      .pipe(
        switchMap((list) =>
          forkJoin({
            standards: withStandards
              ? this.loadStandards(orgId, lang, list.items)
              : of({ standards: [], choices: [] }),
            files: this.outputs.generated(orgId, { current: true, limit: FILES_LIMIT }).pipe(
              map((g) => g.items),
              catchError(() => of([] as GeneratedOutput[])),
            ),
            pack:
              withPacks && list.items.some((o) => o.kind === 'pack')
                ? this.reports.listAuditPacks(orgId, { limit: 1 }).pipe(
                    map((p) => p.items[0] ?? null),
                    catchError(() => of(null)),
                  )
                : of(null),
          }).pipe(
            map(
              (rest): HubData => ({
                catalogue: list.items,
                standards: rest.standards.standards,
                choices: rest.standards.choices,
                files: rest.files,
                pack: rest.pack,
              }),
            ),
          ),
        ),
      )
      .subscribe({
        next: (data) => this.state.set({ status: 'loaded', data }),
        error: () => this.state.set({ status: 'error' }),
      });
  }

  /**
   * Per-standard outputs need a standard to know their readiness: read the catalogue
   * once per enabled standard that one of them applies to.
   */
  private loadStandards(
    orgId: string,
    lang: string,
    catalogue: readonly Output[],
  ): Observable<{ standards: StandardOutputs[]; choices: StandardChoice[] }> {
    const wanted = new Set(
      catalogue
        .filter((o) => o.subject === 'standard' && o.kind !== 'register_export')
        .flatMap((o) => o.frameworks),
    );
    return this.standardsApi.listFrameworks(orgId).pipe(
      switchMap((frameworks) => {
        const enabled = frameworks.filter((f) => f.enabled);
        const choices = enabled.map((f) => ({ key: f.standard_key, name: f.name }));
        const used = enabled.filter((f) => wanted.has(frameworkOf(f.standard_key)));
        if (used.length === 0) {
          return of({ standards: [], choices });
        }
        return forkJoin(
          used.map((f) =>
            this.outputs.list(orgId, { standard_key: f.standard_key, readiness: true, lang }).pipe(
              map(
                (l): StandardOutputs => ({
                  standardKey: f.standard_key,
                  labelKey: frameworkLabelKey(f.standard_key),
                  items: l.items,
                }),
              ),
              catchError(() => of(null)),
            ),
          ),
        ).pipe(
          map((all) => ({
            standards: all.filter((s): s is StandardOutputs => s !== null),
            choices,
          })),
        );
      }),
      catchError(() => of({ standards: [], choices: [] })),
    );
  }
}
