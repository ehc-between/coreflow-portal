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
import { toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ContinuityApi } from '../data/continuity-api';
import { telHref, todayIso } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { Contact, PlanRef } from '../data/continuity.models';
import { ContinuityContactsPanel } from '../shared/contacts-panel';
import { CONTINUITY_NAV, saveFile, sectionCrumbs } from '../shared/continuity-page';

const MIN_QUERY = 2;

interface PlanGroup {
  readonly plan: PlanRef;
  readonly contacts: readonly Contact[];
}

/** Contacts on plan lists, grouped by plan in list order. */
export function groupByPlan(contacts: readonly Contact[]): PlanGroup[] {
  const groups = new Map<string, { plan: PlanRef; contacts: Contact[] }>();
  for (const c of contacts) {
    if (!c.plan_id) {
      continue;
    }
    const plan: PlanRef = c.plan ?? {
      id: c.plan_id,
      code: '',
      title: '',
      url: `/continuity/plans/${c.plan_id}`,
    };
    const group = groups.get(plan.id) ?? { plan, contacts: [] };
    group.contacts.push(c);
    groups.set(plan.id, group);
  }
  return [...groups.values()];
}

/**
 * The crisis contacts (`/continuity/contacts`): the org-wide list (crisis team,
 * authorities, emergency services, key suppliers), kept verified at least yearly;
 * the contacts that sit on each plan's own list; a search over every list ("who do
 * I call?"); and a printable PDF of all lists for when the systems are down.
 */
@Component({
  selector: 'app-continuity-contacts-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    ContinuityContactsPanel,
    EmptyState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="continuity.nav.contacts"
        descriptionKey="continuity.contacts.subtitle"
        [breadcrumbs]="crumbs"
      >
        <app-button
          secondary
          variant="secondary"
          appTourStep="continuity-contacts-pdf"
          [loading]="exporting()"
          (click)="exportPdf()"
          data-testid="contacts-pdf"
        >
          <app-icon name="documents" [size]="14" />
          {{ 'continuity.contacts.exportPdf' | transloco }}
        </app-button>
      </app-page-header>
      <app-module-nav
        labelKey="continuity.nav.label"
        [items]="nav"
        appTourStep="continuity-sections"
      />
      <app-help-strip scope="continuity" page="contacts" tour="contacts" lesson="crisis-contacts" />

      <div class="mb-5" appTourStep="continuity-contacts-search">
        <label for="cc-search" class="mb-1.5 block text-ui font-semibold text-fg-muted">
          {{ 'continuity.contacts.searchLabel' | transloco }}
        </label>
        <div
          class="flex h-10 max-w-[560px] items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
        >
          <app-icon name="search" [size]="16" class="text-fg-subtle" />
          <input
            id="cc-search"
            type="search"
            class="h-full flex-1 bg-transparent text-ui text-fg outline-none"
            [placeholder]="'continuity.contacts.searchPlaceholder' | transloco"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            data-testid="contacts-search"
          />
        </div>
        @if (searching()) {
          <div class="mt-3" aria-live="polite">
            @if (searchState() === 'loading') {
              <app-loading-state [rows]="2" />
            } @else if (results().length === 0) {
              <p class="text-ui text-fg-muted">{{ 'continuity.contacts.noHits' | transloco }}</p>
            } @else {
              <app-card [padded]="false">
                <ul class="divide-y divide-border" data-testid="contact-hits">
                  @for (c of results(); track c.id) {
                    <li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-ui">
                      <span class="font-semibold text-fg">{{ c.name }}</span>
                      @if (c.crisis_role) {
                        <span class="text-fg-muted">{{ c.crisis_role }}</span>
                      }
                      @if (tel(c.phone); as href) {
                        <a [href]="href" class="text-accent hover:underline">{{ c.phone }}</a>
                      }
                      @if (c.plan; as plan) {
                        <a
                          [routerLink]="plan.url"
                          [queryParams]="{ tab: 'contacts' }"
                          class="text-meta text-fg-subtle hover:underline"
                        >
                          {{
                            'continuity.contacts.onPlan'
                              | transloco: { code: plan.code, title: plan.title }
                          }}
                        </a>
                      } @else {
                        <span class="text-meta text-fg-subtle">{{
                          'continuity.contacts.onOrgList' | transloco
                        }}</span>
                      }
                    </li>
                  }
                </ul>
              </app-card>
            }
          </div>
        }
      </div>

      <app-continuity-contacts-panel [canEdit]="canWrite()" (changed)="loadPlans()" />

      <section class="mt-6" data-testid="plan-contacts">
        <h2 class="mb-1 font-display text-section font-bold text-fg">
          {{ 'continuity.contacts.inPlansTitle' | transloco }}
        </h2>
        <p class="mb-3 max-w-[72ch] text-body text-fg-muted">
          {{ 'continuity.contacts.inPlansIntro' | transloco }}
        </p>
        @if (planState() === 'loading') {
          <app-loading-state [rows]="2" />
        } @else if (planGroups().length === 0) {
          <app-empty-state icon="people" titleKey="continuity.contacts.inPlansEmpty" />
        } @else {
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            @for (group of planGroups(); track group.plan.id) {
              <app-card>
                <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <a
                    [routerLink]="group.plan.url"
                    class="text-card font-semibold text-fg hover:underline"
                  >
                    <span class="font-mono text-meta text-fg-muted">{{ group.plan.code }}</span>
                    {{ group.plan.title }}
                  </a>
                  <a
                    [routerLink]="group.plan.url"
                    [queryParams]="{ tab: 'contacts' }"
                    class="text-meta font-semibold text-accent hover:underline"
                    >{{ 'continuity.contacts.openPlanList' | transloco }}</a
                  >
                </div>
                <ul class="flex flex-col gap-1.5">
                  @for (c of group.contacts; track c.id) {
                    <li class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-ui">
                      <span class="font-semibold text-fg">{{ c.name }}</span>
                      @if (c.crisis_role) {
                        <span class="text-fg-muted">{{ c.crisis_role }}</span>
                      }
                      @if (tel(c.phone); as href) {
                        <a [href]="href" class="text-accent hover:underline">{{ c.phone }}</a>
                      }
                      @if (c.needs_verification) {
                        <app-badge tone="warn">{{
                          'continuity.contacts.needsVerification' | transloco
                        }}</app-badge>
                      }
                    </li>
                  }
                </ul>
              </app-card>
            }
          </div>
        }
      </section>

      <div class="mt-8">
        <app-why-it-matters scope="continuity" page="contacts" />
      </div>
    </div>
  `,
})
export class ContinuityContactsPage {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  protected readonly nav = CONTINUITY_NAV;
  protected readonly crumbs = sectionCrumbs('contacts');
  protected readonly tel = telHref;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('continuity:write'),
  );

  protected readonly query = signal('');
  protected readonly searching = computed(() => this.query().trim().length >= MIN_QUERY);
  protected readonly searchState = signal<'loading' | 'ready'>('ready');
  protected readonly results = signal<readonly Contact[]>([]);
  protected readonly planState = signal<'loading' | 'ready'>('loading');
  protected readonly planGroups = signal<readonly PlanGroup[]>([]);
  protected readonly exporting = signal(false);

  private planRequest = new Subscription();
  private searchRequest = new Subscription();

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.planRequest.unsubscribe();
      this.searchRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'continuity_contact',
      view: 'list',
      title: this.language.translate('continuity.nav.contacts'),
    }));
    effect(() => {
      this.selectedOrg.currentOrgId();
      untracked(() => this.loadPlans());
    });
    const sub = toObservable(this.query)
      .pipe(debounceTime(250), distinctUntilChanged())
      .subscribe((q) => this.search(q.trim()));
    destroy.onDestroy(() => sub.unsubscribe());
  }

  protected loadPlans(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.planRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.planRequest = this.api.listContacts(orgId, 'all').subscribe({
      next: (items) => {
        this.planGroups.set(groupByPlan(items));
        this.planState.set('ready');
      },
      error: () => {
        this.planGroups.set([]);
        this.planState.set('ready');
      },
    });
  }

  protected exportPdf(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api.exportContactsPdf(orgId, this.language.active()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveFile(
          blob,
          `${this.language.translate('continuity.contacts.fileName')}-${todayIso()}.pdf`,
        );
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  private search(q: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.searchRequest.unsubscribe();
    if (!orgId || q.length < MIN_QUERY) {
      this.results.set([]);
      return;
    }
    this.searchState.set('loading');
    this.searchRequest = this.api.searchContacts(orgId, q).subscribe({
      next: (items) => {
        this.results.set(items);
        this.searchState.set('ready');
      },
      error: () => {
        this.results.set([]);
        this.searchState.set('ready');
      },
    });
  }
}
