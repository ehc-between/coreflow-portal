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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { bcp47ForLang, withUtcDefault } from '../../core/i18n/locale';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { pluralKey } from '../../shared/i18n/plural';
import { ReqPills } from '../../shared/requirement-links/req-pills';
import { Badge } from '../../shared/ui/badge/badge';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../shared/ui/page-header/page-header';
import { AskPanelService } from '../ask/ask-panel.service';
import { HandbookApi } from './data/handbook-api';
import { procedurePill, riskTone, withUnit } from './data/handbook.logic';
import { HandbookPage, HandbookProcedure } from './data/handbook.models';
import { HandbookArrow } from './process-box';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly notFound: boolean }
  | { readonly status: 'ready'; readonly page: HandbookPage };

/** Requirement refs per card (prototype; shown only with "Vis krav" on). */
const CARD_REFS = {
  procedures: ['ISO 9001 7.5', 'ISO 9001 8.5.1'],
  who: ['ISO 9001 5.3'],
  risks: ['ISO 9001 6.1'],
  performance: ['ISO 9001 9.1', 'ISO 9001 10.2'],
} as const;

const BTN =
  'inline-flex h-9 items-center justify-center gap-2 rounded-tile border px-4 text-ui font-semibold whitespace-nowrap';
const PRIMARY = `${BTN} border-transparent bg-accent text-white hover:bg-accent-2`;
const SECONDARY = `${BTN} border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2`;
const NAV_END =
  'grid flex-none min-w-[110px] place-items-center rounded-[12px] bg-accent-soft p-2.5 text-center text-[13.5px] font-semibold text-accent max-[820px]:min-w-0';
const CARD = 'rounded-card border border-border bg-surface p-4';
const ROW =
  'flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0';

/**
 * A process in Håndbok `/handbook/:id` (IA v2 §5.8, prototype `prosess`): what kind of
 * process it is, its owner and procedures; "Slik gjør vi det" as steps with arrows
 * (role and procedure per step) between the previous and next process of the value
 * chain; and the cards Prosedyrer og skjemaer, Hvem gjør hva, Hva kan gå galt and
 * Hvordan går det. One primary action: "+ Ny prosedyre". The full register record
 * (map editor, turtle, reviews) stays at `/processes/:id` ("Detaljer og redigering").
 */
@Component({
  selector: 'app-handbook-process-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    ErrorState,
    HandbookArrow,
    LoadingState,
    PageHeader,
    ReqPills,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1240px] px-4 py-7 sm:px-6">
      @switch (state().status) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          @if (notFound()) {
            <p class="rounded-card border border-border bg-surface p-6 text-body text-fg-muted">
              {{ 'handbook.process.notFound' | transloco }}
              <a routerLink="/handbook" class="ml-1 font-semibold text-accent hover:underline">{{
                'handbook.title' | transloco
              }}</a>
            </p>
          } @else {
            <app-error-state (retry)="reload()" />
          }
        }
        @case ('ready') {
          @if (page(); as p) {
            <app-page-header [title]="p.process.title" [breadcrumbs]="crumbs()">
              <span meta data-testid="handbook-status-line">
                {{ 'handbook.bands.' + p.kind + '.kind' | transloco }} ·
                @if (p.owner_name) {
                  {{ 'handbook.process.ownerLabel' | transloco }}
                  <b class="text-fg">{{ p.owner_name }}</b>
                } @else {
                  {{ 'handbook.process.noOwner' | transloco }}
                }
                ·
                {{
                  pluralKey('handbook.process.procedures', p.process.procedure_count)
                    | transloco: { count: p.process.procedure_count }
                }}
              </span>
              @if (p.process.open_cases) {
                <a meta [routerLink]="'/cases'" [queryParams]="{ process: p.process.id }">
                  <app-badge tone="fail">{{
                    pluralKey('handbook.process.openCases', p.process.open_cases)
                      | transloco: { count: p.process.open_cases }
                  }}</app-badge>
                </a>
              }
              @if (p.process.status === 'draft') {
                <app-badge meta tone="neutral">{{
                  'handbook.process.draft' | transloco
                }}</app-badge>
              }
              <button
                secondary
                type="button"
                [class]="secondaryClass"
                (click)="ask(p)"
                data-testid="handbook-ask"
              >
                {{ 'handbook.actions.askProcess' | transloco }}
              </button>
              <a secondary [class]="secondaryClass" [routerLink]="['/processes', p.process.id]">{{
                'handbook.actions.details' | transloco
              }}</a>
              @if (canDraft()) {
                <a
                  primary
                  [class]="primaryClass"
                  routerLink="/documents/new"
                  [queryParams]="{ type: 'procedure', process: p.process.id }"
                  data-testid="handbook-new-procedure"
                  >{{ 'handbook.actions.newProcedure' | transloco }}</a
                >
              }
            </app-page-header>

            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{ 'handbook.process.howWeWork' | transloco }}
            </h2>
            @if (p.steps.length === 0) {
              <div class="mb-6 rounded-card border border-dashed border-border bg-surface p-5">
                <b class="block text-fg">{{ 'handbook.process.noSteps' | transloco }}</b>
                <p class="mt-1 text-body text-fg-muted">
                  {{ 'handbook.process.noStepsBody' | transloco }}
                </p>
                @if (p.can_edit) {
                  <a
                    class="mt-3 inline-flex font-semibold text-accent hover:underline"
                    [routerLink]="['/processes', p.process.id, 'map']"
                    >{{ 'handbook.actions.makeSteps' | transloco }}</a
                  >
                }
              </div>
            } @else {
              <div
                class="mb-6 flex items-stretch overflow-x-auto pb-1.5 max-[820px]:flex-col"
                data-testid="handbook-flow"
              >
                @if (p.is_first_core) {
                  <span [class]="navEnd">{{ 'handbook.process.fromCustomer' | transloco }}</span>
                  <app-handbook-arrow />
                } @else if (p.prev; as prev) {
                  <a
                    [class]="navEnd + ' hover:underline'"
                    [routerLink]="['/handbook', prev.id]"
                    [attr.aria-label]="'handbook.process.prevProcess' | transloco"
                    data-testid="handbook-prev"
                    >{{ 'handbook.process.from' | transloco: { title: prev.title } }}</a
                  >
                  <app-handbook-arrow />
                }
                @for (s of p.steps; track s.node_id; let first = $first) {
                  @if (!first) {
                    <app-handbook-arrow />
                  }
                  <div
                    class="flex min-w-[170px] flex-1 basis-0 flex-col gap-2 rounded-[12px] border border-border bg-surface p-3.5 max-[820px]:min-w-0"
                    data-testid="handbook-step"
                  >
                    <span
                      class="text-[12px] font-semibold tracking-[.06em] text-fg-subtle uppercase"
                      >{{ 'handbook.process.step' | transloco: { n: s.n } }}</span
                    >
                    <b class="font-semibold [overflow-wrap:anywhere] text-fg">{{ s.label }}</b>
                    @if (s.role) {
                      <span class="text-[13px] text-fg-muted">{{ s.role }}</span>
                    }
                    @if (s.document; as d) {
                      <a
                        class="inline-flex w-fit max-w-full items-center gap-1.5 rounded-[8px] bg-accent-soft px-2 py-1 text-[13px] text-accent no-underline hover:underline"
                        [routerLink]="d.url ?? ['/documents', d.id]"
                        ><span aria-hidden="true">¶</span
                        ><span class="[overflow-wrap:anywhere]">{{ d.title }}</span></a
                      >
                    }
                  </div>
                }
                @if (p.is_last_core) {
                  <app-handbook-arrow />
                  <span [class]="navEnd">{{ 'handbook.process.toCustomer' | transloco }}</span>
                } @else if (p.next; as next) {
                  <app-handbook-arrow />
                  <a
                    [class]="navEnd + ' hover:underline'"
                    [routerLink]="['/handbook', next.id]"
                    [attr.aria-label]="'handbook.process.nextProcess' | transloco"
                    data-testid="handbook-next"
                    >{{ 'handbook.process.to' | transloco: { title: next.title } }}</a
                  >
                }
              </div>
            }

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <section [class]="cardClass" data-testid="handbook-card-procedures">
                <div class="mb-2 flex items-baseline justify-between gap-3">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'handbook.cards.procedures' | transloco }}
                  </h2>
                  @if (canDraft()) {
                    <a
                      class="text-ui font-semibold text-accent hover:underline"
                      routerLink="/documents/new"
                      [queryParams]="{ type: 'procedure', process: p.process.id }"
                      >{{ 'handbook.actions.add' | transloco }}</a
                    >
                  }
                </div>
                @if (p.procedures.length) {
                  <ul>
                    @for (d of p.procedures; track d.id) {
                      <li [class]="rowClass">
                        <span class="min-w-0">
                          <a
                            class="font-semibold text-fg [overflow-wrap:anywhere] hover:underline"
                            [routerLink]="d.url ?? ['/documents', d.id]"
                            >{{ d.title }}</a
                          >
                          @if (versionLine(d); as line) {
                            <span class="block text-meta text-fg-muted">{{ line }}</span>
                          }
                        </span>
                        <app-badge [tone]="pill(d).tone">{{
                          pill(d).key | transloco: pill(d).params
                        }}</app-badge>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-meta text-fg-muted">
                    {{ 'handbook.cards.proceduresEmpty' | transloco }}
                  </p>
                }
                <app-req-pills [refs]="refs.procedures" />
              </section>

              <section [class]="cardClass" data-testid="handbook-card-who">
                <h2 class="mb-2 font-display text-card font-bold text-fg">
                  {{ 'handbook.cards.who' | transloco }}
                </h2>
                <ul>
                  <li [class]="rowClass">
                    <span>{{ 'handbook.cards.responsible' | transloco }}</span>
                    <b class="text-right text-fg">{{
                      p.owner_name ?? ('handbook.process.noOwner' | transloco)
                    }}</b>
                  </li>
                  @for (r of p.roles; track $index) {
                    <li [class]="rowClass">
                      <span class="min-w-0 [overflow-wrap:anywhere]">{{ r.label }}</span>
                      <span class="text-right text-fg-muted">{{ r.role }}</span>
                    </li>
                  }
                </ul>
                @if (!p.roles.length) {
                  <p class="mt-1 text-meta text-fg-muted">
                    {{ 'handbook.cards.whoEmpty' | transloco }}
                  </p>
                }
                <app-req-pills [refs]="refs.who" />
              </section>

              <section [class]="cardClass" data-testid="handbook-card-risks">
                <h2 class="mb-2 font-display text-card font-bold text-fg">
                  {{ 'handbook.cards.risks' | transloco }}
                </h2>
                @if (p.risks.length) {
                  <ul>
                    @for (r of p.risks; track $index) {
                      <li [class]="rowClass">
                        @if (r.url) {
                          <a
                            class="min-w-0 [overflow-wrap:anywhere] hover:underline"
                            [routerLink]="r.url"
                            >{{ r.title }}</a
                          >
                        } @else {
                          <span class="min-w-0 [overflow-wrap:anywhere]">{{ r.title }}</span>
                        }
                        <app-badge [tone]="riskTone(r.level)">{{
                          'handbook.risk.' + (r.level ?? 'none') | transloco
                        }}</app-badge>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-meta text-fg-muted">
                    {{ 'handbook.cards.risksEmpty' | transloco }}
                  </p>
                }
                <app-req-pills [refs]="refs.risks" />
              </section>

              <section [class]="cardClass" data-testid="handbook-card-performance">
                <h2 class="mb-2 font-display text-card font-bold text-fg">
                  {{ 'handbook.cards.performance' | transloco }}
                </h2>
                <ul>
                  @for (k of p.performance.kpis; track $index) {
                    <li [class]="rowClass">
                      <span class="min-w-0 [overflow-wrap:anywhere]">{{ k.name }}</span>
                      <b class="text-right whitespace-nowrap text-fg"
                        >{{ unit(k.value, k.unit) }}
                        @if (k.target !== null && k.target !== '') {
                          <span class="text-meta font-normal text-fg-muted">{{
                            'handbook.cards.target' | transloco: { value: unit(k.target, k.unit) }
                          }}</span>
                        }
                      </b>
                    </li>
                  }
                  <li [class]="rowClass">
                    <span>{{ 'handbook.cards.cases' | transloco }}</span>
                    @if (p.performance.cases_12m.open + p.performance.cases_12m.closed > 0) {
                      <a
                        [routerLink]="'/cases'"
                        [queryParams]="{ process: p.process.id }"
                        class="no-underline"
                        data-testid="handbook-cases"
                      >
                        <app-badge [tone]="p.performance.cases_12m.open ? 'fail' : 'neutral'">{{
                          'handbook.cards.casesSummary' | transloco: p.performance.cases_12m
                        }}</app-badge>
                      </a>
                    } @else {
                      <span class="text-fg-muted">{{
                        'handbook.cards.casesNone' | transloco
                      }}</span>
                    }
                  </li>
                </ul>
                <app-req-pills [refs]="refs.performance" />
              </section>
            </div>
          }
        }
      }
    </div>
  `,
})
export class HandbookProcessPage {
  private readonly api = inject(HandbookApi);
  private readonly org = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly askPanel = inject(AskPanelService);

  /** Route param `:id` (component input binding). */
  readonly id = input<string>('');

  protected readonly pluralKey = pluralKey;
  protected readonly refs = CARD_REFS;
  protected readonly primaryClass = PRIMARY;
  protected readonly secondaryClass = SECONDARY;
  protected readonly navEnd = NAV_END;
  protected readonly cardClass = CARD;
  protected readonly rowClass = ROW;
  protected readonly riskTone = riskTone;
  protected readonly pill = procedurePill;
  protected readonly unit = withUnit;

  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly page = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.page : null;
  });
  protected readonly notFound = computed(() => {
    const s = this.state();
    return s.status === 'error' && s.notFound;
  });
  protected readonly canDraft = computed(() =>
    (this.org.currentOrg()?.permissions ?? []).includes('documents:draft'),
  );
  protected readonly crumbs = computed<readonly Breadcrumb[]>(() => [
    { labelKey: 'handbook.title', link: '/handbook' },
    { labelKey: 'handbook.process.breadcrumbMap', link: '/handbook' },
    { label: this.page()?.process.title ?? '' },
  ]);

  constructor() {
    providePageContext(() => {
      const p = this.page();
      return {
        module: 'processes',
        entityType: 'process',
        entityId: this.id() || null,
        view: 'detail',
        title: p ? `${p.process.code} ${p.process.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.org.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reload(): void {
    this.load(this.org.currentOrgId(), this.id());
  }

  private load(orgId: string | null, id: string): void {
    if (!orgId || !id) {
      return;
    }
    this.state.set({ status: 'loading' });
    this.api.page(orgId, id).subscribe({
      next: (page) => this.state.set({ status: 'ready', page }),
      error: (e: unknown) => {
        const status = (e as { status?: number } | null)?.status;
        this.state.set({ status: 'error', notFound: status === 404 || status === 422 });
      },
    });
  }

  protected ask(p: HandbookPage): void {
    this.askPanel.askAbout(
      this.language.translate('handbook.ask.prompt', { title: p.process.title }),
    );
  }

  /** "PRO-004 · Versjon B · godkjent mars". */
  protected versionLine(d: HandbookProcedure): string {
    const parts: string[] = [];
    if (d.code) {
      parts.push(d.code);
    }
    if (d.version && d.approved_at) {
      const month = new Intl.DateTimeFormat(bcp47ForLang(this.language.active()), {
        month: 'long',
        year: 'numeric',
      }).format(new Date(withUtcDefault(d.approved_at)));
      parts.push(
        this.language.translate('handbook.procedure.approvedIn', { rev: d.version, month }),
      );
    } else if (d.version) {
      parts.push(this.language.translate('handbook.procedure.version', { rev: d.version }));
    }
    return parts.join(' · ');
  }
}
