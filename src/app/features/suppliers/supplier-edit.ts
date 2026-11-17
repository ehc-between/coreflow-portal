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
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { changedFields } from './data/supplier-display';
import { invalidCountry, supplierErrorKey } from './data/supplier-errors';
import { SupplierDetail, UpdateSupplierRequest } from './data/supplier.models';
import { SuppliersApi } from './data/suppliers-api';
import { SupplierForm, SupplierFormValue, draftFrom, fieldsFrom } from './supplier-form';

/**
 * The changed fields, plus the data locations when the stored ones were flagged for
 * review (e.g. "IR" truncated from "Ireland"): saving the form with the warning in view
 * confirms them, which clears the flag.
 */
export function locationsReviewed(
  current: SupplierDetail,
  changes: UpdateSupplierRequest,
  locations: readonly string[],
): UpdateSupplierRequest {
  const flagged = (current.data_location_details ?? []).some((l) => l.needs_review);
  return flagged && !('data_locations' in changes)
    ? { ...changes, data_locations: [...locations] }
    : changes;
}

/** Edit a supplier (`/suppliers/:id/edit`); only changed fields are sent, with a reason. */
@Component({
  selector: 'app-supplier-edit',
  imports: [TranslocoPipe, Alert, ErrorState, LoadingState, PageHeader, SupplierForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state
            titleKey="suppliers.detail.notFoundTitle"
            bodyKey="suppliers.detail.notFound"
            (retry)="back()"
          />
        }
        @default {
          @if (supplier(); as s) {
            <app-page-header
              titleKey="suppliers.form.editTitle"
              [titleParams]="{ name: s.name }"
              [breadcrumbs]="[
                { labelKey: 'modules.names.suppliers', link: '/suppliers' },
                { label: s.name, link: ['/suppliers', s.id] },
                { labelKey: 'suppliers.common.edit' },
              ]"
              [backLink]="['/suppliers', s.id]"
              backLabelKey="suppliers.common.backToSupplier"
            />
            @if (!s.can_edit) {
              <app-alert tone="info">{{ 'suppliers.form.readOnly' | transloco }}</app-alert>
            } @else {
              @if (error(); as key) {
                <div class="mb-4">
                  <app-alert>{{ key | transloco }}</app-alert>
                </div>
              }
              <app-supplier-form
                [value]="s"
                [busy]="busy()"
                [invalidCountry]="countryError()"
                (submitted)="save(s, $event)"
                (cancelled)="back()"
              />
            }
          }
        }
      }
    </div>
  `,
})
export class SupplierEdit {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly supplier = signal<SupplierDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly countryError = signal<ReturnType<typeof invalidCountry>>(null);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'suppliers',
      entityType: 'supplier',
      entityId: this.id(),
      view: 'edit',
      title: this.supplier()?.name ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.get(orgId, id).subscribe({
          next: (s) => {
            this.supplier.set(s);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected save(current: SupplierDetail, value: SupplierFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const changes = locationsReviewed(
      current,
      changedFields(fieldsFrom(draftFrom(current)), value.fields),
      value.fields.data_locations,
    );
    if (Object.keys(changes).length === 0) {
      this.back();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.countryError.set(null);
    this.api
      .update(orgId, current.id, { ...changes, change_reason: value.changeReason })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.notifications.success('suppliers.form.saved');
          this.back();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(supplierErrorKey(err));
          this.countryError.set(invalidCountry(err));
        },
      });
  }

  protected back(): void {
    void this.router.navigate(['/suppliers', this.id()]);
  }
}
