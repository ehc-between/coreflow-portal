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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription, catchError, map, of, switchMap } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { bcp47ForLang } from '../../core/i18n/locale';
import { OrgProfile } from '../../core/modules/module.models';
import { ModulesApi } from '../../core/modules/modules-api';
import { Badge } from '../../shared/ui/badge/badge';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { AuditsApi } from '../audits/data/audits-api';
import { frameworkShortKey } from '../dashboard/data/home-format';
import { DocumentControlApi } from '../documents/data/document-control-api';
import { PeopleApi } from '../people/data/people-api';
import { CONTEXT_STARTER, companyTiles, topicTiles } from './company-tiles';
import {
  COMPANY_MODULES,
  actionsFor,
  countFor,
  frameworksInScope,
  isCeoTitle,
  monthYear,
  nextExternalAudit,
  profileFacts,
} from './hub-kit/hub-data';
import { HubLoader } from './hub-kit/hub-loader';
import { provideHubsScope } from './hub-kit/hub-scope';
import { BTN_PRIMARY, BTN_SECONDARY, EYEBROW, LINK, PAGE } from './hub-kit/hub-styles';
import { HubTiles } from './hub-kit/hub-tiles';

/**
 * Bedriften (`/company`, docs/ia-v2.md §5.4, prototype `bedriften`): the company on
 * one page. A header card with the profile facts and four key facts, the "Alt om
 * bedriften" cards (one door per register, with counts), and the Fagområder
 * (privacy, IT, AI, environment, continuity). Every card hides when its module is off.
 */
@Component({
  selector: 'app-company-page',
  imports: [RouterLink, TranslocoPipe, Badge, ErrorState, HubTiles, LoadingState],
  viewProviders: [provideHubsScope()],
  providers: [HubLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page">
      <section
        class="mb-[22px] rounded-card border border-border bg-surface p-5"
        data-testid="company-header"
      >
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div class="min-w-0 flex-1 basis-[min(100%,420px)]">
            <span [class]="eyebrow">{{ 'hubs.company.eyebrow' | transloco }}</span>
            <h1
              class="mt-1 font-display text-page font-bold text-fg [overflow-wrap:anywhere]"
              data-testid="page-title"
            >
              {{ hub.orgName() }}
            </h1>
            @if (facts().length) {
              <p class="mt-1.5 max-w-[62ch] text-body text-fg-muted" data-testid="company-facts">
                {{ facts().join(' · ') }}
              </p>
            }
          </div>
          @if (hub.can('org:manage')) {
            <a routerLink="/settings/profile" [class]="btnSecondary" data-testid="company-edit">
              {{ 'hubs.company.editProfile' | transloco }}
            </a>
          }
        </div>
        <dl class="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-5 gap-y-3.5">
          <div>
            <dt [class]="eyebrow">{{ 'hubs.company.kv.standards' | transloco }}</dt>
            <dd class="mt-1 text-body text-fg" data-testid="company-standards">
              @for (fw of frameworks(); track fw; let last = $last) {
                {{ shortKey(fw) | transloco }}{{ last ? '' : ' · ' }}
              } @empty {
                <span class="text-fg-muted">{{ 'hubs.company.kv.notSet' | transloco }}</span>
              }
            </dd>
          </div>
          @if (hub.enabled('people') && hub.can('people:read')) {
            <div>
              <dt [class]="eyebrow">{{ 'hubs.company.kv.ceo' | transloco }}</dt>
              <dd class="mt-1 text-body text-fg" data-testid="company-ceo">
                @if (ceo(); as name) {
                  {{ name }}
                } @else {
                  <span class="text-fg-muted">{{ 'hubs.company.kv.notSet' | transloco }}</span>
                }
              </dd>
            </div>
          }
          @if (hub.enabled('audits') && hub.can('audits:read')) {
            <div>
              <dt [class]="eyebrow">{{ 'hubs.company.kv.nextAudit' | transloco }}</dt>
              <dd class="mt-1 text-body text-fg" data-testid="company-next-audit">
                @if (nextAudit(); as audit) {
                  <a
                    routerLink="/audits/certifications"
                    class="text-fg no-underline hover:underline"
                  >
                    {{ shortKey(audit.framework) | transloco }} · {{ audit.when }}
                  </a>
                } @else {
                  <span class="text-fg-muted">{{ 'hubs.company.kv.notSet' | transloco }}</span>
                }
              </dd>
            </div>
          }
          <div>
            <dt [class]="eyebrow">{{ 'hubs.company.kv.attention' | transloco }}</dt>
            <dd class="mt-1" data-testid="company-attention">
              @if (attention() > 0) {
                <app-badge tone="warn">{{
                  'hubs.common.things' | transloco: { count: attention() }
                }}</app-badge>
              } @else {
                <app-badge tone="pass">{{ 'hubs.common.onTrack' | transloco }}</app-badge>
              }
            </dd>
          </div>
        </dl>
      </section>

      @switch (hub.state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="hub.reload()" />
        }
        @default {
          @if (showStarter()) {
            <section
              class="mb-[22px] flex flex-wrap items-center justify-between gap-4 rounded-card border border-accent-border bg-accent-soft p-5"
              data-testid="company-starter"
            >
              <div class="min-w-0 flex-1 basis-[min(100%,420px)]">
                <h2 class="text-section font-semibold text-fg">
                  {{ 'hubs.company.start.title' | transloco }}
                </h2>
                <p class="mt-1 text-body text-fg-muted">
                  {{ 'hubs.company.start.body' | transloco }}
                </p>
              </div>
              <a routerLink="/context/interview" [class]="btnPrimary">
                {{ 'hubs.company.start.cta' | transloco }}
              </a>
            </section>
          }

          @if (tiles().length) {
            <section class="mb-8" data-testid="company-hub">
              <div class="mb-4">
                <h2 class="font-display text-section font-semibold text-fg">
                  {{ 'hubs.company.hubTitle' | transloco }}
                </h2>
                <p class="mt-1.5 max-w-[62ch] text-body text-fg-muted">
                  {{ 'hubs.company.hubIntro' | transloco }}
                </p>
              </div>
              <app-hub-tiles [tiles]="tiles()" />
              <p class="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 text-ui" data-testid="company-links">
                @if (hub.enabled('context')) {
                  <a routerLink="/context/responsibilities/matrix" [class]="link">{{
                    'hubs.company.links.matrix' | transloco
                  }}</a>
                  <a routerLink="/context/analyses" [class]="link">{{
                    'hubs.company.links.analyses' | transloco
                  }}</a>
                }
                @if (hub.can('org:manage')) {
                  <a routerLink="/settings/departments" [class]="link">{{
                    'hubs.company.links.departments' | transloco
                  }}</a>
                }
                @if (hub.enabled('context') && hub.can('context:write') && !showStarter()) {
                  <a routerLink="/context/interview" [class]="link">{{
                    'hubs.company.links.interview' | transloco
                  }}</a>
                }
              </p>
            </section>
          }

          @if (topics().length) {
            <section data-testid="company-topics">
              <div class="mb-4">
                <h2 class="font-display text-section font-semibold text-fg">
                  <a routerLink="/company/topics" class="text-fg no-underline hover:underline">{{
                    'hubs.topics.title' | transloco
                  }}</a>
                </h2>
                <p class="mt-1.5 max-w-[62ch] text-body text-fg-muted">
                  {{ 'hubs.topics.intro' | transloco }}
                </p>
              </div>
              <app-hub-tiles [tiles]="topics()" />
            </section>
          }
        }
      }
    </div>
  `,
})
export class CompanyPage {
  protected readonly hub = inject(HubLoader);
  private readonly modulesApi = inject(ModulesApi);
  private readonly audits = inject(AuditsApi);
  private readonly people = inject(PeopleApi);
  private readonly documents = inject(DocumentControlApi);
  private readonly language = inject(LanguageService);

  protected readonly page = PAGE;
  protected readonly eyebrow = EYEBROW;
  protected readonly btnPrimary = BTN_PRIMARY;
  protected readonly btnSecondary = BTN_SECONDARY;
  protected readonly link = LINK;
  protected readonly shortKey = frameworkShortKey;

  private readonly profile = signal<OrgProfile | null>(null);
  protected readonly ceo = signal<string | null>(null);
  private readonly certs = signal<
    readonly {
      framework: string;
      status: string;
      next_surveillance_at?: string | null;
      expires_at?: string | null;
    }[]
  >([]);
  private readonly policyCount = signal<number | null>(null);
  private subs: Subscription[] = [];

  private readonly locale = computed(() => bcp47ForLang(this.language.active()));

  protected readonly facts = computed(() => {
    const profile = this.profile();
    if (!profile) {
      return [];
    }
    return profileFacts(
      profile,
      (key, params) => this.language.translate(key, params),
      this.locale(),
    );
  });

  protected readonly frameworks = computed(() => {
    const profile = this.profile();
    return profile ? frameworksInScope(profile) : [];
  });

  protected readonly nextAudit = computed(() => {
    const next = nextExternalAudit(this.certs());
    return next ? { framework: next.framework, when: monthYear(next.date, this.locale()) } : null;
  });

  protected readonly attention = computed(
    () => actionsFor(this.hub.actions(), COMPANY_MODULES).length,
  );

  protected readonly tiles = computed(() => companyTiles(this.hub.counts(), this.policyCount()));
  protected readonly topics = computed(() => topicTiles(this.hub.counts(), this.hub.actions()));

  /** An org with no context yet: offer the four-question interview up front. */
  protected readonly showStarter = computed(
    () =>
      this.hub.enabled('context') &&
      this.hub.can('context:write') &&
      countFor(this.hub.counts(), CONTEXT_STARTER) === 0,
  );

  constructor() {
    effect(() => {
      const orgId = this.hub.orgId();
      // Re-evaluated when modules load or permissions change.
      const wants = {
        audits: this.hub.enabled('audits') && this.hub.can('audits:read'),
        people: this.hub.enabled('people') && this.hub.can('people:read'),
        documents: this.hub.enabled('documents') && this.hub.can('documents:read'),
      };
      untracked(() => this.loadFacts(orgId, wants));
    });
    inject(DestroyRef).onDestroy(() => this.subs.forEach((s) => s.unsubscribe()));
  }

  private loadFacts(
    orgId: string | null,
    wants: { audits: boolean; people: boolean; documents: boolean },
  ): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.profile.set(null);
    this.ceo.set(null);
    this.certs.set([]);
    this.policyCount.set(null);
    if (!orgId) {
      return;
    }
    const quiet = <T>(source: Observable<T>, fallback: T) =>
      source.pipe(catchError(() => of(fallback)));
    this.subs = [
      quiet(this.modulesApi.getProfile(orgId), null).subscribe((p) => this.profile.set(p)),
    ];
    if (wants.audits) {
      this.subs.push(
        quiet(this.audits.listCertifications(orgId).pipe(map((res) => res.items)), []).subscribe(
          (items) => this.certs.set(items),
        ),
      );
    }
    if (wants.people) {
      this.subs.push(
        quiet(
          this.people.listPositions(orgId).pipe(
            map((page) => page.items.find((p) => isCeoTitle(p.title)) ?? null),
            switchMap((position) =>
              position
                ? this.people
                    .listEmployees(orgId, { position_id: position.id, limit: 5 })
                    .pipe(map((page) => page.items[0]?.full_name ?? null))
                : of(null),
            ),
          ),
          null,
        ).subscribe((name) => this.ceo.set(name)),
      );
    }
    if (wants.documents) {
      this.subs.push(
        quiet(
          this.documents
            .listTypes(orgId)
            .pipe(map((types) => types.find((t) => t.key === 'policy')?.document_count ?? null)),
          null,
        ).subscribe((count) => this.policyCount.set(count)),
      );
    }
  }
}
