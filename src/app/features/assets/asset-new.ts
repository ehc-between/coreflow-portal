import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { assetErrorKey } from './data/asset-errors';
import { CreateAssetRequest } from './data/asset.models';
import { AssetsApi } from './data/assets-api';
import { AssetForm, AssetFormValue } from './asset-form';
import { AssetOptionsService } from './shared/asset-select';

/** The create body of a form value: an unset owner is left out so the backend defaults it to the caller. */
export function createAssetBody(value: AssetFormValue): CreateAssetRequest {
  const { owner_user_id, ...rest } = value.fields;
  return {
    ...rest,
    ...(owner_user_id ? { owner_user_id } : {}),
    ...(value.lastCalibratedOn ? { last_calibrated_on: value.lastCalibratedOn } : {}),
  };
}

/** Register a new asset (`/assets/new`). The owner defaults to the caller. */
@Component({
  selector: 'app-asset-new',
  imports: [RouterLink, TranslocoPipe, Alert, AssetForm, GuideIntro, Icon, WhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/assets"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'assets.common.backToInventory' | transloco }}
      </a>
      <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
        {{ 'assets.form.newTitle' | transloco }}
      </h1>
      <p class="mb-4 text-[14px] text-fg-muted">{{ 'assets.form.newSubtitle' | transloco }}</p>
      <div class="mb-4"><app-guide-intro scope="assets" page="form" /></div>
      @if (error(); as key) {
        <div class="mb-4">
          <app-alert>{{ key | transloco }}</app-alert>
        </div>
      }
      <app-asset-form [busy]="busy()" (submitted)="save($event)" (cancelled)="back()" />
      <div class="mt-6"><app-why-it-matters scope="assets" page="form" /></div>
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
