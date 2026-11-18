import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../shared/ui/page-header/page-header';
import { Switch } from '../../shared/ui/switch/switch';
import { ContractField } from './contract-field';
import { ContractsApi } from './data/contracts-api';
import { ContractSettings, PERM_MANAGE } from './data/contract.models';
import { contractErrorKey } from './data/contract-errors';
import { ModuleConfigNav } from '../../shared/ui/module-config-nav/module-config-nav';
import { moduleConfigCrumbs } from '../../core/modules/module-config';

/** Whole months 1-60, or null. */
export function reviewMonths(value: string): number | null {
  const n = Number(value.trim());
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : null;
}

/**
 * Contract settings of the organisation (`/settings/modules/contracts`): segregation of
 * duties for approvals (on by default: the person who submitted or owns a contract
 * cannot approve it) and how often supplier, SLA and data processing agreements are
 * reviewed. Read for members, editable with `contracts:manage`; changes are audited.
 */
@Component({
  selector: 'app-contract-settings',
  imports: [
    ModuleConfigNav,
    TranslocoPipe,
    Button,
    Card,
    ErrorState,
    LoadingState,
    PageHeader,
    Switch,
    ContractField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-24 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="contracts.settings.title"
        descriptionKey="contracts.settings.subtitle"
        [breadcrumbs]="breadcrumbs"
        backLink="/contracts"
        backLabelKey="contracts.common.backToList"
      />
      <app-module-config-nav module="contracts" />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="3" />
        }
        @case ('error') {
          <app-error-state (retry)="load()" />
        }
        @default {
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()">
            <app-card>
              <h2 class="font-display text-card font-bold text-fg">
                {{ 'contracts.settings.sodTitle' | transloco }}
              </h2>
              <p class="mt-1 mb-3 text-ui text-fg-muted">
                {{ 'contracts.settings.sodBody' | transloco }}
              </p>
              <app-switch
                [checked]="independent()"
                (checkedChange)="canManage() && independent.set($event)"
                [attr.aria-disabled]="!canManage()"
                data-testid="settings-sod"
              >
                {{ 'contracts.settings.sodLabel' | transloco }}
              </app-switch>
            </app-card>
            <app-card>
              <h2 class="mb-1 font-display text-card font-bold text-fg">
                {{ 'contracts.settings.reviewTitle' | transloco }}
              </h2>
              <p class="mb-3 text-ui text-fg-muted">
                {{ 'contracts.settings.reviewBody' | transloco }}
              </p>
              <div class="max-w-[220px]">
                <app-contract-field
                  [label]="'contracts.settings.reviewMonths' | transloco"
                  inputId="cf-settings-months"
                >
                  <input
                    id="cf-settings-months"
                    type="number"
                    min="1"
                    max="60"
                    inputmode="numeric"
                    [disabled]="!canManage()"
                    [value]="months()"
                    (input)="months.set($any($event.target).value)"
                    [attr.aria-invalid]="monthsInvalid()"
                    data-testid="settings-months"
                  />
                </app-contract-field>
              </div>
              @if (monthsInvalid()) {
                <p class="mt-1 text-meta text-fail">
                  {{ 'contracts.settings.monthsInvalid' | transloco }}
                </p>
              }
            </app-card>
            @if (canManage()) {
              <div class="flex justify-end">
                <app-button
                  type="submit"
                  [loading]="saving()"
                  [disabled]="saving() || monthsInvalid()"
                  data-testid="settings-save"
                >
                  {{ 'common.save' | transloco }}
                </app-button>
              </div>
            } @else {
              <p class="text-meta text-fg-muted">{{ 'contracts.settings.readOnly' | transloco }}</p>
            }
          </form>
        }
      }
    </div>
  `,
})
export class ContractSettingsPage {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly breadcrumbs: readonly Breadcrumb[] = [
    ...moduleConfigCrumbs('contracts'),
    { labelKey: 'contracts.settings.title' },
  ];
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly saving = signal(false);
  protected readonly independent = signal(true);
  protected readonly months = signal('12');
  protected readonly monthsInvalid = computed(() => reviewMonths(this.months()) === null);
  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_MANAGE),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'contracts',
      entityType: null,
      view: 'settings',
      title: this.language.translate('contracts.settings.title'),
    }));
    effect(() => {
      this.selectedOrg.currentOrgId();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.settings(orgId).subscribe({
      next: (s) => {
        this.apply(s);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const months = reviewMonths(this.months());
    if (!orgId || months === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api
      .updateSettings(orgId, {
        require_independent_approver: this.independent(),
        default_review_months: months,
      })
      .subscribe({
        next: (s) => {
          this.saving.set(false);
          this.apply(s);
          this.notifications.success('contracts.notices.settingsSaved');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notifications.error(contractErrorKey(error));
        },
      });
  }

  private apply(s: ContractSettings): void {
    this.independent.set(s.require_independent_approver);
    this.months.set(String(s.default_review_months));
  }
}
