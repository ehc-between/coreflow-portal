import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { DocumentSearchResult } from '../../../core/documents/document.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { AiGovernanceSettings, LITERACY_SCOPES, LiteracyScope } from '../data/ai-governance.models';
import { AI_GOVERNANCE_MODULE } from '../data/ai-governance-display';
import { AiField } from '../ui/ai-field';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiUserSelect } from '../ui/user-select';

/** Clamp a months value to `[min, max]` (non-numbers fall back to `fallback`). */
export function clampMonths(
  value: string | number,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/**
 * `/settings/modules/ai-governance`: the AI policy (a controlled document), the person
 * responsible for AI governance, who AI literacy is measured over (everyone, or
 * the people who own or oversee AI systems), how long a literacy record stays
 * valid and the default review interval of AI systems and assessments.
 * Read-only without `ai_governance:manage`.
 */
@Component({
  selector: 'app-ai-governance-settings',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Alert,
    Button,
    Card,
    ErrorState,
    Icon,
    LoadingState,
    AiField,
    AiGovPage,
    AiUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.settings.title"
      descriptionKey="aiGovernance.settings.subtitle"
      [breadcrumbs]="[{ labelKey: 'aiGovernance.nav.settings' }]"
      page="settings"
      [config]="true"
      [settingsLink]="null"
    >
      @if (loadError()) {
        <app-error-state (retry)="load()" />
      } @else if (settings(); as s) {
        @if (!store.canManage()) {
          <app-alert tone="info" class="mb-4">{{
            'aiGovernance.settings.readOnly' | transloco
          }}</app-alert>
        }
        <form
          class="flex max-w-[760px] flex-col gap-5"
          (submit)="$event.preventDefault(); save()"
          novalidate
        >
          <app-card>
            <app-ai-field
              inputId="ais-policy"
              labelKey="aiGovernance.settings.policy"
              helpPage="settings"
              helpField="policy"
              [plain]="true"
            >
              <div class="flex flex-wrap items-center gap-2">
                @if (policyId()) {
                  <a
                    [routerLink]="['/documents', policyId()]"
                    class="inline-flex min-h-6 items-center gap-1.5 text-body font-semibold text-accent hover:underline"
                    data-testid="policy-link"
                  >
                    <app-icon name="documents" [size]="14" />
                    {{ policyTitle() || ('aiGovernance.settings.policyDocument' | transloco) }}
                  </a>
                  @if (store.canManage()) {
                    <app-button size="sm" variant="ghost" (click)="setPolicy(null, null)">{{
                      'aiGovernance.settings.removePolicy' | transloco
                    }}</app-button>
                  }
                } @else {
                  <span class="text-body text-fg-muted">{{
                    'aiGovernance.settings.noPolicy' | transloco
                  }}</span>
                }
              </div>
              @if (store.canManage()) {
                <p class="mt-3 text-meta text-fg-muted">
                  {{ 'aiGovernance.settings.findPolicy' | transloco }}
                </p>
                <input
                  id="ais-policy"
                  type="search"
                  class="mt-1 h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                  [placeholder]="'aiGovernance.settings.findPolicyPlaceholder' | transloco"
                  [value]="docQuery()"
                  (input)="docQuery.set($any($event.target).value)"
                />
                @if (docHits().length) {
                  <ul class="mt-2 flex flex-col gap-1" aria-live="polite">
                    @for (d of docHits(); track d.id) {
                      <li>
                        <button
                          type="button"
                          class="min-h-8 w-full rounded-tile px-2 py-1.5 text-left text-ui text-fg hover:bg-surface-2"
                          (click)="setPolicy(d.id, d.title)"
                        >
                          <span class="mr-1 font-mono text-meta text-fg-subtle">{{
                            d.doc_code
                          }}</span
                          >{{ d.title }}
                        </button>
                      </li>
                    }
                  </ul>
                }
              }
            </app-ai-field>
          </app-card>

          <app-card>
            <div class="flex flex-col gap-4">
              <app-ai-field
                inputId="ais-officer"
                labelKey="aiGovernance.settings.officer"
                helpPage="settings"
                helpField="officer"
                [plain]="true"
              >
                <app-ai-user-select
                  selectId="ais-officer"
                  [currentName]="s.officer?.name ?? null"
                  [disabled]="!store.canManage()"
                  [(value)]="officer"
                />
              </app-ai-field>

              <app-ai-field
                inputId="ais-scope"
                labelKey="aiGovernance.settings.literacyScope"
                helpPage="settings"
                helpField="literacy_scope"
                [plain]="true"
                [legend]="true"
              >
                <div
                  class="flex flex-col gap-2"
                  role="radiogroup"
                  aria-labelledby="ais-scope-label"
                >
                  @for (option of scopes; track option) {
                    <label class="flex items-start gap-2 text-body text-fg">
                      <input
                        type="radio"
                        name="ais-scope"
                        class="mt-1"
                        [value]="option"
                        [checked]="scope() === option"
                        [disabled]="!store.canManage()"
                        (change)="scope.set(option)"
                        [attr.data-testid]="'settings-scope-' + option"
                      />
                      <span>
                        <span class="font-semibold">{{
                          'aiGovernance.settings.scopes.' + option + '.label' | transloco
                        }}</span>
                        <span class="block text-meta text-fg-muted">{{
                          'aiGovernance.settings.scopes.' + option + '.hint' | transloco
                        }}</span>
                      </span>
                    </label>
                  }
                </div>
              </app-ai-field>

              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <app-ai-field
                  inputId="ais-validity"
                  labelKey="aiGovernance.settings.literacyValidity"
                  helpPage="settings"
                  helpField="literacy_validity_months"
                >
                  <input
                    id="ais-validity"
                    type="number"
                    min="1"
                    max="120"
                    [disabled]="!store.canManage()"
                    [value]="validity()"
                    (input)="validity.set(clamp($any($event.target).value, 1, 120, 24))"
                  />
                </app-ai-field>
                <app-ai-field
                  inputId="ais-interval"
                  labelKey="aiGovernance.settings.reviewInterval"
                  helpPage="settings"
                  helpField="review_interval_months"
                >
                  <input
                    id="ais-interval"
                    type="number"
                    min="1"
                    max="60"
                    [disabled]="!store.canManage()"
                    [value]="interval()"
                    (input)="interval.set(clamp($any($event.target).value, 1, 60, 12))"
                  />
                </app-ai-field>
              </div>
            </div>
            @if (s.updated_at) {
              <p class="mt-3 text-meta text-fg-subtle">
                {{
                  'aiGovernance.settings.updatedAt'
                    | transloco: { date: (s.updated_at | localDate) }
                }}
              </p>
            }
          </app-card>
          @if (error()) {
            <app-alert tone="error">{{ error()! | transloco }}</app-alert>
          }
          @if (store.canManage()) {
            <div
              class="sticky bottom-0 z-10 -mx-4 flex justify-end border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            >
              <app-button type="submit" [loading]="saving()" data-testid="settings-save">{{
                'aiGovernance.common.save' | transloco
              }}</app-button>
            </div>
          }
        </form>
      } @else {
        <app-loading-state [rows]="4" />
      }
    </app-ai-gov-page>
  `,
})
export class AiGovernanceSettingsPage {
  private readonly api = inject(AiGovernanceApi);
  private readonly documents = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly clamp = clampMonths;
  protected readonly scopes = LITERACY_SCOPES;

  protected readonly settings = signal<AiGovernanceSettings | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly policyId = signal<string | null>(null);
  protected readonly policyTitle = signal<string | null>(null);
  protected readonly officer = signal('');
  protected readonly scope = signal<LiteracyScope>('all');
  protected readonly validity = signal(24);
  protected readonly interval = signal(12);
  protected readonly docQuery = signal('');
  protected readonly docHits = signal<readonly DocumentSearchResult[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      view: 'settings',
      title: this.language.translate('aiGovernance.settings.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        if (orgId) {
          this.load();
        }
      });
    });
    const sub = toObservable(this.docQuery)
      .pipe(
        map((q) => q.trim()),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || q.length < 2) {
            return of([] as DocumentSearchResult[]);
          }
          return this.documents
            .search(orgId, q, 8)
            .pipe(catchError(() => of([] as DocumentSearchResult[])));
        }),
      )
      .subscribe((hits) => this.docHits.set(hits));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected load(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.loadError.set(null);
    this.api.settings(orgId).subscribe({
      next: (s) => this.apply(s),
      error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
    });
  }

  private apply(s: AiGovernanceSettings): void {
    this.settings.set(s);
    this.policyId.set(s.policy_document_id);
    this.policyTitle.set(s.policy_document_title);
    this.officer.set(s.officer?.id ?? '');
    this.scope.set(s.literacy_scope ?? 'all');
    this.validity.set(s.literacy_validity_months);
    this.interval.set(s.review_interval_months);
  }

  protected setPolicy(id: string | null, title: string | null): void {
    this.policyId.set(id);
    this.policyTitle.set(title);
    this.docQuery.set('');
    this.docHits.set([]);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || !this.store.canManage()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .updateSettings(orgId, {
        policy_document_id: this.policyId(),
        officer_user_id: this.officer() || null,
        literacy_validity_months: this.validity(),
        review_interval_months: this.interval(),
        literacy_scope: this.scope(),
      })
      .subscribe({
        next: (s) => {
          this.saving.set(false);
          this.apply(s);
          this.notifications.success('aiGovernance.settings.saved');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(aiGovernanceErrorKey(err));
        },
      });
  }
}
