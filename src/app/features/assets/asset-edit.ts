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
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Alert } from '../../shared/ui/alert/alert';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { changedFields } from './data/asset-display';
import { assetErrorKey } from './data/asset-errors';
import { AssetDetail } from './data/asset.models';
import { AssetsApi } from './data/assets-api';
import { AssetForm, AssetFormValue, assetDraftFrom, assetFieldsFrom } from './asset-form';
import { AssetOptionsService } from './shared/asset-select';

/** Edit an asset (`/assets/:id/edit`); only changed fields are sent, with a reason. */
@Component({
  selector: 'app-asset-edit',
  imports: [TranslocoPipe, Alert, AssetForm, ErrorState, HelpStrip, LoadingState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state
            titleKey="assets.detail.notFoundTitle"
            bodyKey="assets.detail.notFound"
            (retry)="reload()"
          />
        }
        @default {
          @if (asset(); as a) {
            <app-page-header
              titleKey="assets.form.editTitle"
              [titleParams]="{ code: a.code, name: a.name }"
              [breadcrumbs]="[
                { labelKey: 'modules.names.assets', link: '/assets' },
                { label: a.name, link: ['/assets', a.id] },
                { labelKey: 'assets.common.edit' },
              ]"
              [backLink]="['/assets', a.id]"
              backLabelKey="assets.common.backToAsset"
            />
            <app-help-strip scope="assets" page="form" [subject]="a.name" />
            @if (error(); as key) {
              <div class="mb-4">
                <app-alert>{{ key | transloco }}</app-alert>
              </div>
            }
            <app-asset-form
              [value]="a"
              [busy]="busy()"
              (submitted)="save(a, $event)"
              (cancelled)="back()"
            />
          }
        }
      }
    </div>
  `,
})
export class AssetEdit {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly options = inject(AssetOptionsService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly asset = signal<AssetDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const a = this.asset();
      return {
        module: 'assets',
        entityType: 'asset',
        entityId: this.id(),
        view: 'edit',
        title: a ? `${a.code} ${a.name}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected save(current: AssetDetail, value: AssetFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const changes = changedFields(assetFieldsFrom(assetDraftFrom(current)), value.fields);
    if (Object.keys(changes).length === 0) {
      this.back();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .update(orgId, current.id, { ...changes, change_reason: value.changeReason })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.options.refresh();
          this.notifications.success('assets.form.saved');
          this.back();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(assetErrorKey(err));
        },
      });
  }

  protected back(): void {
    void this.router.navigate(['/assets', this.id()]);
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (a) => {
        this.asset.set(a);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
