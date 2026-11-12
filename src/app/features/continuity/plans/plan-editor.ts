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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import { changedFields } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { PlanDetail } from '../data/continuity.models';
import { PlanForm, PlanFormValue, planDraft, planFields } from './plan-form';

/**
 * Create (`/continuity/plans/new`, optionally `?bia=<id>` to preselect a BIA) or edit
 * (`/continuity/plans/:id/edit`) a continuity plan. Editing sends only the changed
 * fields with the change reason.
 */
@Component({
  selector: 'app-plan-editor',
  imports: [RouterLink, TranslocoPipe, Alert, GuideIntro, Icon, PlanForm, WhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[920px] px-4 pt-7 pb-12 sm:px-8">
      <a
        [routerLink]="id() ? ['/continuity/plans', id()] : '/continuity/plans'"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ (id() ? 'continuity.common.backToRecord' : 'continuity.plans.back') | transloco }}
      </a>
      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'continuity.common.loading' | transloco }}</p>
        }
        @case ('error') {
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        }
        @default {
          <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            @if (plan(); as p) {
              {{ 'continuity.plans.editTitle' | transloco: { code: p.code, title: p.title } }}
            } @else {
              {{ 'continuity.plans.newTitle' | transloco }}
            }
          </h1>
          @if (plan()?.can_edit === false) {
            <app-alert tone="info">{{ 'continuity.form.readOnly' | transloco }}</app-alert>
          } @else {
            @if (plan()?.status === 'approved' || plan()?.status === 'in_review') {
              <div class="mt-2">
                <app-alert tone="info">{{ 'continuity.form.backToDraft' | transloco }}</app-alert>
              </div>
            }
            <div class="mt-3 mb-4"><app-guide-intro scope="continuity" page="planForm" /></div>
            @if (error(); as key) {
              <div class="mb-4">
                <app-alert>{{ key | transloco }}</app-alert>
              </div>
            }
            <app-plan-form
              [value]="plan()"
              [initialBiaIds]="initialBias()"
              [busy]="busy()"
              (submitted)="save($event)"
              (cancelled)="back()"
            />
            <div class="mt-6"><app-why-it-matters scope="continuity" page="planForm" /></div>
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

  /** Route `:id` (absent on `/new`). */
  readonly id = input<string | undefined>(undefined);
  /** Query `?bia=` on `/new`. */
  readonly bia = input<string | undefined>(undefined);

  protected readonly initialBias = computed(() => {
    const bia = this.bia();
    return bia ? [bia] : [];
  });
  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly plan = signal<PlanDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
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
