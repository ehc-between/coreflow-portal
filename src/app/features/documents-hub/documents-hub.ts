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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription, catchError, map, of } from 'rxjs';
import { DocumentSummary } from '../../core/documents/document.models';
import { ApiService } from '../../core/http/api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { bcp47ForLang } from '../../core/i18n/locale';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { TasksApi } from '../../core/tasks/tasks-api';
import { ReqPills } from '../../shared/requirement-links/req-pills';
import { Badge } from '../../shared/ui/badge/badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { HubTile, countFor, monthYear } from '../company/hub-kit/hub-data';
import { HubLoader } from '../company/hub-kit/hub-loader';
import { provideHubsScope } from '../company/hub-kit/hub-scope';
import { BTN_PRIMARY, BTN_SECONDARY, LINK, PAGE } from '../company/hub-kit/hub-styles';
import { HubTiles } from '../company/hub-kit/hub-tiles';
import { clauseLabel } from '../dashboard/data/home-format';
import { DocumentControlApi } from '../documents/data/document-control-api';
import { DocumentType } from '../documents/data/document-control.models';
import { documentTypeName } from '../documents/document-status';
import {
  STATUS_TONE,
  SYSTEM_TYPES,
  TypeFlag,
  isWaitingDocument,
  kindMatches,
  nonHandbookDocuments,
  requirementLabels,
  reviewCell,
  sortDocuments,
} from './documents-hub-data';

/** Rows in the hub's table; the rest is one click away in "Alle dokumenter". */
const TABLE_ROWS = 20;

type State = 'loading' | 'error' | 'ready';

/**
 * Dokumenter (`/documents`, docs/ia-v2.md §5.6, prototype `dokumenter`): everything
 * that is not a work procedure. Six doors with counts (Policyer, Planer, Maler,
 * Eksterne dokumenter, Arkiv, Venter på deg), then the documents themselves with
 * status and next review. Procedures are in Håndbok (decision D9): the list asks
 * for `handbook=false` and also drops procedure types itself on older backends.
 */
@Component({
  selector: 'app-documents-hub',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    EmptyState,
    ErrorState,
    HubTiles,
    LoadingState,
    PageHeader,
    ReqPills,
  ],
  viewProviders: [provideHubsScope()],
  providers: [HubLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page">
      <app-page-header titleKey="hubs.documents.title">
        <p intro class="mt-1.5 max-w-[62ch] text-body text-fg-muted">
          {{ 'hubs.documents.introBefore' | transloco
          }}<a routerLink="/handbook" [class]="link">{{ 'hubs.documents.introLink' | transloco }}</a
          >{{ 'hubs.documents.introAfter' | transloco }}
        </p>
        @if (canDraft()) {
          <a secondary routerLink="/documents/external/new" [class]="btnSecondary">
            {{ 'hubs.documents.addExternal' | transloco }}
          </a>
        }
        @if (canDraft()) {
          <a primary routerLink="/documents/new" [class]="btnPrimary" data-testid="documents-new">
            {{ 'hubs.documents.newDocument' | transloco }}
          </a>
        }
      </app-page-header>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          <div class="mb-[22px]">
            @if (readable()) {
              <app-hub-tiles [tiles]="tiles()" />
            }
            @if (otherPlans().continuity !== null || otherPlans().emergency !== null) {
              <p
                class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-ui text-fg-muted"
                data-testid="documents-other-plans"
              >
                <span>{{ 'hubs.documents.otherPlans' | transloco }}</span>
                @if (otherPlans().continuity; as count) {
                  <a routerLink="/continuity/plans" [class]="link">{{
                    'hubs.documents.continuityPlans' | transloco: { count }
                  }}</a>
                }
                @if (otherPlans().emergency; as count) {
                  <a routerLink="/environment/emergency-plans" [class]="link">{{
                    'hubs.documents.emergencyPlans' | transloco: { count }
                  }}</a>
                }
              </p>
            }
          </div>

          @if (rows().length) {
            <div class="overflow-x-auto rounded-card border border-border bg-surface">
              <table class="w-full border-collapse text-body" data-testid="documents-table">
                <caption class="sr-only">
                  {{
                    'hubs.documents.table.label' | transloco
                  }}
                </caption>
                <thead>
                  <tr
                    class="border-b border-border text-left text-meta font-semibold text-fg-muted"
                  >
                    <th scope="col" class="px-4 py-3">
                      {{ 'hubs.documents.table.document' | transloco }}
                    </th>
                    <th scope="col" class="hidden px-4 py-3 sm:table-cell">
                      {{ 'hubs.documents.table.type' | transloco }}
                    </th>
                    <th scope="col" class="px-4 py-3">
                      {{ 'hubs.documents.table.status' | transloco }}
                    </th>
                    <th scope="col" class="hidden px-4 py-3 md:table-cell">
                      {{ 'hubs.documents.table.nextReview' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.id) {
                    <tr
                      class="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2"
                      (click)="open(row.id)"
                      data-testid="documents-row"
                    >
                      <td class="px-4 py-3 align-top">
                        <a
                          [routerLink]="['/documents', row.id]"
                          class="font-semibold text-fg no-underline hover:underline [overflow-wrap:anywhere]"
                          (click)="$event.stopPropagation()"
                          >{{ row.title }}</a
                        >
                        <span class="block text-ui text-fg-muted">
                          {{ row.sub }}
                          <span class="sm:hidden"> · {{ row.typeName }}</span>
                        </span>
                        <app-req-pills [refs]="row.refs" />
                      </td>
                      <td class="hidden px-4 py-3 align-top text-fg sm:table-cell">
                        {{ row.typeName }}
                      </td>
                      <td class="px-4 py-3 align-top">
                        <app-badge [tone]="row.tone">{{ row.statusKey | transloco }}</app-badge>
                      </td>
                      <td class="hidden px-4 py-3 align-top md:table-cell">
                        @switch (row.review.kind) {
                          @case ('pill') {
                            <app-badge [tone]="row.reviewTone">{{
                              row.reviewKey | transloco: { count: row.reviewCount }
                            }}</app-badge>
                          }
                          @case ('month') {
                            <span class="text-fg-muted">{{ row.reviewMonth }}</span>
                          }
                          @default {
                            <span class="text-fg-subtle">–</span>
                          }
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-ui">
              <a routerLink="/documents/all" [class]="link" data-testid="documents-all">{{
                'hubs.documents.allDocuments' | transloco
              }}</a>
            </p>
          } @else {
            <app-empty-state
              icon="documents"
              titleKey="hubs.documents.emptyTitle"
              bodyKey="hubs.documents.emptyBody"
              [ctaKey]="canDraft() ? 'hubs.documents.newDocument' : null"
              ctaLink="/documents/new"
            />
          }

          <p class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-ui" data-testid="documents-links">
            @if (readable()) {
              <a routerLink="/documents/register" [class]="link">{{
                'hubs.documents.links.register' | transloco
              }}</a>
            }
            @if (hub.can('documents:distribute')) {
              <a routerLink="/documents/campaigns" [class]="link">{{
                'hubs.documents.links.campaigns' | transloco
              }}</a>
            }
            @if (hub.can('documents:approve')) {
              <a routerLink="/documents/read-confirm" [class]="link">{{
                'hubs.documents.links.readConfirm' | transloco
              }}</a>
            }
          </p>
        }
      }
    </div>
  `,
})
export class DocumentsHub {
  protected readonly hub = inject(HubLoader);
  private readonly api = inject(ApiService);
  private readonly control = inject(DocumentControlApi);
  private readonly outputs = inject(OutputsApi);
  private readonly tasks = inject(TasksApi);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly page = PAGE;
  protected readonly btnPrimary = BTN_PRIMARY;
  protected readonly btnSecondary = BTN_SECONDARY;
  protected readonly link = LINK;

  private readonly docState = signal<State>('loading');
  private readonly documents = signal<readonly DocumentSummary[]>([]);
  private readonly types = signal<readonly (DocumentType & TypeFlag)[]>([]);
  private readonly archived = signal<number | null>(null);
  private readonly waiting = signal<number | null>(null);
  private subs: Subscription[] = [];

  protected readonly canDraft = computed(
    () => this.hub.enabled('documents') && this.hub.can('documents:draft'),
  );

  /** Documents first; the counts of the other doors fill in when they arrive. */
  protected readonly state = this.docState.asReadonly();

  private readonly visible = computed(() =>
    sortDocuments(nonHandbookDocuments(this.documents(), this.types())),
  );

  protected readonly otherPlans = computed(() => ({
    continuity: countFor(this.hub.counts(), ['continuity.plans']),
    emergency: countFor(this.hub.counts(), ['environment.emergency_plans']),
  }));

  protected readonly tiles = computed<HubTile[]>(() => {
    const docs = this.visible();
    const counts = this.hub.counts();
    const of = (kind: string) => docs.filter((d) => kindMatches(d.type, kind)).length;
    const tile = (
      key: string,
      count: number | null,
      link: string,
      query?: Record<string, string>,
    ): HubTile => ({
      key,
      labelKey: `hubs.documents.tiles.${key}.label`,
      hintKey: `hubs.documents.tiles.${key}.hint`,
      count,
      link,
      query,
    });
    return [
      tile('policies', of('policy'), '/documents/all', { kind: 'policy' }),
      tile('plans', of('plan'), '/documents/all', { kind: 'plan' }),
      tile('templates', countFor(counts, ['documents.templates']), '/documents/templates'),
      tile('external', countFor(counts, ['documents.external']), '/documents/external'),
      tile('archive', this.archived(), '/documents/archive'),
      tile('waiting', this.waiting(), '/documents/waiting'),
    ];
  });

  protected readonly rows = computed(() => {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const locale = bcp47ForLang(this.language.active());
    return this.visible()
      .slice(0, TABLE_ROWS)
      .map((doc) => {
        const review = reviewCell(doc.next_review_at);
        const sub = [
          doc.doc_code,
          doc.current_rev != null ? t('hubs.documents.version', { rev: doc.current_rev }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          id: doc.id,
          title: doc.title,
          sub,
          typeName: this.typeName(doc, t),
          statusKey: `hubs.documents.status.${doc.status}`,
          tone: STATUS_TONE[doc.status] ?? 'neutral',
          refs: requirementLabels(doc.requirement_links?.refs, (ref) => clauseLabel(ref, t)),
          review,
          reviewTone: review.kind === 'pill' ? review.tone : 'neutral',
          reviewKey: review.kind === 'pill' ? review.key : '',
          reviewCount: review.kind === 'pill' ? review.count : undefined,
          reviewMonth: review.kind === 'month' ? monthYear(review.iso, locale) : '',
        };
      });
  });

  /** The documents module is on and the user may read it (the hub itself is unguarded). */
  protected readonly readable = computed(
    () => this.hub.enabled('documents') && this.hub.can('documents:read'),
  );

  constructor() {
    effect(() => {
      const orgId = this.hub.orgId();
      // Re-evaluated when modules load or permissions change.
      const readable = this.readable();
      untracked(() => this.load(readable ? orgId : null));
    });
    inject(DestroyRef).onDestroy(() => this.subs.forEach((s) => s.unsubscribe()));
  }

  /** The type's name; record-made documents (process, scope, context analysis) named here. */
  private typeName(doc: DocumentSummary, t: (key: string) => string): string {
    if (doc.type_name) {
      return doc.type_name;
    }
    if ((SYSTEM_TYPES as readonly string[]).includes(doc.type)) {
      return t(`hubs.documents.systemTypes.${doc.type}`);
    }
    return documentTypeName(doc, this.types());
  }

  protected open(id: string): void {
    void this.router.navigate(['/documents', id]);
  }

  protected reload(): void {
    this.load(this.readable() ? this.hub.orgId() : null);
  }

  private load(orgId: string | null): void {
    this.subs.forEach((s) => s.unsubscribe());
    if (!orgId) {
      this.documents.set([]);
      this.docState.set('ready');
      return;
    }
    if (!this.documents().length) {
      this.docState.set('loading');
    }
    const quiet = <T>(source: Observable<T>, fallback: T) =>
      source.pipe(catchError(() => of(fallback)));
    this.subs = [
      // `handbook=false` (cf230): only documents that are not work procedures.
      this.api
        .get<DocumentSummary[]>(`v1/orgs/${orgId}/documents`, { params: { handbook: 'false' } })
        .subscribe({
          next: (docs) => {
            this.documents.set(docs);
            this.docState.set('ready');
          },
          error: () => this.docState.set('error'),
        }),
      quiet(this.control.listTypes(orgId), []).subscribe((types) => this.types.set(types)),
      quiet(
        this.outputs.generated(orgId, { limit: 1 }).pipe(map((list) => list.total)),
        null,
      ).subscribe((total) => this.archived.set(total)),
      quiet(
        this.tasks
          .myWork(orgId, { module: 'documents' })
          .pipe(map((res) => res.items.filter(isWaitingDocument).length)),
        null,
      ).subscribe((count) => this.waiting.set(count)),
    ];
  }
}
