import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import { invalidCountry, supplierErrorKey } from './data/supplier-errors';
import { SuppliersApi } from './data/suppliers-api';
import { SupplierForm, SupplierFormValue } from './supplier-form';

/**
 * Register a new supplier (`/suppliers/new`). It starts as "Potensiell" until an
 * evaluation approves it. Opened from a requirement (`?fromRequirement=`), the new
 * supplier documents that requirement once saved.
 */
@Component({
  selector: 'app-supplier-new',
  imports: [TranslocoPipe, Alert, FlowBanner, HelpStrip, PageHeader, SupplierForm, WhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="suppliers.form.newTitle"
        descriptionKey="suppliers.form.newSubtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.suppliers', link: '/suppliers' },
          { labelKey: 'suppliers.form.newTitle' },
        ]"
        backLink="/suppliers"
        backLabelKey="suppliers.common.backToRegister"
      />
      <app-help-strip scope="suppliers" page="form" />
      <app-flow-banner [flow]="flow()" />
      @if (error(); as key) {
        <div class="mb-4">
          <app-alert>{{ key | transloco }}</app-alert>
        </div>
      }
      <app-supplier-form
        [busy]="busy()"
        [invalidCountry]="countryError()"
        (submitted)="save($event)"
        (cancelled)="back()"
      />
      <div class="mt-8"><app-why-it-matters scope="suppliers" page="form" /></div>
    </div>
  `,
})
export class SupplierNew {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly flows = inject(CreateFlowService);

  /** The create-from-here flow or requirement this form was opened from, if any. */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), { targetType: 'supplier' });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly countryError = signal<ReturnType<typeof invalidCountry>>(null);

  constructor() {
    providePageContext(() => ({
      module: 'suppliers',
      entityType: 'supplier',
      view: 'new',
      title: this.language.translate('suppliers.form.newTitle'),
    }));
  }

  protected save(value: SupplierFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.countryError.set(null);
    this.api.create(orgId, value.fields).subscribe({
      next: (supplier) => {
        this.busy.set(false);
        this.notifications.success('suppliers.form.created', { code: supplier.code });
        if (this.flow()) {
          this.flows
            .complete(supplier.id, 'supplier')
            .pipe(catchError(() => of(null)))
            .subscribe();
        }
        void this.router.navigate(['/suppliers', supplier.id]);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(supplierErrorKey(err));
        this.countryError.set(invalidCountry(err));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/suppliers']);
  }
}
