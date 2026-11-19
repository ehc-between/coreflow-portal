import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { authErrorCode } from '../../../core/auth/auth-errors';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgApi } from '../../../core/org/org-api';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import { OrgMfaPolicy, OrgRole } from '../../../core/org/org.models';
import { relevantRoles } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RoleNamePipe } from '../../../shared/roles/role-name.pipe';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';

const POLICIES: readonly OrgMfaPolicy[] = ['off', 'all', 'roles'];

/** i18n key for a failed save, by the server's error code. */
export function mfaPolicyErrorKey(error: unknown): string {
  switch (authErrorCode(error)) {
    case 'mfa_verification_required':
      return 'settings.mfa.error.verifySelf';
    case 'mfa_roles_required':
      return 'settings.mfa.error.rolesRequired';
    case 'unknown_roles':
      return 'settings.mfa.error.unknownRoles';
    default:
      return 'settings.mfa.error.saveFailed';
  }
}

/**
 * Org policy "require two-step verification" (`org:manage`; the host gates
 * rendering): off, every member, or members holding chosen roles. Members it
 * applies to keep their roles but get no access in this org until they sign
 * in with (or set up) a second factor; the server enforces it. Saved with an
 * explicit button since "roles" needs a role selection. Reloads on org switch.
 */
@Component({
  selector: 'app-org-mfa-settings',
  imports: [RouterLink, TranslocoPipe, RoleNamePipe, Alert, Button, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-testid="settings-mfa">
      <h2 class="mb-3 font-display text-section font-bold text-fg">
        {{ 'settings.mfa.title' | transloco }}
      </h2>
      <app-card>
        @if (loading()) {
          <p class="text-ui text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else if (loadError()) {
          <app-alert>{{ 'settings.mfa.loadError' | transloco }}</app-alert>
        } @else {
          <fieldset class="flex flex-col gap-3">
            <legend class="mb-1 text-ui text-fg-muted">
              {{ 'settings.mfa.hint' | transloco }}
            </legend>
            @for (option of policies; track option) {
              <label class="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="mfa-policy"
                  class="mt-1 accent-accent"
                  [attr.data-testid]="'mfa-policy-' + option"
                  [checked]="policy() === option"
                  [disabled]="saving()"
                  (change)="setPolicy(option)"
                />
                <span>
                  <span class="block text-ui font-semibold text-fg">
                    {{ 'settings.mfa.policy.' + option | transloco }}
                  </span>
                  <span class="block text-meta text-fg-muted">
                    {{ 'settings.mfa.policyHint.' + option | transloco }}
                  </span>
                </span>
              </label>
            }
          </fieldset>

          @if (policy() === 'roles') {
            <fieldset class="mt-4 flex flex-col gap-2 border-t border-border pt-4">
              <legend class="mb-1 text-ui font-semibold text-fg">
                {{ 'settings.mfa.rolesLabel' | transloco }}
              </legend>
              @for (role of shownRoles(); track role.key) {
                <label class="flex cursor-pointer items-center gap-2.5 text-ui text-fg">
                  <input
                    type="checkbox"
                    class="accent-accent"
                    [attr.data-testid]="'mfa-role-' + role.key"
                    [checked]="selectedRoles().has(role.key)"
                    [disabled]="saving()"
                    (change)="toggleRole(role.key)"
                  />
                  {{ role.key | roleName: role.name }}
                </label>
              }
            </fieldset>
          }

          @if (error(); as error) {
            <app-alert class="mt-4 block">
              {{ error | transloco }}
              @if (error === 'settings.mfa.error.verifySelf') {
                <a routerLink="/account/security" class="ml-1 underline">
                  {{ 'settings.mfa.setUpOwn' | transloco }}
                </a>
              }
            </app-alert>
          }

          <div class="mt-4 flex justify-end">
            <app-button
              data-testid="mfa-policy-save"
              [loading]="saving()"
              [disabled]="!dirty()"
              (click)="save()"
            >
              {{ 'settings.save' | transloco }}
            </app-button>
          </div>
        }
      </app-card>
    </section>
  `,
})
export class OrgMfaSettings {
  private readonly orgApi = inject(OrgApi);
  private readonly membersApi = inject(OrgMembersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);

  protected readonly policies = POLICIES;

  protected readonly policy = signal<OrgMfaPolicy>('off');
  protected readonly selectedRoles = signal<ReadonlySet<string>>(new Set());
  protected readonly roles = signal<readonly OrgRole[]>([]);
  /** U37: the named roles plus any the policy already lists, not the whole global catalogue. */
  protected readonly shownRoles = computed(() =>
    relevantRoles(this.roles(), this.saved().roles.split(',').filter(Boolean)),
  );
  /** Last saved values, to know whether there is anything to save. */
  private readonly saved = signal<{ policy: OrgMfaPolicy; roles: string }>({
    policy: 'off',
    roles: '',
  });

  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly dirty = computed(() => {
    const saved = this.saved();
    return saved.policy !== this.policy() || saved.roles !== this.roleList().join(',');
  });

  private readonly roleList = computed(() => [...this.selectedRoles()].sort());

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.error.set(null);
      this.loadError.set(false);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected setPolicy(policy: OrgMfaPolicy): void {
    this.policy.set(policy);
    this.error.set(null);
  }

  protected toggleRole(key: string): void {
    this.selectedRoles.update((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
    this.error.set(null);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    const policy = this.policy();
    const roles = policy === 'roles' ? this.roleList() : [];
    if (policy === 'roles' && roles.length === 0) {
      this.error.set('settings.mfa.error.rolesRequired');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.orgApi.updateSettings(orgId, { mfa_policy: policy, mfa_required_roles: roles }).subscribe({
      next: (settings) => {
        this.saving.set(false);
        this.apply(settings.mfa_policy, settings.mfa_required_roles);
        this.toasts.success('settings.mfa.saved');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(mfaPolicyErrorKey(err));
      },
    });
  }

  private apply(policy: OrgMfaPolicy | undefined, roles: readonly string[] | undefined): void {
    const value = policy ?? 'off';
    const set = new Set(roles ?? []);
    this.policy.set(value);
    this.selectedRoles.set(set);
    this.saved.set({ policy: value, roles: [...set].sort().join(',') });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.orgApi.getSettings(orgId).subscribe({
      next: (settings) => {
        if (this.selectedOrg.currentOrgId() !== orgId) {
          return;
        }
        this.apply(settings.mfa_policy, settings.mfa_required_roles);
        this.loading.set(false);
      },
      error: () => {
        if (this.selectedOrg.currentOrgId() !== orgId) {
          return;
        }
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
    this.membersApi.listRoles(orgId).subscribe({
      next: (roles) => {
        if (this.selectedOrg.currentOrgId() === orgId) {
          this.roles.set(roles);
        }
      },
    });
  }
}
