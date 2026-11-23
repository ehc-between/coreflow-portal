import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { GeneratedOutput, Output } from '../../core/outputs/outputs.models';
import { internalLink } from '../../core/search/internal-link';
import { LocalDatePipe } from '../locale/locale-pipes';
import { SECONDARY_LINK, TEXT_LINK } from '../requirement-locations/location-links';
import { Badge } from '../ui/badge/badge';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { GenerateDialog, StandardChoice } from './generate-dialog';
import { OUTPUTS_SCOPE, clauseText, localized } from './output-display';

/** Clause chips shown before "+N". */
const MAX_CLAUSES = 3;

/**
 * The output card, the same everywhere (simplify plan 3.2): a plain title, who it
 * is for and why (clauses), readiness ("Klar" / "Mangler N"), the last version, and
 * one primary action "Lag dokument" that opens the preflight dialog. Own-flow
 * outputs (audit packs) link to their flow instead.
 *
 *   <app-output-card [output]="o" [standardKey]="'iso27001'" (generated)="reload()" />
 */
@Component({
  selector: 'app-output-card',
  imports: [RouterLink, TranslocoPipe, Badge, Button, Icon, LocalDatePipe, GenerateDialog],
  viewProviders: [provideSharedScope(OUTPUTS_SCOPE)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article
      class="flex h-full flex-col gap-2.5 rounded-card border border-border bg-surface p-4 shadow-card"
      [attr.data-testid]="'output-card-' + output().key"
    >
      <div class="flex items-start justify-between gap-3">
        <h3 class="min-w-0 text-ui font-bold text-fg [overflow-wrap:anywhere]">{{ title() }}</h3>
        @if (output().readiness; as r) {
          @if (r.ready) {
            <app-badge tone="pass" data-testid="output-ready">
              {{ 'outputs.card.ready' | transloco }}
            </app-badge>
          } @else {
            <button
              type="button"
              class="shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              (click)="openDialog()"
              data-testid="output-missing"
            >
              <app-badge tone="warn">
                {{
                  (r.missing === 1 ? 'outputs.card.missingOne' : 'outputs.card.missing')
                    | transloco: { count: r.missing }
                }}
              </app-badge>
            </button>
          }
        }
      </div>

      @if (description(); as text) {
        <p class="text-meta text-fg-muted">{{ text }}</p>
      }

      <p class="text-meta text-fg-muted">
        <span class="font-semibold text-fg">{{ 'outputs.card.for' | transloco }}</span>
        {{ audiences() }}
        @if (clauses().length > 0) {
          <span aria-hidden="true"> · </span>
          <span data-testid="output-clauses">{{ clauses() }}</span>
          @if (moreClauses() > 0) {
            {{ 'outputs.card.moreClauses' | transloco: { count: moreClauses() } }}
          }
        }
      </p>

      <div class="mt-auto flex flex-col gap-2.5 pt-1">
        @if (output().last; as last) {
          <p class="text-meta text-fg-muted" data-testid="output-last">
            <a [routerLink]="last.url" [class]="textLink">{{
              'outputs.card.last'
                | transloco
                  : {
                      version: last.version,
                      date: (last.generated_at | localDate: 'mediumDate'),
                    }
            }}</a>
            @if (last.status === 'draft') {
              · {{ 'outputs.status.draft' | transloco }}
            }
            @if (last.has_gaps) {
              · {{ 'outputs.card.withGaps' | transloco }}
            }
          </p>
        }

        <div class="flex flex-wrap items-center justify-between gap-2">
          @if (flowLink(); as l) {
            <a
              [routerLink]="l.path"
              [queryParams]="l.queryParams"
              [class]="actionLink"
              data-testid="output-open-flow"
            >
              {{ 'outputs.actions.openFlow' | transloco }}
            </a>
          } @else {
            <app-button
              variant="secondary"
              size="sm"
              (click)="openDialog()"
              data-testid="output-make"
            >
              <app-icon name="documents" [size]="14" />
              {{ 'outputs.actions.make' | transloco }}
            </app-button>
          }
          <span class="text-micro text-fg-subtle" data-testid="output-formats">{{
            formats()
          }}</span>
        </div>
      </div>
    </article>

    @if (dialogOpen()) {
      <app-generate-dialog
        [open]="true"
        [output]="output()"
        [standardKey]="standardKey()"
        [entityId]="entityId()"
        [filters]="filters()"
        [standards]="standards()"
        (closed)="dialogOpen.set(false)"
        (generated)="generated.emit($event)"
      />
    }
  `,
})
export class OutputCard {
  private readonly language = inject(LanguageService);

  readonly output = input.required<Output>();
  readonly standardKey = input<string | null>(null);
  readonly entityId = input<string | null>(null);
  readonly filters = input<Readonly<Record<string, unknown>> | null>(null);
  readonly standards = input<readonly StandardChoice[]>([]);

  readonly generated = output<GeneratedOutput>();

  protected readonly dialogOpen = signal(false);
  /** Card actions are secondary: a list of cards must not show a row of primary buttons. */
  protected readonly actionLink = SECONDARY_LINK;
  protected readonly textLink = TEXT_LINK;

  protected readonly title = computed(() => localized(this.output().title, this.language.active()));
  protected readonly description = computed(() =>
    localized(this.output().description, this.language.active()),
  );
  protected readonly audiences = computed(() =>
    this.output()
      .audience.map((a) => this.language.translate(`outputs.audiences.${a}`))
      .join(', '),
  );
  protected readonly clauses = computed(() => {
    const lang = this.language.active();
    return this.output()
      .clauses.slice(0, MAX_CLAUSES)
      .map((c) => clauseText(c, lang))
      .join(', ');
  });
  protected readonly moreClauses = computed(() =>
    Math.max(0, this.output().clauses.length - MAX_CLAUSES),
  );
  /** "PDF · Word · Excel · nb/en" — what the user can choose when making it. */
  protected readonly formats = computed(() => {
    this.language.active();
    const names = this.output().formats.map((f) => this.language.translate(`outputs.formats.${f}`));
    return this.output().generates ? [...names, 'nb/en'].join(' · ') : '';
  });
  protected readonly flowLink = computed(() => {
    const out = this.output();
    return !out.generates && out.route ? internalLink(out.route) : null;
  });

  protected openDialog(): void {
    this.dialogOpen.set(true);
  }
}
