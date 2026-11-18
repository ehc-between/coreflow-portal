import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { GeneratedOutput, Output, SourceCheck } from '../../core/outputs/outputs.models';
import { internalLink } from '../../core/search/internal-link';
import { StandardsApi } from '../../core/standards/standards-api';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { GenerateDialog } from '../../shared/outputs/generate-dialog';
import {
  clauseText,
  fileSize,
  localized,
  outputErrorKey,
  saveFile,
} from '../../shared/outputs/output-display';
import { TEXT_LINK } from '../../shared/requirement-locations/location-links';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly notFound: boolean }
  | { readonly status: 'loaded'; readonly file: GeneratedOutput };

/**
 * `/library/generated/:id` — one stored version of a generated document: what it
 * is, who made it and when, what it was missing, which requirements it counts for,
 * and its checksum. "Last ned" is the primary action. When the source data changed
 * since the file was made, it offers "Lag ny versjon" (the same preflight dialog).
 */
@Component({
  selector: 'app-generated-detail-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    ErrorState,
    FieldItem,
    FieldList,
    GenerateDialog,
    Icon,
    LoadingState,
    LocalDatePipe,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @switch (state().status) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state
            [titleKey]="notFound() ? 'outputs.generated.notFoundTitle' : 'ui.error.title'"
            [bodyKey]="notFound() ? 'outputs.generated.notFoundBody' : 'ui.error.body'"
            (retry)="reload()"
          />
        }
        @case ('loaded') {
          @if (file(); as f) {
            <app-page-header
              [title]="f.title"
              [breadcrumbs]="[
                { labelKey: 'outputs.title', link: '/library' },
                { labelKey: 'outputs.saved.title', link: '/library/saved' },
                { label: f.title },
              ]"
            >
              <ng-container meta>
                <span>{{ 'outputs.generated.version' | transloco: { version: f.version } }}</span>
                @if (f.status === 'draft') {
                  <app-badge tone="info">{{ 'outputs.status.draft' | transloco }}</app-badge>
                } @else {
                  <app-badge tone="pass">{{ 'outputs.status.final' | transloco }}</app-badge>
                }
                @if (f.ai_draft) {
                  <app-badge tone="accent">{{ 'outputs.status.aiDraft' | transloco }}</app-badge>
                }
                @if (f.has_gaps) {
                  <app-badge tone="warn">{{ 'outputs.status.gaps' | transloco }}</app-badge>
                }
                @if (!f.current) {
                  <app-badge tone="neutral">{{
                    'outputs.status.superseded' | transloco
                  }}</app-badge>
                }
              </ng-container>
              @if (output()?.generates) {
                <app-button
                  secondary
                  variant="secondary"
                  (click)="dialogOpen.set(true)"
                  data-testid="generated-new-version"
                >
                  {{ 'outputs.actions.newVersion' | transloco }}
                </app-button>
              }
              <app-button
                primary
                [loading]="downloading()"
                (click)="download(f)"
                data-testid="generated-download"
              >
                <app-icon name="download" [size]="15" />
                {{ 'outputs.actions.download' | transloco }}
              </app-button>
            </app-page-header>

            @if (downloadError(); as key) {
              <p class="mb-4 text-meta text-fail" role="alert">{{ key | transloco }}</p>
            }

            @if (source()?.changed) {
              <div
                class="mb-5 flex flex-wrap items-center gap-3 rounded-tile border border-warn/40 bg-warn-soft px-4 py-3 text-ui text-warn-ink"
                data-testid="generated-source-changed"
                role="status"
              >
                <app-icon name="alert" [size]="16" />
                <span class="flex-1">{{ 'outputs.generated.sourceChanged' | transloco }}</span>
                @if (output()?.generates) {
                  <app-button size="sm" (click)="dialogOpen.set(true)">
                    {{ 'outputs.actions.newVersion' | transloco }}
                  </app-button>
                }
              </div>
            }
            @if (f.superseded_at) {
              <p class="mb-5 text-ui text-fg-muted" data-testid="generated-superseded">
                {{
                  'outputs.generated.supersededOn'
                    | transloco: { date: (f.superseded_at | localDate: 'mediumDate') }
                }}
              </p>
            }

            <section class="rounded-card border border-border bg-surface p-5">
              <app-field-list [columns]="2">
                <app-field-item
                  labelKey="outputs.generated.fields.output"
                  [value]="outputTitle()"
                />
                <app-field-item
                  labelKey="outputs.generated.fields.made"
                  [value]="(f.generated_at | localDate: 'medium') + byline()"
                />
                <app-field-item
                  labelKey="outputs.generated.fields.format"
                  [value]="
                    ('outputs.formats.' + f.format | transloco) +
                    ' · ' +
                    ('outputs.langs.' + f.lang | transloco)
                  "
                />
                <app-field-item labelKey="outputs.generated.fields.size" [value]="size()" />
                @if (f.standard_key) {
                  <app-field-item
                    labelKey="outputs.generated.fields.standard"
                    [value]="standardName() || f.standard_key"
                  />
                }
                @if (f.rows > 0) {
                  <app-field-item labelKey="outputs.generated.fields.rows" [value]="f.rows" />
                }
                <app-field-item
                  labelKey="outputs.generated.fields.clauses"
                  empty="none"
                  [wide]="true"
                >
                  {{ clauses() }}
                </app-field-item>
                <app-field-item
                  labelKey="outputs.generated.fields.evidence"
                  empty="none"
                  [wide]="true"
                >
                  @if (evidence()) {
                    <span data-testid="generated-evidence">{{ evidence() }}</span>
                  } @else {
                    <span class="text-fg-muted">{{ evidenceHint() | transloco }}</span>
                  }
                </app-field-item>
                <app-field-item labelKey="outputs.generated.fields.checksum" [wide]="true">
                  <code class="font-mono text-meta break-all text-fg-muted">{{ f.sha256 }}</code>
                  <span class="mt-0.5 block text-micro text-fg-subtle">{{
                    'outputs.generated.checksumHint' | transloco
                  }}</span>
                </app-field-item>
              </app-field-list>
            </section>

            @if (gaps().length > 0) {
              <section class="mt-5" data-testid="generated-gaps">
                <h2 class="mb-2 font-display text-section font-bold text-fg">
                  {{ 'outputs.generated.gapsTitle' | transloco }}
                </h2>
                <ul class="flex flex-col gap-1.5">
                  @for (item of gaps(); track item.key) {
                    <li
                      class="flex flex-wrap items-start gap-2 rounded-tile border border-border bg-surface px-3 py-2"
                    >
                      <span class="mt-0.5 flex text-warn"
                        ><app-icon name="alert" [size]="14"
                      /></span>
                      <div class="min-w-0 flex-1">
                        <p class="text-ui font-semibold text-fg">{{ item.label }}</p>
                        @if (item.message) {
                          <p class="text-meta text-fg-muted">{{ item.message }}</p>
                        }
                      </div>
                      @if (link(item.url); as l) {
                        <a
                          [routerLink]="l.path"
                          [queryParams]="l.queryParams"
                          [class]="textLink"
                          class="text-meta"
                          >{{ 'outputs.preflight.fix' | transloco }}</a
                        >
                      }
                    </li>
                  }
                </ul>
              </section>
            }

            @if (dialogOpen() && output(); as o) {
              <app-generate-dialog
                [open]="true"
                [output]="o"
                [standardKey]="f.standard_key"
                [entityId]="f.subject_type === 'record' ? f.subject_id : null"
                [filters]="filters()"
                (closed)="dialogOpen.set(false)"
                (generated)="openVersion($event)"
              />
            }
          }
        }
      }
    </div>
  `,
})
export class GeneratedDetailPage {
  private readonly api = inject(OutputsApi);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly standardsApi = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly output = signal<Output | null>(null);
  protected readonly source = signal<SourceCheck | null>(null);
  /** The standard's name (the file only stores its key). */
  protected readonly standardName = signal('');
  protected readonly dialogOpen = signal(false);
  protected readonly downloading = signal(false);
  protected readonly downloadError = signal<string | null>(null);
  protected readonly textLink = TEXT_LINK;
  private readonly reloads = signal(0);

  protected readonly file = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.file : null;
  });
  protected readonly notFound = computed(() => {
    const state = this.state();
    return state.status === 'error' && state.notFound;
  });
  protected readonly outputTitle = computed(() =>
    localized(this.file()?.output_title, this.language.active()),
  );
  protected readonly byline = computed(() => {
    const name = this.file()?.generated_by?.name;
    return name ? ` · ${name}` : '';
  });
  protected readonly size = computed(() =>
    fileSize(this.file()?.size_bytes ?? 0, this.language.locale()),
  );
  protected readonly clauses = computed(() => {
    const lang = this.language.active();
    return (this.file()?.clauses ?? []).map((c) => clauseText(c, lang)).join(', ');
  });
  protected readonly evidence = computed(() => {
    const lang = this.language.active();
    return (this.file()?.evidence_for ?? []).map((c) => clauseText(c, lang)).join(', ');
  });
  /** Why a file does not count as evidence (plan U40: drafts and gaps never do). */
  protected readonly evidenceHint = computed(() => {
    const f = this.file();
    if (!f) {
      return '';
    }
    if (f.status === 'draft') {
      return 'outputs.generated.noEvidenceDraft';
    }
    if (f.has_gaps) {
      return 'outputs.generated.noEvidenceGaps';
    }
    if (!f.current) {
      return 'outputs.generated.noEvidenceSuperseded';
    }
    return 'outputs.generated.noEvidence';
  });
  protected readonly gaps = computed(() => (this.file()?.preflight ?? []).filter((i) => !i.met));
  protected readonly filters = computed(() => {
    const filters = this.file()?.params?.['filters'];
    return filters && typeof filters === 'object'
      ? (filters as Readonly<Record<string, unknown>>)
      : null;
  });

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      this.reloads();
      if (!orgId || !id) {
        return;
      }
      untracked(() => this.load(orgId, id));
    });
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  private load(orgId: string, id: string): void {
    this.state.set({ status: 'loading' });
    this.output.set(null);
    this.source.set(null);
    this.api.generatedOne(orgId, id).subscribe({
      next: (file) => {
        this.state.set({ status: 'loaded', file });
        this.loadStandardName(orgId, file.standard_key);
        // The output (for "Lag ny versjon") and the source check are extras: the
        // page works without them.
        this.api
          .get(orgId, file.output_key, { standard_key: file.standard_key })
          .subscribe({ next: (o) => this.output.set(o), error: () => this.output.set(null) });
        if (file.current) {
          this.api
            .sourceCheck(orgId, id)
            .subscribe({ next: (s) => this.source.set(s), error: () => this.source.set(null) });
        }
      },
      error: (err: { status?: number }) =>
        this.state.set({ status: 'error', notFound: err?.status === 404 }),
    });
  }

  private loadStandardName(orgId: string, key: string | null): void {
    this.standardName.set('');
    if (!key) {
      return;
    }
    this.standardsApi.listFrameworks(orgId).subscribe({
      next: (items) => this.standardName.set(items.find((i) => i.standard_key === key)?.name ?? ''),
      error: () => this.standardName.set(''),
    });
  }

  protected link(url: string | null | undefined) {
    return internalLink(url);
  }

  protected download(file: GeneratedOutput): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.downloading.set(true);
    this.downloadError.set(null);
    this.api.download(orgId, file.id).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        saveFile(blob, file.file_name);
      },
      error: (err) => {
        this.downloading.set(false);
        this.downloadError.set(outputErrorKey(err));
      },
    });
  }

  protected openVersion(file: GeneratedOutput): void {
    this.dialogOpen.set(false);
    void this.router.navigateByUrl(file.url);
  }
}
