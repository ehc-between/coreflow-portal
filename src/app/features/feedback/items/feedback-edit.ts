import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackErrorKey } from '../data/feedback-errors';
import { FeedbackFormValue, formFromFeedback, toUpdateRequest } from '../data/feedback-form-model';
import { FEEDBACK_ENTITY, Feedback } from '../data/feedback.models';
import { FEEDBACK_SETTINGS_LINK } from '../feedback-nav';
import { FeedbackForm, FeedbackFormSubmit } from './feedback-form';

/** Edit a feedback record (`/feedback/items/:id/edit`). */
@Component({
  selector: 'app-feedback-edit',
  imports: [TranslocoPipe, Alert, ErrorState, HelpStrip, LoadingState, PageHeader, FeedbackForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="feedback.form.editTitle"
        [titleParams]="{ code: feedback()?.code ?? '' }"
        [breadcrumbs]="[
          { labelKey: 'modules.names.feedback', link: '/feedback' },
          { label: feedback()?.code ?? '', link: ['/feedback/items', id()] },
          { labelKey: 'feedback.form.editCrumb' },
        ]"
        [settingsLink]="settingsLink"
        [backLink]="['/feedback/items', id()]"
        backLabelKey="feedback.common.backToRecord"
      />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state [bodyKey]="errorKey()" (retry)="reload()" />
        }
        @default {
          @if (feedback(); as f) {
            <app-help-strip scope="feedback" page="edit" lesson="handling-complaints" />
            @if (!f.can_edit) {
              <app-alert tone="info">{{ 'feedback.form.readOnly' | transloco }}</app-alert>
            } @else if (seed(); as value) {
              <app-feedback-form
                mode="edit"
                [value]="value"
                [ownerName]="f.owner?.name ?? null"
                [busy]="saving()"
                (submitted)="save($event)"
                (cancelled)="back()"
              />
            }
          }
        }
      }
    </div>
  `,
})
export class FeedbackEdit {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly settingsLink = FEEDBACK_SETTINGS_LINK;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('feedback.common.loadFailed');
  protected readonly feedback = signal<Feedback | null>(null);
  protected readonly seed = signal<FeedbackFormValue | null>(null);
  protected readonly saving = signal(false);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const f = this.feedback();
      return {
        module: 'feedback',
        entityType: FEEDBACK_ENTITY,
        entityId: this.id(),
        view: 'edit',
        title: f ? `${f.code} ${f.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected save(event: FeedbackFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    const original = this.seed();
    if (!orgId || !original || this.saving()) {
      return;
    }
    const body = toUpdateRequest(original, event.value, event.changeReason);
    if (Object.keys(body).filter((k) => k !== 'change_reason').length === 0) {
      this.notifications.info('feedback.notices.noChanges');
      this.back();
      return;
    }
    this.saving.set(true);
    this.api.update(orgId, this.id(), body).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.success('feedback.notices.saved');
        this.back();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/feedback/items', this.id()]);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (feedback) => {
        this.feedback.set(feedback);
        this.seed.set(formFromFeedback(feedback));
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(feedbackErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
