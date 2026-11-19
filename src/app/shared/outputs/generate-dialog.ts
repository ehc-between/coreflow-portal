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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { OutputsApi } from '../../core/outputs/outputs-api';
import {
  GeneratedOutput,
  OUTPUT_LANGS,
  Output,
  OutputLang,
  PreflightItem,
} from '../../core/outputs/outputs.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { internalLink } from '../../core/search/internal-link';
import { PRIMARY_LINK, SECONDARY_LINK, TEXT_LINK } from '../requirement-locations/location-links';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { SlideOver } from '../ui/slide-over/slide-over';
import {
  OUTPUTS_SCOPE,
  defaultFormat,
  defaultOutputLang,
  localized,
  outputErrorKey,
  preflightFromError,
  saveFile,
  sortPreflight,
} from './output-display';

/** A standard the user can pick for a per-standard output. */
export interface StandardChoice {
  readonly key: string;
  readonly name: string;
}

type Check =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly errorKey: string }
  | { readonly status: 'loaded'; readonly items: readonly PreflightItem[] };

/**
 * "Lag dokument" (outputs.md 5.1): pick format and language, see what is missing
 * before generating (each gap links to where it is filled in), then make the file.
 * With required gaps the main button becomes "Lag likevel": the gaps are listed and
 * marked in the document. After generating: download, or open the stored version.
 */
@Component({
  selector: 'app-generate-dialog',
  imports: [RouterLink, TranslocoPipe, Button, Icon, SlideOver],
  viewProviders: [provideSharedScope(OUTPUTS_SCOPE)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="title()"
      [subtitle]="'outputs.generate.subtitle' | transloco"
      [closeLabel]="'outputs.generate.close' | transloco"
      [width]="500"
      (closed)="closed.emit()"
    >
      @if (done(); as file) {
        <div data-testid="generate-done" class="flex flex-col gap-4">
          <div class="flex items-start gap-2.5 rounded-tile bg-pass-soft px-3.5 py-3 text-pass-ink">
            <app-icon name="checkcircle" [size]="18" />
            <div>
              <p class="text-ui font-bold">{{ 'outputs.generate.doneTitle' | transloco }}</p>
              <p class="mt-0.5 text-meta">
                {{
                  'outputs.generate.doneBody'
                    | transloco
                      : {
                          version: file.version,
                          format: 'outputs.formats.' + file.format | transloco,
                          lang: 'outputs.langs.' + file.lang | transloco,
                        }
                }}
              </p>
            </div>
          </div>
          @if (file.has_gaps) {
            <p class="text-meta text-warn-ink" data-testid="generate-done-gaps">
              {{ 'outputs.generate.doneGaps' | transloco }}
            </p>
          }
          @if (file.status === 'draft') {
            <p class="text-meta text-fg-muted">{{ 'outputs.generate.doneDraft' | transloco }}</p>
          }
          <div class="flex flex-wrap gap-2">
            <app-button
              [loading]="downloading()"
              (click)="download(file)"
              data-testid="generate-download"
            >
              <app-icon name="download" [size]="15" />
              {{ 'outputs.actions.download' | transloco }}
            </app-button>
            <a [routerLink]="file.url" [class]="secondaryLink" data-testid="generate-open">
              {{ 'outputs.actions.openVersion' | transloco }}
            </a>
          </div>
          @if (downloadError()) {
            <p class="text-meta text-fail" role="alert">{{ downloadError()! | transloco }}</p>
          }
        </div>
      } @else {
        <div class="flex flex-col gap-4">
          @if (description(); as text) {
            <p class="text-ui text-fg-muted">{{ text }}</p>
          }

          @if (needsStandard()) {
            <label class="flex flex-col gap-1">
              <span class="text-ui font-semibold text-fg-muted">{{
                'outputs.generate.standard' | transloco
              }}</span>
              <select
                class="h-9 rounded-tile border border-border bg-surface px-2.5 text-ui"
                data-testid="generate-standard"
                [value]="standard() ?? ''"
                (change)="standard.set(asValue($event) || null)"
              >
                <option value="">{{ 'outputs.generate.pickStandard' | transloco }}</option>
                @for (s of standards(); track s.key) {
                  <option [value]="s.key" [selected]="s.key === standard()">{{ s.name }}</option>
                }
              </select>
            </label>
          }

          @if (needsRecord()) {
            <p class="rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg-muted">
              {{ 'outputs.generate.fromRecord' | transloco }}
            </p>
          }

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1">
              <span class="text-ui font-semibold text-fg-muted">{{
                'outputs.generate.format' | transloco
              }}</span>
              <select
                class="h-9 rounded-tile border border-border bg-surface px-2.5 text-ui"
                data-testid="generate-format"
                [value]="format()"
                (change)="format.set(asValue($event))"
              >
                @for (f of output().formats; track f) {
                  <option [value]="f" [selected]="f === format()">
                    {{ 'outputs.formats.' + f | transloco }}
                  </option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-ui font-semibold text-fg-muted">{{
                'outputs.generate.lang' | transloco
              }}</span>
              <select
                class="h-9 rounded-tile border border-border bg-surface px-2.5 text-ui"
                data-testid="generate-lang"
                [value]="lang()"
                (change)="lang.set(asLang($event))"
              >
                @for (l of langs; track l) {
                  <option [value]="l" [selected]="l === lang()">
                    {{ 'outputs.langs.' + l | transloco }}
                  </option>
                }
              </select>
            </label>
          </div>

          @if (output().has_preflight && subjectReady()) {
            <section data-testid="generate-preflight" [attr.aria-busy]="checking()">
              <h3 class="text-ui font-bold text-fg">
                {{ 'outputs.preflight.title' | transloco }}
              </h3>
              @switch (check().status) {
                @case ('loading') {
                  <p class="mt-1 text-meta text-fg-muted">
                    {{ 'outputs.preflight.checking' | transloco }}
                  </p>
                }
                @case ('error') {
                  <p class="mt-1 text-meta text-fail" role="alert">
                    {{ checkErrorKey() | transloco }}
                  </p>
                }
                @case ('loaded') {
                  @if (missing() === 0) {
                    <p
                      class="mt-1 flex items-center gap-1.5 text-meta text-pass-ink"
                      data-testid="preflight-ready"
                    >
                      <app-icon name="check" [size]="14" />
                      {{ 'outputs.preflight.ready' | transloco }}
                    </p>
                  } @else {
                    <p class="mt-1 text-meta text-warn-ink" data-testid="preflight-missing">
                      {{
                        (missing() === 1
                          ? 'outputs.preflight.missingOne'
                          : 'outputs.preflight.missing'
                        ) | transloco: { count: missing() }
                      }}
                    </p>
                  }
                  <ul class="mt-2 flex flex-col gap-1.5">
                    @for (item of checks(); track item.key) {
                      <li
                        class="flex items-start gap-2 rounded-tile border border-border px-3 py-2"
                        [attr.data-testid]="'preflight-item-' + item.key"
                      >
                        <span
                          class="mt-0.5 flex"
                          [class.text-pass]="item.met"
                          [class.text-fail]="!item.met && item.severity === 'required'"
                          [class.text-warn]="!item.met && item.severity !== 'required'"
                        >
                          <app-icon [name]="item.met ? 'check' : 'alert'" [size]="14" />
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class="text-ui font-semibold text-fg">{{ item.label }}</p>
                          @if (!item.met && item.message) {
                            <p class="text-meta text-fg-muted">{{ item.message }}</p>
                          }
                          @if (!item.met && item.severity !== 'required') {
                            <p class="text-micro text-fg-subtle">
                              {{ 'outputs.preflight.recommended' | transloco }}
                            </p>
                          }
                        </div>
                        @if (!item.met && link(item.url); as l) {
                          <a
                            [routerLink]="l.path"
                            [queryParams]="l.queryParams"
                            [class]="textLink"
                            class="shrink-0 text-meta"
                            (click)="closed.emit()"
                            >{{ 'outputs.preflight.fix' | transloco }}</a
                          >
                        }
                      </li>
                    }
                  </ul>
                }
              }
            </section>
          }

          @if (errorKey(); as key) {
            <p class="text-meta text-fail" role="alert" data-testid="generate-error">
              {{ key | transloco }}
            </p>
          }

          <div class="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            @if (output().route && !output().generates) {
              @if (link(output().route); as l) {
                <a [routerLink]="l.path" [queryParams]="l.queryParams" [class]="primaryLink">
                  {{ 'outputs.actions.openFlow' | transloco }}
                </a>
              }
            } @else if (missing() > 0) {
              <app-button
                [loading]="generating()"
                [disabled]="!canGenerate()"
                (click)="generate(true)"
                data-testid="generate-anyway"
              >
                {{ 'outputs.actions.makeAnyway' | transloco }}
              </app-button>
              <span class="text-meta text-fg-muted">{{
                'outputs.preflight.anywayHint' | transloco
              }}</span>
            } @else {
              <app-button
                [loading]="generating()"
                [disabled]="!canGenerate()"
                (click)="generate(false)"
                data-testid="generate-submit"
              >
                {{ 'outputs.actions.make' | transloco }}
              </app-button>
            }
          </div>
        </div>
      }
    </app-slide-over>
  `,
})
export class GenerateDialog {
  private readonly api = inject(OutputsApi);
  private readonly language = inject(LanguageService);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly open = input(false);
  readonly output = input.required<Output>();
  /** Preset standard (a standard page, or the library's standard filter). */
  readonly standardKey = input<string | null>(null);
  /** The record a record report is about. */
  readonly entityId = input<string | null>(null);
  /** Register exports: the list's current filters. */
  readonly filters = input<Readonly<Record<string, unknown>> | null>(null);
  /** Choices for a per-standard output opened without a preset standard. */
  readonly standards = input<readonly StandardChoice[]>([]);

  readonly closed = output<void>();
  readonly generated = output<GeneratedOutput>();

  protected readonly langs = OUTPUT_LANGS;
  protected readonly primaryLink = PRIMARY_LINK;
  protected readonly secondaryLink = SECONDARY_LINK;
  protected readonly textLink = TEXT_LINK;

  protected readonly format = signal('pdf');
  protected readonly lang = signal<OutputLang>('nb');
  protected readonly standard = signal<string | null>(null);
  protected readonly check = signal<Check>({ status: 'idle' });
  protected readonly generating = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly done = signal<GeneratedOutput | null>(null);
  protected readonly downloading = signal(false);
  protected readonly downloadError = signal<string | null>(null);

  private checkSub: Subscription | null = null;

  protected readonly title = computed(() => localized(this.output().title, this.language.active()));
  protected readonly description = computed(() =>
    localized(this.output().description, this.language.active()),
  );
  protected readonly needsStandard = computed(
    () => this.output().subject === 'standard' && !this.standardKey(),
  );
  protected readonly needsRecord = computed(
    () => this.output().subject === 'record' && !this.entityId(),
  );
  protected readonly subjectReady = computed(() => {
    const subject = this.output().subject;
    if (subject === 'standard') {
      return !!this.standard();
    }
    if (subject === 'record') {
      return !!this.entityId();
    }
    return true;
  });
  protected readonly checks = computed(() => {
    const state = this.check();
    return state.status === 'loaded' ? sortPreflight(state.items) : [];
  });
  protected readonly missing = computed(
    () => this.checks().filter((i) => !i.met && i.severity === 'required').length,
  );
  protected readonly checking = computed(() => this.check().status === 'loading');
  protected readonly checkErrorKey = computed(() => {
    const state = this.check();
    return state.status === 'error' ? state.errorKey : '';
  });
  protected readonly canGenerate = computed(
    () => this.subjectReady() && !this.checking() && !this.generating() && !!this.format(),
  );

  constructor() {
    // Reset the form each time the dialog opens.
    effect(() => {
      if (!this.open()) {
        return;
      }
      const out = this.output();
      untracked(() => {
        this.format.set(defaultFormat(out));
        this.lang.set(defaultOutputLang(this.language.active()));
        this.standard.set(this.standardKey());
        this.done.set(null);
        this.errorKey.set(null);
        this.downloadError.set(null);
        this.check.set({ status: 'idle' });
      });
    });
    // Run the preflight whenever the subject or the document language changes.
    effect(() => {
      const open = this.open();
      const out = this.output();
      const ready = this.subjectReady();
      const lang = this.lang();
      const standard = this.standard();
      if (!open || !out.has_preflight || !ready || !out.generates) {
        return;
      }
      untracked(() => this.runPreflight(out, lang, standard));
    });
    inject(DestroyRef).onDestroy(() => this.checkSub?.unsubscribe());
  }

  protected link(url: string | null | undefined) {
    return internalLink(url);
  }

  protected asValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected asLang(event: Event): OutputLang {
    return this.asValue(event) === 'en' ? 'en' : 'nb';
  }

  private runPreflight(out: Output, lang: OutputLang, standard: string | null): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.checkSub?.unsubscribe();
    this.check.set({ status: 'loading' });
    this.checkSub = this.api
      .preflight(orgId, out.key, {
        standard_key: standard,
        entity_id: this.entityId(),
        filters: this.filters() ?? undefined,
        lang,
      })
      .subscribe({
        next: (result) => this.check.set({ status: 'loaded', items: result.items }),
        error: (err) => this.check.set({ status: 'error', errorKey: outputErrorKey(err) }),
      });
  }

  protected generate(acceptGaps: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canGenerate()) {
      return;
    }
    const out = this.output();
    this.generating.set(true);
    this.errorKey.set(null);
    this.api
      .generate(orgId, out.key, {
        standard_key: this.standard(),
        entity_id: this.entityId(),
        filters: this.filters() ?? undefined,
        format: this.format(),
        lang: this.lang(),
        accept_gaps: acceptGaps,
      })
      .subscribe({
        next: (file) => {
          this.generating.set(false);
          this.done.set(file);
          this.generated.emit(file);
        },
        error: (err) => {
          this.generating.set(false);
          const items = preflightFromError(err);
          if (items) {
            // The data changed since the check: show the gaps and offer "Lag likevel".
            this.check.set({ status: 'loaded', items });
            return;
          }
          this.errorKey.set(outputErrorKey(err));
        },
      });
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
}
