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
import { changedFields } from '../data/asset-display';
import { assetErrorMessage } from '../data/asset-errors';
import { ChangeDetail, CreateChangeRequest } from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { ChangeForm, ChangeFormValue, changeDraftFrom, changeFieldsFrom } from './change-form';

/** The create body of a form value (implementation / review fields are not set on create). */
export function createChangeBody(value: ChangeFormValue): CreateChangeRequest {
  const f = value.fields;
  return {
    title: f.title,
    change_type: f.change_type,
    category: f.category,
    description: f.description,
    reason: f.reason,
    impact_assessment: f.impact_assessment,
    risk_level: f.risk_level,
    risk_assessment: f.risk_assessment,
    implementation_plan: f.implementation_plan,
    rollback_plan: f.rollback_plan,
    planned_start: f.planned_start,
    planned_end: f.planned_end,
    department_id: f.department_id,
    ...(f.owner_user_id ? { owner_user_id: f.owner_user_id } : {}),
    asset_ids: value.assetIds,
  };
}

/**
 * Raise a change request (`/assets/changes/new`, `?asset=<id>` preselects an
 * affected asset) or edit one (`/assets/changes/:id/edit`). Only changed fields are
 * sent; a 409 `change_locked` / `change_closed` is explained in place.
 */
@Component({
  selector: 'app-change-edit',
  imports: [RouterLink, TranslocoPipe, Alert, ChangeForm, GuideIntro, Icon, WhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-7 pb-12 sm:px-8">
      <a
        [routerLink]="id() ? ['/assets/changes', id()] : '/assets/changes'"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ (id() ? 'assets.common.backToChange' : 'assets.common.backToChanges') | transloco }}
      </a>
      @if (state() === 'loading') {
        <p class="text-[14px] text-fg-muted">{{ 'assets.common.loading' | transloco }}</p>
      } @else if (state() === 'error') {
        <app-alert>{{ 'assets.changeDetail.notFound' | transloco }}</app-alert>
      } @else {
        <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          @if (change(); as c) {
            {{ 'assets.changeForm.editTitle' | transloco: { code: c.code, title: c.title } }}
          } @else {
            {{ 'assets.changeForm.newTitle' | transloco }}
          }
        </h1>
        <p class="mb-4 text-[14px] text-fg-muted">{{ 'assets.changeForm.subtitle' | transloco }}</p>
        <div class="mb-4"><app-guide-intro scope="assets" page="changeForm" /></div>
        @if (change()?.closed) {
          <app-alert tone="info">{{ 'assets.errors.change_closed' | transloco }}</app-alert>
        } @else {
          @if (error(); as e) {
            <div class="mb-4">
              <app-alert>{{ e.key | transloco: e.params }}</app-alert>
            </div>
          }
          <app-change-form
            [value]="change()"
            [initialAssets]="initialAssets()"
            [busy]="busy()"
            (submitted)="save($event)"
            (cancelled)="back()"
          />
        }
        <div class="mt-6"><app-why-it-matters scope="assets" page="changeForm" /></div>
      }
    </div>
  `,
})
export class ChangeEdit {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly id = input<string | undefined>(undefined);
  /** `?asset=<id>`: an affected asset to preselect on a new change. */
  readonly asset = input<string | undefined>(undefined);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly change = signal<ChangeDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<{ key: string; params: Record<string, unknown> } | null>(null);
  protected readonly initialAssets = computed(() => {
    const asset = this.asset();
    return asset ? [asset] : [];
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'assets',
      entityType: 'change_request',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.change()?.title ?? this.language.translate('assets.changeForm.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected save(value: ChangeFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const current = this.change();
    this.error.set(null);
    if (current) {
      const changes = changedFields(changeFieldsFrom(changeDraftFrom(current)), value.fields);
      if (Object.keys(changes).length === 0) {
        this.back();
        return;
      }
      this.busy.set(true);
      this.api
        .updateChange(orgId, current.id, { ...changes, change_reason: value.changeReason })
        .subscribe({
          next: () => {
            this.busy.set(false);
            this.notifications.success('assets.changeForm.saved');
            this.back();
          },
          error: (err: unknown) => {
            this.busy.set(false);
            const message = assetErrorMessage(err);
            this.error.set({ key: message.key, params: { ...message.params } });
          },
        });
      return;
    }
    this.busy.set(true);
    this.api.createChange(orgId, createChangeBody(value)).subscribe({
      next: (created) => {
        this.busy.set(false);
        this.notifications.success('assets.changeForm.created', { code: created.code });
        void this.router.navigate(['/assets/changes', created.id]);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const message = assetErrorMessage(err);
        this.error.set({ key: message.key, params: { ...message.params } });
      },
    });
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/assets/changes', id] : ['/assets/changes']);
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.request.unsubscribe();
    if (!id) {
      this.change.set(null);
      this.state.set('ready');
      return;
    }
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getChange(orgId, id).subscribe({
      next: (c) => {
        this.change.set(c);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
