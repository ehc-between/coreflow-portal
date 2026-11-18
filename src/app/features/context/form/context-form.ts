import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Signal,
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
import { CreateFlowService, FlowContext } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ContextApi } from '../data/context-api';
import {
  ContextKind,
  ContextRecord,
  EntityRef,
  FRAMEWORK_KEYS,
  POLICY_KINDS,
  Policy,
  PolicyKind,
} from '../data/context.models';
import { KINDS, addMonths, asKind, contextErrorKey, intervalOptions } from '../context-kinds';
import { CONTEXT_ROOT_CRUMB } from '../context-nav';
import { FormRow } from '../ui/form-row';
import { OwnerSelect } from '../ui/owner-select';
import {
  ContextDraft,
  changedFields,
  changesContent,
  createBody,
  draftFrom,
  draftFromPrefill,
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
  const draft = emptyDraft();
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
 * `/context/<segment>/:id/edit`), at most 760 px wide with Save bottom-right
 * (sticky on phones). Editing an approved analysis, scope or policy asks for a
 * change reason: saving content changes starts the next version as a draft
 * (owner, review settings and a linked document alone do not). New forms opened
 * by "create from here" are prefilled and linked back to their source on save.
 */
@Component({
  selector: 'app-context-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    FlowBanner,
    LocalDayPipe,
    Alert,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    LoadingState,
    PageHeader,
    FormRow,
    OwnerSelect,
    KindFields,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header [titleKey]="titleKey()" [breadcrumbs]="breadcrumbs()" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state
            titleKey="context.detail.notFoundTitle"
            bodyKey="context.detail.notFound"
            (retry)="retry()"
          />
        }
        @case ('ready') {
          <app-help-strip scope="context" [page]="page()" [lesson]="cfg().lesson" />
          @if (!editing()) {
            <app-flow-banner [flow]="flow()" />
          }
          @if (approvedEdit()) {
            <div class="mb-4">
              <app-alert tone="info">{{ 'context.form.approvedNotice' | transloco }}</app-alert>
            </div>
          }
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
            <p class="text-meta text-fg-muted">
              <span class="text-fail-ink" aria-hidden="true">*</span>
              {{ 'context.form.requiredLegend' | transloco }}
            </p>
            <app-card>
              <div class="flex flex-col gap-5">
                <app-context-form-row
                  [labelKey]="kind() === 'party' ? 'context.fields.name' : 'context.fields.title'"
                  inputId="f-title"
                  [page]="page()"
                  [help]="kind() === 'party' ? 'name' : 'title'"
                  [required]="true"
                >
                  <input
                    id="f-title"
                    type="text"
                    maxlength="255"
                    required
                    aria-required="true"
                    [value]="draft().title"
                    [attr.aria-invalid]="submitted() && !draft().title.trim()"
                    (input)="patch({ title: $any($event.target).value })"
                    [attr.data-tour]="'context-title-' + kind()"
                  />
                </app-context-form-row>
                <app-context-kind-fields
                  [kind]="kind()"
                  [draft]="draft()"
                  [editing]="editing()"
                  [page]="page()"
                  [submitted]="submitted()"
                  [existingDocuments]="existingDocuments()"
                  (draftChange)="draft.set($event)"
                />
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-1 font-display text-card font-bold text-fg">
                {{ 'context.form.ownershipTitle' | transloco }}
              </h2>
              <p class="mb-4 text-meta text-fg-muted">
                {{ 'context.form.ownershipHint' | transloco }}
              </p>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <app-context-form-row
                  [labelKey]="
                    kind() === 'responsibility'
                      ? 'context.fields.maintainedBy'
                      : 'context.fields.owner'
                  "
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
                <app-context-form-row
                  labelKey="context.fields.reviewInterval"
                  inputId="f-interval"
                  [page]="page()"
                  help="review_interval_months"
                >
                  <select id="f-interval" (change)="setInterval($any($event.target).value)">
                    <option value="" [selected]="!draft().review_interval_months">
                      {{ 'context.form.noInterval' | transloco }}
                    </option>
                    @for (months of intervals(); track months) {
                      <option
                        [value]="months"
                        [selected]="'' + months === draft().review_interval_months"
                      >
                        {{ 'context.detail.everyMonths' | transloco: { count: months } }}
                      </option>
                    }
                  </select>
                </app-context-form-row>
                <app-context-form-row
                  labelKey="context.fields.nextReview"
                  inputId="f-next"
                  [page]="page()"
                  help="next_review_at"
                >
                  <input
                    id="f-next"
                    type="date"
                    aria-describedby="f-next-hint"
                    [value]="draft().next_review_day"
                    (input)="setNextReview($any($event.target).value)"
                  />
                </app-context-form-row>
              </div>
              <p id="f-next-hint" class="mt-2 text-meta text-fg-muted">
                @if (draft().next_review_day && autoNext()) {
                  {{
                    'context.form.nextComputed'
                      | transloco: { date: (draft().next_review_day | localDay) }
                  }}
                } @else {
                  {{ 'context.form.nextHint' | transloco }}
                }
              </p>
              @if (simpleStatus()) {
                <label class="mt-4 flex min-h-6 items-center gap-2 text-ui text-fg">
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
                  [required]="reasonRequired()"
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
                <p class="font-semibold">{{ 'context.form.cannotSave' | transloco }}</p>
                <ul class="mt-1 list-disc pl-4">
                  @for (problem of problems(); track problem) {
                    <li>{{ problem | transloco }}</li>
                  }
                </ul>
              </app-alert>
            }

            <div
              class="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            >
              <a [routerLink]="backLink()" tabindex="-1" (click)="cancelFlow()">
                <app-button variant="secondary">{{
                  'context.common.cancel' | transloco
                }}</app-button>
              </a>
              <app-button type="submit" [loading]="saving()" data-testid="context-save">
                {{
                  (editing() ? 'context.form.save' : 'context.kinds.' + kind() + '.create')
                    | transloco
                }}
              </app-button>
            </div>
          </form>

          <div class="mt-8">
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
  private readonly flows = inject(CreateFlowService);

  /** Route param (edit only) and data (component input binding). */
  readonly id = input<string | undefined>(undefined);
  readonly contextKind = input<unknown>(undefined);

  protected readonly kind = computed(() => asKind(this.contextKind()));
  protected readonly cfg = computed(() => KINDS[this.kind()]);
  protected readonly editing = computed(() => !!this.id());
  protected readonly page = computed(() => `${this.cfg().guidance}-form`);
  protected readonly titleKey = computed(
    () => `context.kinds.${this.kind()}.${this.editing() ? 'edit' : 'new'}`,
  );
  protected readonly listPath = computed(() => `/context/${this.cfg().segment}`);
  protected readonly backLink = computed(() => {
    const id = this.id();
    return id ? `${this.listPath()}/${id}` : this.listPath();
  });
  protected readonly breadcrumbs = computed(() => {
    const crumbs: { labelKey?: string; label?: string; link?: string }[] = [
      CONTEXT_ROOT_CRUMB,
      { labelKey: `context.kinds.${this.kind()}.plural`, link: this.listPath() },
    ];
    const r = this.record();
    if (this.editing() && r) {
      crumbs.push({ label: 'name' in r ? r.name : r.title, link: this.backLink() });
    }
    crumbs.push({ labelKey: this.titleKey() });
    return crumbs;
  });

  /** The flow signal from `consume()` (it may fill in later, after a reload). */
  private readonly flowSource = signal<Signal<FlowContext | null> | null>(null);
  /** The "create from here" flow this new form was opened with, if any. */
  protected readonly flow = computed(() => this.flowSource()?.() ?? null);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly record = signal<ContextRecord | null>(null);
  private readonly original = signal<ContextDraft | null>(null);
  protected readonly draft = signal<ContextDraft>(emptyDraft());
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  /** The next review date was computed from the interval (not typed). */
  protected readonly autoNext = signal(false);

  protected readonly ownerName = computed(() => this.record()?.owner?.name ?? null);
  protected readonly simpleStatus = computed(() => this.editing() && !this.cfg().controlled);
  protected readonly intervals = computed(() =>
    intervalOptions(this.draft().review_interval_months),
  );
  protected readonly existingDocuments = computed<readonly EntityRef[]>(() =>
    this.kind() === 'policy' ? ((this.record() as Policy | null)?.documents ?? []) : [],
  );
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
    // A flow whose prefill arrives after the form opened (reload of a flow URL).
    effect(() => {
      const flow = this.flow();
      if (flow && !this.editing()) {
        untracked(() => this.draft.update((d) => draftFromPrefill(this.kind(), d, flow.prefill)));
      }
    });
  }

  protected patch(change: Partial<ContextDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  /** Choosing an interval fills in the next review date (unless one was typed). */
  protected setInterval(value: string): void {
    const d = this.draft();
    const months = Number(value);
    if (value && (!d.next_review_day || this.autoNext())) {
      this.autoNext.set(true);
      this.patch({
        review_interval_months: value,
        next_review_day: addMonths(new Date(), months),
      });
      return;
    }
    this.patch({ review_interval_months: value });
  }

  protected setNextReview(day: string): void {
    this.autoNext.set(false);
    this.patch({ next_review_day: day });
  }

  protected cancelFlow(): void {
    if (!this.editing() && this.flow()) {
      this.flows.cancel();
    }
  }

  protected retry(): void {
    this.init(this.selectedOrg.currentOrgId(), this.kind(), this.id());
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
      next: (record) => {
        if (this.flow()) {
          this.flows.complete(record.id, this.cfg().entityType).subscribe();
        }
        this.done(record, 'context.notices.created');
      },
      error: (error: unknown) => this.failed(error),
    });
  }

  private done(record: ContextRecord, key: string): void {
    this.saving.set(false);
    this.notifications.success(key, { code: record.code });
    void this.router.navigateByUrl(`${this.listPath()}/${record.id}`);
  }

  private failed(error: unknown): void {
    this.saving.set(false);
    this.notifications.error(contextErrorKey(error));
  }

  private init(orgId: string | null, kind: ContextKind, id: string | undefined): void {
    this.request.unsubscribe();
    this.submitted.set(false);
    this.autoNext.set(false);
    if (!id) {
      const params: Record<string, string | null> = {
        framework: this.route.snapshot.queryParamMap.get('framework'),
        kind: this.route.snapshot.queryParamMap.get('kind'),
      };
      this.record.set(null);
      this.original.set(null);
      const seeded = seededDraft(kind, params);
      // A new record starts with the default interval: fill the next review from it.
      this.draft.set({
        ...seeded,
        next_review_day: seeded.review_interval_months
          ? addMonths(new Date(), Number(seeded.review_interval_months))
          : '',
      });
      this.autoNext.set(!!seeded.review_interval_months);
      // `consume` returns a signal that may fill in later (after a reload).
      this.flowSource.set(this.flows.consume(this.route, { targetType: KINDS[kind].entityType }));
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
