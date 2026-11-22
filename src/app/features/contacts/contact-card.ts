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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map } from 'rxjs';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LanguageService } from '../../core/i18n/language.service';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ReqPills } from '../../shared/requirement-links/req-pills';
import { Badge } from '../../shared/ui/badge/badge';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { Breadcrumb, PageHeader } from '../../shared/ui/page-header/page-header';
import { ContactsApi } from './data/contacts-api';
import {
  Phrase,
  badgeTone,
  daysUntil,
  formatOrgNumber,
  locationPhrase,
  noticePhrase,
  riskLevelKey,
  shortDate,
} from './data/contacts-format';
import {
  ContactAgreement,
  ContactCard as ContactCardData,
  ContactEvaluation,
  ContactRisk,
  ContactRole,
} from './data/contacts.models';

type Load = 'loading' | 'ready' | 'missing' | 'error';

interface EditLink {
  readonly role: ContactRole;
  readonly link: string;
}

/** Role -> write permission of its register (the "Rediger" menu). */
const WRITE: Record<ContactRole, string> = {
  customer: 'customers:write',
  supplier: 'suppliers:write',
  processor: 'privacy:write',
};

/**
 * The company card (`/contacts/:key`, IA v2 §5.7, prototype "leverandor"): one company
 * with every role combined. Breadcrumb Kontakter › name; role chips + status pill; a
 * status sentence; "Start evaluering" (supplier role) and "Rediger" (per role record).
 * Cards: Avtaler, Personopplysninger de behandler, Risiko, Evalueringer og hendelser and
 * Kunde, each with its requirement refs behind "Vis krav". The module records stay the
 * source of truth: every row and the footer link open them.
 */
@Component({
  selector: 'app-contact-card',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    ErrorState,
    LoadingState,
    MenuItem,
    OverflowMenu,
    PageHeader,
    ReqPills,
  ],
  viewProviders: [provideSharedScope('contacts')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1240px] px-4 py-7 sm:px-6" data-testid="contact-card">
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state bodyKey="contacts.card.error" (retry)="reload()" />
        }
        @case ('missing') {
          <div
            class="rounded-card border border-border bg-surface p-6"
            data-testid="contact-missing"
          >
            <p class="text-body text-fg">{{ 'contacts.card.notFound' | transloco }}</p>
            <a
              routerLink="/contacts"
              class="mt-3 inline-block font-semibold text-accent hover:underline"
              >{{ 'contacts.card.back' | transloco }} <span aria-hidden="true">→</span></a
            >
          </div>
        }
        @default {
          @if (card(); as c) {
            <app-page-header [title]="c.name" [breadcrumbs]="crumbs()">
              <div meta class="flex flex-wrap items-center gap-1.5" data-testid="contact-roles">
                @for (r of c.roles; track r) {
                  <app-badge>{{ 'contacts.roles.' + r | transloco }}</app-badge>
                }
                <app-badge [tone]="tone(c.status.tone)">{{
                  'contacts.status.' + c.status.key | transloco
                }}</app-badge>
                @if (c.org_number) {
                  <span class="text-meta text-fg-muted">{{
                    'contacts.card.orgLine' | transloco: { number: orgNo(c.org_number) }
                  }}</span>
                }
              </div>
              <p
                intro
                class="mt-3 max-w-[72ch] text-body text-fg [&_b]:font-semibold"
                data-testid="contact-sentence"
              >
                @if (c.sentence.purpose) {
                  <span>{{ c.sentence.purpose }} </span>
                }
                <span
                  [innerHTML]="
                    'contacts.card.sentence.' + c.sentence.key | transloco: sentenceParams()
                  "
                ></span>
              </p>
              @if (evaluateLink(); as link) {
                <a
                  primary
                  [routerLink]="link"
                  [queryParams]="{ newEvaluation: 1 }"
                  data-testid="contact-start-evaluation"
                  class="inline-flex h-9 items-center rounded-tile bg-accent px-4 text-ui font-semibold text-white hover:bg-accent-2"
                  >{{ 'contacts.card.startEvaluation' | transloco }}</a
                >
              }
              @if (editLinks().length === 1) {
                <a
                  secondary
                  [routerLink]="editLinks()[0].link"
                  data-testid="contact-edit"
                  class="inline-flex h-9 items-center rounded-tile border border-border bg-surface px-4 text-ui font-semibold text-fg hover:bg-surface-2"
                  >{{ 'contacts.card.edit' | transloco }}</a
                >
              } @else if (editLinks().length > 1) {
                <div secondary data-testid="contact-edit">
                  <app-overflow-menu [label]="'contacts.card.edit' | transloco" icon="pencil">
                    @for (e of editLinks(); track e.role) {
                      <a appMenuItem [routerLink]="e.link">{{
                        'contacts.card.editAs.' + e.role | transloco
                      }}</a>
                    }
                  </app-overflow-menu>
                </div>
              }
            </app-page-header>

            <div class="grid grid-cols-1 gap-4 min-[760px]:grid-cols-2">
              @if (c.visible.contracts || c.agreements.length) {
                <section
                  class="rounded-card border border-border bg-surface p-5"
                  data-testid="contact-agreements"
                >
                  <div class="mb-2 flex items-center justify-between gap-3">
                    <h2 class="font-display text-section font-semibold text-fg">
                      {{ 'contacts.card.agreements.title' | transloco }}
                    </h2>
                    @if (canAddContract()) {
                      <a
                        routerLink="/contracts/new"
                        class="text-ui font-semibold text-accent hover:underline"
                        >{{ 'contacts.card.add' | transloco }}</a
                      >
                    }
                  </div>
                  @if (c.agreements.length) {
                    <ul class="divide-y divide-border">
                      @for (a of c.agreements; track a.id) {
                        <li>
                          <a
                            [routerLink]="a.url"
                            class="flex items-center justify-between gap-3 py-2.5 hover:text-accent"
                          >
                            <span class="min-w-0">
                              <span class="block font-semibold text-fg [overflow-wrap:anywhere]">{{
                                a.title ?? ('contacts.card.agreements.dpa' | transloco)
                              }}</span>
                              @if (agreementLine(a); as parts) {
                                <span class="block text-meta text-fg-muted">
                                  @for (p of parts; track $index; let last = $last) {
                                    {{ p.key | transloco: p.params }}
                                    @if (!last) {
                                      ·
                                    }
                                  }
                                </span>
                              }
                            </span>
                            @if (agreementPill(a); as pill) {
                              <app-badge [tone]="tone(a.tone)">{{
                                pill.key | transloco: pill.params
                              }}</app-badge>
                            }
                          </a>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-ui text-fg-muted">
                      {{ 'contacts.card.agreements.empty' | transloco }}
                    </p>
                  }
                  <app-req-pills [refs]="refs('agreements')" />
                </section>
              }

              @if (c.visible.privacy || c.personal_data.length) {
                <section
                  class="rounded-card border border-border bg-surface p-5"
                  data-testid="contact-personal-data"
                >
                  <h2 class="mb-2 font-display text-section font-semibold text-fg">
                    {{ 'contacts.card.personalData.title' | transloco }}
                  </h2>
                  @if (c.personal_data.length) {
                    <ul class="divide-y divide-border">
                      @for (p of c.personal_data; track p.id) {
                        <li>
                          <a
                            [routerLink]="p.url"
                            class="flex items-center justify-between gap-3 py-2.5 hover:text-accent"
                          >
                            <span class="min-w-0 text-fg [overflow-wrap:anywhere]">{{
                              p.title
                            }}</span>
                            @if (location(p.country); as l) {
                              <span class="shrink-0 text-meta text-fg-muted">{{
                                l.key | transloco: l.params
                              }}</span>
                            }
                          </a>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-ui text-fg-muted">
                      {{ 'contacts.card.personalData.empty' | transloco }}
                    </p>
                  }
                  <app-req-pills [refs]="refs('personal_data')" />
                </section>
              }

              <section
                class="rounded-card border border-border bg-surface p-5"
                data-testid="contact-risks"
              >
                <h2 class="mb-2 font-display text-section font-semibold text-fg">
                  {{ 'contacts.card.risks.title' | transloco }}
                </h2>
                @if (c.risks.length) {
                  <ul class="divide-y divide-border">
                    @for (r of c.risks; track r.id) {
                      <li>
                        <a
                          [routerLink]="r.url"
                          class="flex items-center justify-between gap-3 py-2.5 hover:text-accent"
                        >
                          <span class="min-w-0 text-fg [overflow-wrap:anywhere]">{{
                            r.title
                          }}</span>
                          @if (r.level) {
                            <app-badge [tone]="tone(r.tone)">
                              @if (riskLevel(r); as lk) {
                                {{ lk | transloco }}
                              } @else {
                                {{ r.level }}
                              }
                              @if (r.after_treatment && r.tone === 'ok') {
                                {{ 'contacts.card.risks.afterTreatment' | transloco }}
                              }
                            </app-badge>
                          }
                        </a>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-ui text-fg-muted">{{ 'contacts.card.risks.empty' | transloco }}</p>
                }
                <app-req-pills [refs]="refs('risks')" />
              </section>

              <section
                class="rounded-card border border-border bg-surface p-5"
                data-testid="contact-evaluations"
              >
                <h2 class="mb-2 font-display text-section font-semibold text-fg">
                  {{ 'contacts.card.evaluations.title' | transloco }}
                </h2>
                @if (c.evaluations.length || c.incidents.length) {
                  <ul class="divide-y divide-border">
                    @for (e of c.evaluations; track e.id; let first = $first) {
                      <li>
                        <a
                          [routerLink]="e.url"
                          class="flex items-center justify-between gap-3 py-2.5 hover:text-accent"
                        >
                          <span class="min-w-0 text-fg [overflow-wrap:anywhere]"
                            >{{ e.title }} ·
                            <b class="font-semibold">{{ evaluationResult(e) | transloco }}</b></span
                          >
                          @if (first && nextEvaluation(); as n) {
                            <span class="shrink-0 text-meta text-fg-muted">{{
                              n.key | transloco: n.params
                            }}</span>
                          } @else if (e.date) {
                            <span class="shrink-0 text-meta text-fg-muted">{{ date(e.date) }}</span>
                          }
                        </a>
                      </li>
                    }
                    @for (i of c.incidents; track i.entity_type + i.id) {
                      <li>
                        <a
                          [routerLink]="i.url"
                          class="flex items-center justify-between gap-3 py-2.5 hover:text-accent"
                        >
                          <span class="min-w-0 text-fg [overflow-wrap:anywhere]">{{
                            'contacts.card.evaluations.incident' | transloco: { title: i.title }
                          }}</span>
                          <span class="shrink-0 text-meta text-fg-muted">{{
                            (i.open
                              ? 'contacts.card.evaluations.open'
                              : 'contacts.card.evaluations.closed'
                            ) | transloco
                          }}</span>
                        </a>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-ui text-fg-muted">
                    {{ 'contacts.card.evaluations.empty' | transloco }}
                  </p>
                }
                <app-req-pills [refs]="refs('evaluations')" />
              </section>

              @if (c.customer; as cu) {
                <section
                  class="rounded-card border border-border bg-surface p-5"
                  data-testid="contact-customer"
                >
                  <h2 class="mb-2 font-display text-section font-semibold text-fg">
                    {{ 'contacts.card.customer.title' | transloco }}
                  </h2>
                  <dl class="divide-y divide-border">
                    <div class="flex items-center justify-between gap-3 py-2.5">
                      <dt class="text-fg">
                        {{ 'contacts.card.customer.openComplaints' | transloco }}
                      </dt>
                      <dd>
                        @if (cu.open_complaints) {
                          <app-badge tone="warn">{{ cu.open_complaints }}</app-badge>
                        } @else {
                          <span class="text-meta text-fg-muted">{{
                            'contacts.card.customer.none' | transloco
                          }}</span>
                        }
                      </dd>
                    </div>
                    <div class="flex items-center justify-between gap-3 py-2.5">
                      <dt class="text-fg">{{ 'contacts.card.customer.projects' | transloco }}</dt>
                      <dd class="text-meta text-fg-muted">{{ cu.projects }}</dd>
                    </div>
                    @if (cu.satisfaction !== null) {
                      <div class="flex items-center justify-between gap-3 py-2.5">
                        <dt class="text-fg">
                          {{ 'contacts.card.customer.satisfaction' | transloco }}
                        </dt>
                        <dd class="text-meta text-fg-muted">
                          {{
                            'contacts.card.customer.satisfactionValue'
                              | transloco: { score: cu.satisfaction }
                          }}
                        </dd>
                      </div>
                    }
                  </dl>
                  @if (cu.customer_since) {
                    <p class="mt-1 text-meta text-fg-muted">
                      {{
                        'contacts.card.customer.since'
                          | transloco: { date: date(cu.customer_since) }
                      }}
                    </p>
                  }
                  <app-req-pills [refs]="refs('customer')" />
                </section>
              }
            </div>

            <nav
              class="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-ui"
              data-testid="contact-registers"
            >
              @for (r of registerLinks(); track r.role) {
                <a [routerLink]="r.link" class="font-semibold text-accent hover:underline"
                  >{{ 'contacts.card.registers.' + r.role | transloco }}
                  <span aria-hidden="true">→</span></a
                >
              }
            </nav>
          }
        }
      }
    </div>
  `,
})
export class ContactCard {
  private readonly api = inject(ContactsApi);
  private readonly org = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);
  private readonly language = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly key = toSignal(this.route.paramMap.pipe(map((p) => p.get('key') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('key') ?? '',
  });
  protected readonly state = signal<Load>('loading');
  protected readonly card = signal<ContactCardData | null>(null);
  private readonly permissions = computed(() => this.org.currentOrg()?.permissions ?? []);

  protected readonly crumbs = computed<readonly Breadcrumb[]>(() => [
    { labelKey: 'contacts.card.breadcrumb', link: '/contacts' },
    { label: this.card()?.name ?? '' },
  ]);

  protected readonly sentenceParams = computed(() => {
    const params = { ...(this.card()?.sentence.params ?? {}) };
    if (typeof params['date'] === 'string') {
      params['date'] = this.date(params['date']);
    }
    return params;
  });

  protected readonly evaluateLink = computed(() => {
    const c = this.card();
    const supplier = c?.links.supplier;
    return supplier && this.permissions().includes('suppliers:write') ? supplier : null;
  });

  protected readonly editLinks = computed<readonly EditLink[]>(() => {
    const c = this.card();
    if (!c) {
      return [];
    }
    const perms = this.permissions();
    const out: EditLink[] = [];
    for (const role of c.roles) {
      const link = c.links[role];
      if (link && perms.includes(WRITE[role])) {
        out.push({ role, link: `${link}/edit` });
      }
    }
    return out;
  });

  protected readonly registerLinks = computed<readonly EditLink[]>(() => {
    const c = this.card();
    if (!c) {
      return [];
    }
    return c.roles.map((role) => ({ role, link: c.links[role] ?? '' })).filter((r) => !!r.link);
  });

  protected readonly canAddContract = computed(
    () => this.permissions().includes('contracts:write') && this.modules.isEnabled('contracts'),
  );

  private sub?: Subscription;

  constructor() {
    effect(() => {
      const orgId = this.org.currentOrgId();
      const key = this.key();
      untracked(() => this.load(orgId, key));
    });
    this.destroyRef.onDestroy(() => this.sub?.unsubscribe());
  }

  protected tone = badgeTone;
  protected orgNo = formatOrgNumber;

  protected reload(): void {
    this.load(this.org.currentOrgId(), this.key());
  }

  protected refs(section: string): readonly string[] {
    return this.card()?.requirement_refs[section] ?? [];
  }

  protected date(iso: string | null | undefined): string {
    return shortDate(iso, this.language.locale());
  }

  protected agreementLine(a: ContactAgreement): readonly Phrase[] {
    const parts: Phrase[] = [];
    if (a.renews_at) {
      parts.push({
        key: 'contacts.card.agreements.renews',
        params: { date: this.date(a.renews_at) },
      });
      const notice = noticePhrase(a.notice_period_days);
      if (notice) {
        parts.push(notice);
      }
    } else if (a.signed_on) {
      parts.push({
        key: 'contacts.card.agreements.signed',
        params: { date: this.date(a.signed_on) },
      });
    }
    return parts;
  }

  /** The pill: days left to the notice deadline when soon, "Signert" for a DPA, else the status. */
  protected agreementPill(a: ContactAgreement): Phrase {
    if (a.days_to_notice !== null && a.days_to_notice <= 60) {
      return { key: 'contacts.card.agreements.days', params: { days: a.days_to_notice } };
    }
    if (a.kind === 'dpa' && a.status === 'active') {
      return { key: 'contacts.card.agreements.signedPill' };
    }
    return { key: `contacts.contractStatus.${a.status}` };
  }

  protected location(country: string | null): Phrase | null {
    return locationPhrase(country, (code) => {
      try {
        return new Intl.DisplayNames([this.language.locale()], { type: 'region' }).of(code) ?? code;
      } catch {
        return code;
      }
    });
  }

  protected riskLevel(r: ContactRisk): string | null {
    return riskLevelKey(r.level);
  }

  protected evaluationResult(e: ContactEvaluation): string {
    if (e.result && ['approved', 'conditional', 'rejected'].includes(e.result)) {
      return `contacts.card.evaluations.result.${e.result}`;
    }
    return 'contacts.card.evaluations.result.pending';
  }

  protected readonly nextEvaluation = computed<Phrase | null>(() => {
    const due = this.card()?.next_evaluation_at;
    const days = daysUntil(due);
    if (!due || days === null) {
      return null;
    }
    return days >= 0 && days <= 60
      ? { key: 'contacts.card.evaluations.nextIn', params: { days } }
      : { key: 'contacts.card.evaluations.next', params: { date: this.date(due) } };
  });

  private load(orgId: string | null, key: string): void {
    this.sub?.unsubscribe();
    if (!orgId || !key) {
      return;
    }
    this.state.set('loading');
    this.sub = this.api.card(orgId, key).subscribe({
      next: (card) => {
        this.card.set(card);
        this.state.set('ready');
      },
      error: (err: { status?: number }) => {
        this.card.set(null);
        this.state.set(err?.status === 404 || err?.status === 422 ? 'missing' : 'error');
      },
    });
  }
}
