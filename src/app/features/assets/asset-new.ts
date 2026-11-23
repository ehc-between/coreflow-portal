import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { Alert } from '../../shared/ui/alert/alert';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { assetErrorKey } from './data/asset-errors';
import { CreateAssetRequest } from './data/asset.models';
import { AssetsApi } from './data/assets-api';
import { AssetForm, AssetFormValue } from './asset-form';
import { AssetOptionsService } from './shared/asset-select';
import { customerIdFromRoute } from '../../shared/customers';

/** The create body of a form value: an unset owner is left out so the backend defaults it to the caller. */
export function createAssetBody(value: AssetFormValue): CreateAssetRequest {
  const { owner_user_id, ...rest } = value.fields;
  return {
    ...rest,
    ...(owner_user_id ? { owner_user_id } : {}),
    ...(value.lastCalibratedOn ? { last_calibrated_on: value.lastCalibratedOn } : {}),
  };
}

/**
 * Register a new asset (`/assets/new`). The owner defaults to the caller. Opened from a
 * requirement (`?fromRequirement=`), the new asset documents that requirement once saved.
 */
@Component({
  selector: 'app-asset-new',
  imports: [TranslocoPipe, Alert, AssetForm, FlowBanner, HelpStrip, PageHeader, WhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="assets.form.newTitle"
        descriptionKey="assets.form.newSubtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.assets', link: '/assets' },
          { labelKey: 'assets.form.newTitle' },
        ]"
        backLink="/assets"
        backLabelKey="assets.common.backToInventory"
      />
      <app-help-strip scope="assets" page="form" />
      <app-flow-banner [flow]="flow()" />
      @if (error(); as key) {
        <div class="mb-4">
          <app-alert>{{ key | transloco }}</app-alert>
        </div>
      }
      <app-asset-form
        [busy]="busy()"
        [customerId]="customerId()"
        (submitted)="save($event)"
        (cancelled)="back()"
      />
      <div class="mt-8"><app-why-it-matters scope="assets" page="form" /></div>
    </div>
  `,
})
export class AssetNew {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly options = inject(AssetOptionsService);
  private readonly router = inject(Router);
  private readonly flows = inject(CreateFlowService);

  /** The requirement (or flow) this form was opened from, if any. */
  private readonly route = inject(ActivatedRoute);
  protected readonly flow = this.flows.consume(this.route, { targetType: 'asset' });
  /** Customer property: from the customer card's flow or `?customer_id=`. */
  protected readonly customerId = computed(() => {
    const id = this.flow()?.prefill?.['customer_id'];
    return typeof id === 'string' && id ? id : customerIdFromRoute(this.route);
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    providePageContext(() => ({
      module: 'assets',
      entityType: 'asset',
      view: 'new',
      title: this.language.translate('assets.form.newTitle'),
    }));
  }

  protected save(value: AssetFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.create(orgId, createAssetBody(value)).subscribe({
      next: (asset) => {
        this.busy.set(false);
        this.options.refresh();
        this.notifications.success('assets.form.created', { code: asset.code });
        if (this.flow()) {
          this.flows
            .complete(asset.id, 'asset')
            .pipe(catchError(() => of(null)))
            .subscribe();
        }
        void this.router.navigate(['/assets', asset.id]);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(assetErrorKey(err));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/assets']);
  }
}
