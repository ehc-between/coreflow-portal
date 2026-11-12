import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContextApi } from '../data/context-api';
import {
  ContextKind,
  ContextRecord,
  FRAMEWORK_KEYS,
  POLICY_KINDS,
  PolicyKind,
} from '../data/context.models';
import { KINDS, asKind, contextErrorKey } from '../context-kinds';
import { FormRow } from '../ui/form-row';
import { OwnerSelect } from '../ui/owner-select';
import {
  ContextDraft,
  changedFields,
  changesContent,
  createBody,
  draftFrom,
  draftProblems,
  emptyDraft,
  updateBody,
} from './context-draft';
import { KindFields } from './kind-fields';

/** A new draft pre-filled from the URL (`?framework=` for scopes, `?kind=` for policies). */
export function seededDraft(
  kind: ContextKind,
  params: Readonly<Record<string, string | null>>,
): ContextDraft {
  const draft = emptyDraft(kind);
  const framework = params['framework'];
  const policyKind = params['kind'];
  return {
    ...draft,
    framework:
      framework && (FRAMEWORK_KEYS as readonly string[]).includes(framework) ? framework : '',
    kind:
      policyKind && (POLICY_KINDS as readonly string[]).includes(policyKind)
        ? (policyKind as PolicyKind)
        : draft.kind,
  };
}

/**
 * Create / edit page of any M01 record (`/context/<segment>/new` and
 * `/context/<segment>/:id/edit`). Editing an approved analysis, scope or policy
 * asks for a change reason: saving content changes starts the next version as a
 * draft (owner and review settings alone do not).
 */
@Component({
  selector: 'app-context-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    TourStepDirective,
    WhyItMatters,
    Alert,
    Button,
    Card,
    Icon,
    FormRow,
    OwnerSelect,
    KindFields,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="backLink()"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'context.common.back' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{
          (editing() ? 'context.kinds.' + kind() + '.edit' : 'context.kinds.' + kind() + '.new')
            | transloco
        }}
      </h1>

      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'context.common.loading' | transloco }}</p>
        }
        @case ('error') {
          <app-alert tone="error">{{ 'context.detail.notFound' | transloco }}</app-alert>
        }
        @case ('ready') {
          <div class="mb-4">
            <app-guide-intro scope="context" [page]="page()" />
          </div>
          @if (approvedEdit()) {
            <div class="mb-4">
              <app-alert tone="info">{{ 'context.form.approvedNotice' | transloco }}</app-alert>
            </div>
          }
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
            <app-card>
              <div class="flex flex-col gap-4">
                <app-context-form-row
                  [labelKey]="kind() === 'party' ? 'context.fields.name' : 'context.fields.title'"
                  inputId="f-title"
                  [page]="page()"
                  [help]="kind() === 'party' ? 'name' : 'title'"
                >
                  <input
                    id="f-title"
                    type="text"
                    maxlength="255"
                    required
                    [value]="draft().title"
                    [attr.aria-invalid]="submitted() && !draft().title.trim()"
                    (input)="patch({ title: $any($event.target).value })"
                    [appTourStep]="'context-title-' + kind()"
                  />
                </app-context-form-row>
                <app-context-kind-fields
                  [kind]="kind()"
                  [draft]="draft()"
                  [editing]="editing()"
                  [page]="page()"
                  (draftChange)="draft.set($event)"
                />
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                {{ 'context.form.ownershipTitle' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <app-context-form-row
                  labelKey="context.fields.owner"
                  inputId="f-owner"
                  [page]="page()"
                  help="owner"
                >
                  <app-context-owner-select
                    inputId="f-owner"
                    [value]="draft().owner_user_id"
                    [currentName]="ownerName()"
                    (valueChange)="patch({ owner_user_id: $event })"
                  />
                </app-context-form-row>
                @if (cfg().hasInterval) {
                  <app-context-form-row
                    labelKey="context.fields.reviewInterval"
                    inputId="f-interval"
                    [page]="page()"
                    help="review_interval_months"
                  >
                    <input
                      id="f-interval"
                      type="number"
                      min="1"
                      max="60"
                      inputmode="numeric"
                      [value]="draft().review_interval_months"
                      (input)="patch({ review_interval_months: $any($event.target).value })"
                    />
                  </app-context-form-row>
                }
                <app-context-form-row
                  labelKey="context.fields.nextReview"
                  inputId="f-next"
                  [page]="page()"
                  help="next_review_at"
                >
                  <input
                    id="f-next"
                    type="date"
                    [value]="draft().next_review_day"
                    (input)="patch({ next_review_day: $any($event.target).value })"
                  />
                </app-context-form-row>
              </div>
              @if (simpleStatus()) {
                <label class="mt-4 flex items-center gap-2 text-[13px] text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4"
                    [checked]="draft().status === 'archived'"
                    (change)="
                      patch({ status: $any($event.target).checked ? 'archived' : 'active' })
                    "
                  />
                  {{ 'context.form.archived' | transloco }}
                </label>
              }
            </app-card>

            @if (editing()) {
              <app-card>
                <app-context-form-row
                  labelKey="context.fields.changeReason"
                  inputId="f-reason"
                  [page]="page()"
                  help="change_reason"
                >
                  <textarea
                    id="f-reason"
                    rows="2"
                    maxlength="2000"
                    [attr.aria-required]="reasonRequired()"
                    [attr.aria-invalid]="
                      submitted() && reasonRequired() && !draft().change_reason.trim()
                    "
                    [value]="draft().change_reason"
                    [placeholder]="
                      (reasonRequired()
                        ? 'context.form.reasonRequired'
                        : 'context.form.reasonOptional'
                      ) | transloco
                    "
                    (input)="patch({ change_reason: $any($event.target).value })"
                  ></textarea>
                </app-context-form-row>
              </app-card>
            }

            @if (submitted() && problems().length) {
              <app-alert tone="error">
                <ul class="list-disc pl-4">
                  @for (problem of problems(); track problem) {
                    <li>{{ problem | transloco }}</li>
                  }
                </ul>
              </app-alert>
            }

            <div class="flex flex-wrap items-center justify-end gap-2">
              <a [routerLink]="backLink()" tabindex="-1">
                <app-button variant="ghost">{{ 'context.common.cancel' | transloco }}</app-button>
              </a>
              <app-button type="submit" [loading]="saving()" data-testid="context-save">
                {{ (editing() ? 'context.form.save' : 'context.form.create') | transloco }}
              </app-button>
            </div>
          </form>

          <div class="mt-6">
            <app-why-it-matters scope="context" [page]="page()" />
          </div>
        }
      }
    </div>
  `,
})
export class ContextForm {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);

  /** Route param (edit only) and data (component input binding). */
  readonly id = input<string | undefined>(undefined);
  readonly contextKind = input<unknown>(undefined);

  protected readonly kind = computed(() => asKind(this.contextKind()));
  protected readonly cfg = computed(() => KINDS[this.kind()]);
  protected readonly editing = computed(() => !!this.id());
  protected readonly page = computed(() => `${this.cfg().guidance}-form`);
  protected readonly backLink = computed(() => {
    const base = `/context/${this.cfg().segment}`;
    const id = this.id();
    return id ? `${base}/${id}` : base;
  });

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly record = signal<ContextRecord | null>(null);
  private readonly original = signal<ContextDraft | null>(null);
  protected readonly draft = signal<ContextDraft>(emptyDraft('analysis'));
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);

  protected readonly ownerName = computed(() => this.record()?.owner?.name ?? null);
  protected readonly simpleStatus = computed(() => this.editing() && !this.cfg().controlled);
  /** Editing an approved controlled record. */
  protected readonly approvedEdit = computed(
    () => this.cfg().controlled && this.record()?.status === 'approved',
  );
  protected readonly reasonRequired = computed(() => {
    const original = this.original();
    if (!this.approvedEdit() || !original) {
      return false;
    }
    return changesContent(changedFields(this.kind(), original, this.draft()));
  });
  protected readonly problems = computed(() => {
    const problems = draftProblems(this.kind(), this.draft());
    if (this.reasonRequired() && !this.draft().change_reason.trim()) {
      problems.push('context.errors.change_reason_required');
    }
    return problems;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'context',
      entityType: this.cfg().entityType,
      entityId: this.id() ?? null,
      view: this.editing() ? 'edit' : 'new',
      title: this.draft().title || null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const kind = this.kind();
      const id = this.id();
      untracked(() => this.init(orgId, kind, id));
    });
  }

  protected patch(change: Partial<ContextDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected save(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || this.problems().length) {
      return;
    }
    const kind = this.kind();
    const id = this.id();
    const original = this.original();
    if (id && original) {
      const body = updateBody(kind, original, this.draft());
      if (Object.keys(body).length === 0) {
        void this.router.navigateByUrl(this.backLink());
        return;
      }
      this.saving.set(true);
      this.api.update(orgId, kind, id, body).subscribe({
        next: (record) => this.done(record, 'context.notices.saved'),
        error: (error: unknown) => this.failed(error),
      });
      return;
    }
    this.saving.set(true);
    this.api.create(orgId, kind, createBody(kind, this.draft())).subscribe({
      next: (record) => this.done(record, 'context.notices.created'),
      error: (error: unknown) => this.failed(error),
    });
  }

  private done(record: ContextRecord, key: string): void {
    this.saving.set(false);
    this.notifications.success(key, { code: record.code });
    void this.router.navigateByUrl(`/context/${this.cfg().segment}/${record.id}`);
  }

  private failed(error: unknown): void {
    this.saving.set(false);
    this.notifications.error(contextErrorKey(error));
  }

  private init(orgId: string | null, kind: ContextKind, id: string | undefined): void {
    this.request.unsubscribe();
    this.submitted.set(false);
    if (!id) {
      const params: Record<string, string | null> = {
        framework: this.route.snapshot.queryParamMap.get('framework'),
        kind: this.route.snapshot.queryParamMap.get('kind'),
      };
      this.record.set(null);
      this.original.set(null);
      this.draft.set(seededDraft(kind, params));
      this.state.set('ready');
      return;
    }
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, kind, id).subscribe({
      next: (record) => {
        if (!record.can_edit) {
          void this.router.navigateByUrl(`/context/${KINDS[kind].segment}/${id}`);
          return;
        }
        const draft = draftFrom(kind, record);
        this.record.set(record);
        this.original.set(draft);
        this.draft.set(draft);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
