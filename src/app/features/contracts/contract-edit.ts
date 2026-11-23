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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Alert } from '../../shared/ui/alert/alert';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../shared/ui/page-header/page-header';
import { ContractForm, ContractFormSubmit } from './contract-form';
import { CONTRACTS_CRUMB } from './contracts-nav';
import { ContractsApi } from './data/contracts-api';
import { Contract } from './data/contract.models';
import { contractErrorKey } from './data/contract-errors';
import {
  ContractFormValue,
  displayAmount,
  formFromContract,
  toUpdateRequest,
} from './data/contract-form-model';

/** Edit a contract's register fields (`/contracts/:id/edit`). */
@Component({
  selector: 'app-contract-edit',
  imports: [TranslocoPipe, Alert, ErrorState, HelpStrip, LoadingState, PageHeader, ContractForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[808px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="contracts.form.editTitle"
        [titleParams]="{ code: contract()?.code ?? '' }"
        [breadcrumbs]="breadcrumbs()"
        [backLink]="['/contracts', id()]"
        backLabelKey="contracts.common.backToContract"
      />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state [bodyKey]="errorKey()" (retry)="reload()" />
        }
        @default {
          @if (contract(); as c) {
            <app-help-strip scope="contracts" page="form" />
            @if (!c.can_edit) {
              <app-alert tone="info">{{ 'contracts.form.readOnly' | transloco }}</app-alert>
            } @else if (seed(); as value) {
              <app-contract-form
                mode="edit"
                [value]="value"
                [ownerName]="c.owner?.name ?? null"
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
export class ContractEdit {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('contracts.common.loadFailed');
  protected readonly contract = signal<Contract | null>(null);
  protected readonly seed = signal<ContractFormValue | null>(null);
  protected readonly saving = signal(false);
  private readonly reloadTick = signal(0);

  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => {
    const c = this.contract();
    return [
      CONTRACTS_CRUMB,
      ...(c ? [{ label: c.code, link: ['/contracts', c.id] }] : []),
      { labelKey: 'contracts.form.editCrumb' },
    ];
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'contracts',
      entityType: 'contract',
      entityId: this.id(),
      view: 'edit',
      title: this.contract()?.title ?? null,
      requirements: [...(this.contract()?.requirement_refs ?? [])],
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      this.reloadTick();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reload(): void {
    this.reloadTick.update((n) => n + 1);
  }

  protected save(event: ContractFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    const original = this.seed();
    if (!orgId || !original || this.saving()) {
      return;
    }
    const body = toUpdateRequest(original, event.value, event.changeReason);
    const changedKeys = Object.keys(body).filter((k) => k !== 'change_reason');
    if (changedKeys.length === 0) {
      this.notifications.info('contracts.notices.noChanges');
      this.back();
      return;
    }
    this.saving.set(true);
    this.api.update(orgId, this.id(), body).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.success('contracts.notices.saved');
        this.back();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(contractErrorKey(error));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/contracts', this.id()]);
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (contract) => {
        this.contract.set(contract);
        const value = formFromContract(contract);
        // The amount reads as people write it ("850 000"), not as stored ("850000.00").
        this.seed.set({
          ...value,
          value_amount: value.value_amount
            ? displayAmount(value.value_amount, this.language.locale())
            : '',
        });
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(contractErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
