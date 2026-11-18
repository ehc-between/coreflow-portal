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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { Alert } from '../../../shared/ui/alert/alert';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ContinuityApi } from '../data/continuity-api';
import { changedFields } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { PlanDetail, PlanType } from '../data/continuity.models';
import { formCrumbs } from '../shared/continuity-page';
import { prefillIds, prefillText } from '../shared/flow-prefill';
import { PlanForm, PlanFormValue, PlanPrefill, planDraft, planFields } from './plan-form';

/**
 * Create (`/continuity/plans/new`, optionally `?bia=<id>`, or from a BIA with "create
 * from here") or edit (`/continuity/plans/:id/edit`) a continuity plan. Editing sends
 * only the changed fields with the change reason.
 */
@Component({
  selector: 'app-plan-editor',
  imports: [
    TranslocoPipe,
    Alert,
    FlowBanner,
    HelpStrip,
    LoadingState,
    PageHeader,
    PlanForm,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="plan() ? 'continuity.plans.editTitle' : 'continuity.plans.newTitle'"
        [titleParams]="{ code: plan()?.code, title: plan()?.title }"
        [breadcrumbs]="crumbs()"
      />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        }
        @default {
          @if (plan()?.can_edit === false) {
            <app-alert tone="info">{{ 'continuity.form.readOnly' | transloco }}</app-alert>
          } @else {
            <app-flow-banner [flow]="flow()" (cancelled)="flows.cancel()" />
            @if (plan()?.status === 'approved' || plan()?.status === 'in_review') {
              <div class="mb-4">
                <app-alert tone="info">{{ 'continuity.form.backToDraft' | transloco }}</app-alert>
              </div>
            }
            <app-help-strip scope="continuity" page="planForm" lesson="writing-a-plan" />
            @if (error(); as key) {
              <div class="mb-4">
                <app-alert>{{ key | transloco }}</app-alert>
              </div>
            }
            <app-plan-form
              [value]="plan()"
              [initialBiaIds]="initialBias()"
              [prefill]="prefill()"
              [busy]="busy()"
              (submitted)="save($event)"
              (cancelled)="back()"
            />
            <div class="mt-8"><app-why-it-matters scope="continuity" page="planForm" /></div>
          }
        }
      }
    </div>
  `,
})
export class PlanEditor {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly flows = inject(CreateFlowService);

  /** Route `:id` (absent on `/new`). */
  readonly id = input<string | undefined>(undefined);
  /** Query `?bia=` on `/new`. */
  readonly bia = input<string | undefined>(undefined);

  protected readonly flow = this.flows.consume(inject(ActivatedRoute), {
    targetType: 'continuity_plan',
  });
  protected readonly prefill = computed<PlanPrefill | null>(() => {
    const values = this.flow()?.prefill;
    if (!values) {
      return null;
    }
    return {
      title: prefillText(values, 'title'),
      plan_type: (prefillText(values, 'plan_type') || undefined) as PlanType | undefined,
      owner_user_id: prefillText(values, 'owner_user_id'),
      department_id: prefillText(values, 'department_id'),
      bia_ids: prefillIds(values, 'bia_ids'),
      objectives: prefillText(values, 'objectives'),
    };
  });
  protected readonly initialBias = computed(() => {
    const bia = this.bia();
    return bia ? [bia] : [];
  });
  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly plan = signal<PlanDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly crumbs = computed(() => {
    const p = this.plan();
    return formCrumbs(
      'plans',
      p ? { id: p.id, label: p.code } : null,
      p ? 'continuity.common.edit' : 'continuity.plans.new',
    );
  });
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'continuity_plan',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.plan()?.title ?? this.language.translate('continuity.plans.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId || !id) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.getPlan(orgId, id).subscribe({
          next: (p) => {
            this.plan.set(p);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected save(value: PlanFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const current = this.plan();
    this.error.set(null);
    if (!current) {
      this.busy.set(true);
      this.api.createPlan(orgId, value.fields).subscribe({
        next: (p) => {
          this.busy.set(false);
          this.notifications.success('continuity.plans.created', { code: p.code });
          this.flows.complete(p.id, 'continuity_plan').subscribe();
          void this.router.navigate(['/continuity/plans', p.id]);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(continuityErrorKey(err));
        },
      });
      return;
    }
    const changes = changedFields(planFields(planDraft(current)), value.fields);
    if (Object.keys(changes).length === 0) {
      this.back();
      return;
    }
    this.busy.set(true);
    this.api
      .updatePlan(orgId, current.id, { ...changes, change_reason: value.changeReason })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.notifications.success('continuity.form.saved');
          this.back();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(continuityErrorKey(err));
        },
      });
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/continuity/plans', id] : ['/continuity/plans']);
  }
}
