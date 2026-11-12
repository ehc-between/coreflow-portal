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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { ObligationsApi } from './data/obligations-api';
import { Obligation } from './data/obligation.models';
import { obligationErrorKey } from './data/obligation-errors';
import {
  ObligationFormValue,
  applyProposal,
  formFromObligation,
  toUpdateRequest,
} from './data/obligation-form-model';
import { ObligationForm, ObligationFormSubmit } from './obligation-form';
import { ObligationProposal, ProposalAccepted } from './requirement-proposal';

/** Edit an obligation's register fields and evaluation schedule (`/obligations/:id/edit`). */
@Component({
  selector: 'app-obligation-edit',
  imports: [RouterLink, TranslocoPipe, GuideIntro, Alert, Icon, ObligationForm, ObligationProposal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="['/obligations', id()]"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'obligations.common.backToObligation' | transloco }}
      </a>
      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'obligations.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
        }
        @default {
          @if (obligation(); as o) {
            <h1
              class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            >
              {{ 'obligations.form.editTitle' | transloco: { code: o.code } }}
            </h1>
            <div class="mb-5"><app-guide-intro scope="obligations" page="form" /></div>
            @if (!o.can_edit) {
              <app-alert tone="info">{{ 'obligations.form.readOnly' | transloco }}</app-alert>
            } @else if (seed(); as value) {
              <app-obligation-form
                mode="edit"
                [value]="value"
                [ownerName]="o.owner?.name ?? null"
                [busy]="saving()"
                (changed)="draft.set($event)"
                (submitted)="save($event)"
                (cancelled)="back()"
              >
                <app-obligation-proposal proposal [entityId]="o.id" (accepted)="apply($event)" />
              </app-obligation-form>
            }
          }
        }
      }
    </div>
  `,
})
export class ObligationEdit {
  private readonly api = inject(ObligationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('obligations.common.loadFailed');
  protected readonly obligation = signal<Obligation | null>(null);
  /** The form as loaded (the baseline for the update diff). */
  private readonly original = signal<ObligationFormValue | null>(null);
  protected readonly seed = signal<ObligationFormValue | null>(null);
  protected readonly draft = signal<ObligationFormValue | null>(null);
  protected readonly saving = signal(false);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'obligations',
      entityType: 'compliance_obligation',
      entityId: this.id(),
      view: 'edit',
      title: this.obligation()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected apply(event: ProposalAccepted): void {
    const current = this.draft();
    if (!current) {
      return;
    }
    const next = applyProposal(current, event.proposal, event.chosen, false);
    this.seed.set(next);
    this.draft.set(next);
    this.notifications.info('obligations.proposal.applied');
  }

  protected save(event: ObligationFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    const original = this.original();
    if (!orgId || !original || this.saving()) {
      return;
    }
    const body = toUpdateRequest(original, event.value, event.changeReason);
    if (Object.keys(body).length === 0) {
      this.notifications.info('obligations.notices.noChanges');
      this.back();
      return;
    }
    this.saving.set(true);
    this.api.update(orgId, this.id(), body).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.success('obligations.notices.saved');
        this.back();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/obligations', this.id()]);
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (obligation) => {
        const form = formFromObligation(obligation);
        this.obligation.set(obligation);
        this.original.set(form);
        this.seed.set(form);
        this.draft.set(form);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(obligationErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
