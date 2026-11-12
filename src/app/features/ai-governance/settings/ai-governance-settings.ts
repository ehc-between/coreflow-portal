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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { AiGovernanceSettings } from '../data/ai-governance.models';
import { AI_GOVERNANCE_MODULE, AI_GOVERNANCE_SCOPE } from '../data/ai-governance-display';
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
 * `/ai-governance/settings`: the AI policy (a controlled document), the AI
 * governance officer, how long an AI literacy record stays valid and the
 * default review interval of AI systems. Read-only without
 * `ai_governance:manage`.
 */
@Component({
  selector: 'app-ai-governance-settings',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    LocalDatePipe,
    Alert,
    Button,
    Card,
    FormField,
    AiGovPage,
    AiUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page titleKey="aiGovernance.settings.title" page="settings">
      @if (loadError()) {
        <app-alert tone="error">{{ loadError()! | transloco }}</app-alert>
      } @else if (settings(); as s) {
        @if (!store.canManage()) {
          <app-alert tone="info" class="mb-4">{{
            'aiGovernance.settings.readOnly' | transloco
          }}</app-alert>
        }
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-card>
            <h2 class="mb-1 font-display text-[15px] font-bold text-fg">
              {{ 'aiGovernance.settings.policy' | transloco }}
            </h2>
            <app-field-help [scope]="scope" page="settings" field="policy" />
            <div class="mt-2 flex flex-wrap items-center gap-2">
              @if (policyId()) {
                <a
                  [routerLink]="['/documents', policyId()]"
                  class="text-[13.5px] font-semibold text-accent hover:underline"
                  data-testid="policy-link"
                >
                  {{ policyTitle() || ('aiGovernance.settings.policyDocument' | transloco) }}
                </a>
                @if (store.canManage()) {
                  <app-button size="sm" variant="ghost" (click)="setPolicy(null, null)">{{
                    'aiGovernance.settings.removePolicy' | transloco
                  }}</app-button>
                }
              } @else {
                <span class="text-[13.5px] text-fg-muted">{{
                  'aiGovernance.settings.noPolicy' | transloco
                }}</span>
              }
            </div>
            @if (store.canManage()) {
              <label class="mt-3 flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
                {{ 'aiGovernance.settings.findPolicy' | transloco }}
                <input
                  type="search"
                  class="h-9 rounded-tile border border-border bg-bg px-3 text-[13.5px] font-normal text-fg"
                  [placeholder]="'aiGovernance.settings.findPolicyPlaceholder' | transloco"
                  [value]="docQuery()"
                  (input)="docQuery.set($any($event.target).value)"
                />
              </label>
              @if (docHits().length) {
                <ul class="mt-2 flex flex-col gap-1" aria-live="polite">
                  @for (d of docHits(); track d.id) {
                    <li>
                      <button
                        type="button"
                        class="w-full rounded-tile px-2 py-1.5 text-left text-[13px] text-fg hover:bg-surface-2"
                        (click)="setPolicy(d.id, d.title)"
                      >
                        <span class="mr-1 font-mono text-[12px] text-fg-subtle">{{
                          d.doc_code
                        }}</span
                        >{{ d.title }}
                      </button>
                    </li>
                  }
                </ul>
              }
            }
          </app-card>

          <app-card>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <app-form-field
                  [label]="'aiGovernance.settings.officer' | transloco"
                  inputId="ais-officer"
                >
                  <app-ai-user-select
                    selectId="ais-officer"
                    [currentName]="s.officer?.name ?? null"
                    [disabled]="!store.canManage()"
                    [(value)]="officer"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="settings" field="officer" />
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.settings.literacyValidity' | transloco"
                  inputId="ais-validity"
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
                </app-form-field>
                <app-field-help [scope]="scope" page="settings" field="literacy_validity_months" />
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.settings.reviewInterval' | transloco"
                  inputId="ais-interval"
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
                </app-form-field>
                <app-field-help [scope]="scope" page="settings" field="review_interval_months" />
              </div>
            </div>
            @if (s.updated_at) {
              <p class="mt-3 text-[12px] text-fg-subtle">
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
            <div class="flex justify-end">
              <app-button type="submit" [loading]="saving()" data-testid="settings-save">{{
                'aiGovernance.common.save' | transloco
              }}</app-button>
            </div>
          }
        </form>
      } @else {
        <p class="text-[14px] text-fg-muted">{{ 'aiGovernance.common.loading' | transloco }}</p>
      }
    </app-ai-gov-page>
  `,
})
export class AiGovernanceSettingsPage {
  private readonly api = inject(AiGovernanceApi);
  private readonly documents = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly clamp = clampMonths;

  protected readonly settings = signal<AiGovernanceSettings | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly policyId = signal<string | null>(null);
  protected readonly policyTitle = signal<string | null>(null);
  protected readonly officer = signal('');
  protected readonly validity = signal(24);
  protected readonly interval = signal(12);
  protected readonly docQuery = signal('');
  protected readonly docHits = signal<readonly DocumentSearchResult[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    providePageContext(() => ({ module: AI_GOVERNANCE_MODULE, view: 'settings' }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.api.settings(orgId).subscribe({
          next: (s) => this.apply(s),
          error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
        });
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

  private apply(s: AiGovernanceSettings): void {
    this.settings.set(s);
    this.policyId.set(s.policy_document_id);
    this.policyTitle.set(s.policy_document_title);
    this.officer.set(s.officer?.id ?? '');
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
