import { Injectable, computed, inject } from '@angular/core';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import {
  CUSTOMERS_MANAGE,
  CUSTOMERS_MODULE,
  CUSTOMERS_READ,
  CUSTOMERS_WRITE,
} from './customer.models';

/**
 * Whether the customer register can be used here: the module is switched on for
 * the selected org (and known to the server: a backend without the module counts
 * as off) and what the user may do in it. The shared customer picker, chip and
 * filter read it, so other modules never check the module or permissions themselves.
 */
@Injectable({ providedIn: 'root' })
export class CustomersAvailability {
  private readonly modules = inject(ModuleService);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly permissions = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );

  /** The customers module is on for the selected org. */
  readonly enabled = computed(() => this.modules.enabledKeys().has(CUSTOMERS_MODULE));
  readonly canRead = computed(() => this.enabled() && this.permissions().has(CUSTOMERS_READ));
  readonly canWrite = computed(() => this.enabled() && this.permissions().has(CUSTOMERS_WRITE));
  readonly canManage = computed(() => this.enabled() && this.permissions().has(CUSTOMERS_MANAGE));
}
