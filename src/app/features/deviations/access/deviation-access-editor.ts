import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AccessGrant,
  AccessLevel,
  AccessSubjectType,
  DeviationVisibility,
} from '../../../core/deviations/deviation.models';
import { notifyDeviationError } from '../../../core/deviations/deviation-errors';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';

/** A subject (user or department) the user can pick to grant access to. */
interface PickerSubject {
  readonly subject_type: AccessSubjectType;
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

/** A selectable owner (org user). */
interface OwnerOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Live owner + visibility + grants editor for a deviation's access, mirroring the
 * documents access editor. Each change persists immediately: owner / visibility
 * via `updateDeviation` (PATCH, requires `deviations:manage` server-side); grants
 * via `addGrant` / `removeGrant`. Subjects (org users + departments) are fetched
 * once. `canManage` gates the controls — read-only when false.
 */
@Component({
  selector: 'app-deviation-access-editor',
  imports: [FormsModule, TranslocoPipe, Badge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-5">
      <div class="grid gap-1.5">
        <label for="dev-access-owner" class="text-[13px] font-semibold text-fg-muted">
          {{ 'deviations.access.owner' | transloco }}
        </label>
        @if (canManage()) {
          <div class="cf-select">
            <select
              id="dev-access-owner"
              [ngModel]="owner()"
              (ngModelChange)="onOwnerChange($event)"
            >
              <option value="">{{ 'deviations.access.unassigned' | transloco }}</option>
              @for (option of ownerOptions(); track option.id) {
                <option [value]="option.id">{{ option.name }}</option>
              }
            </select>
          </div>
        } @else {
          <p class="text-[13.5px] text-fg">
            {{ ownerName() || ('deviations.access.unassigned' | transloco) }}
          </p>
        }
      </div>

      <div class="grid gap-2">
        <span class="text-[13px] font-semibold text-fg-muted">
          {{ 'deviations.access.visibility' | transloco }}
        </span>
        @if (canManage()) {
          <div class="grid gap-2 sm:grid-cols-2">
            @for (option of visibilityOptions; track option.value) {
              <button
                type="button"
                (click)="onVisibilityChange(option.value)"
                [class.border-accent]="visibility() === option.value"
                [class.bg-accent-soft]="visibility() === option.value"
                [class.ring-1]="visibility() === option.value"
                [class.ring-accent]="visibility() === option.value"
                [class.border-border]="visibility() !== option.value"
                class="flex flex-col gap-1 rounded-tile border bg-surface px-3.5 py-3 text-left transition-colors hover:border-border-strong"
              >
                <span
                  class="flex items-center gap-2 text-[13.5px] font-semibold"
                  [class.text-accent]="visibility() === option.value"
                  [class.text-fg]="visibility() !== option.value"
                >
                  <app-icon [name]="option.icon" [size]="15" />
                  {{ option.labelKey | transloco }}
                </span>
                <span class="text-[12.5px] text-fg-subtle">{{ option.hintKey | transloco }}</span>
              </button>
            }
          </div>
        } @else {
          <span class="flex items-center gap-2 text-[13.5px] text-fg">
            <app-icon [name]="visibility() === 'restricted' ? 'lock' : 'people'" [size]="15" />
            {{
              (visibility() === 'restricted'
                ? 'deviations.access.restricted'
                : 'deviations.access.organization'
              ) | transloco
            }}
          </span>
        }
      </div>

      @if (visibility() === 'restricted') {
        <div class="grid gap-2.5">
          <span class="text-[13px] font-semibold text-fg-muted">
            {{ 'deviations.access.peopleAndDepartments' | transloco }}
          </span>

          @if (canManage()) {
            <div class="flex flex-col gap-2">
              <div class="relative">
                <input
                  type="text"
                  [ngModel]="query()"
                  (ngModelChange)="query.set($event)"
                  (focus)="pickerOpen.set(true)"
                  [placeholder]="'deviations.access.addPlaceholder' | transloco"
                  [attr.aria-label]="'deviations.access.peopleAndDepartments' | transloco"
                  autocomplete="off"
                  class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-ellipsis text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                />
                @if (pickerOpen() && filteredSubjects().length) {
                  <ul
                    class="animate-cf-pop absolute top-full left-0 z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
                  >
                    @for (subject of filteredSubjects(); track subject.subject_type + subject.id) {
                      <li>
                        <button
                          type="button"
                          (click)="pickSubject(subject)"
                          class="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left hover:bg-surface-2"
                        >
                          <app-icon
                            [name]="subject.subject_type === 'department' ? 'people' : 'userplus'"
                            [size]="15"
                            class="flex-none text-fg-subtle"
                          />
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-[13.5px] text-fg">{{
                              subject.name
                            }}</span>
                            @if (subject.email) {
                              <span class="block truncate text-[12px] text-fg-subtle">{{
                                subject.email
                              }}</span>
                            }
                          </span>
                          <app-badge tone="neutral" class="flex-none">{{
                            (subject.subject_type === 'department'
                              ? 'deviations.access.department'
                              : 'deviations.access.person'
                            ) | transloco
                          }}</app-badge>
                        </button>
                      </li>
                    }
                  </ul>
                }
              </div>

              <div class="cf-select">
                <select
                  [ngModel]="pendingLevel()"
                  (ngModelChange)="pendingLevel.set($event)"
                  [attr.aria-label]="'deviations.access.level' | transloco"
                >
                  <option value="view">{{ 'deviations.access.view' | transloco }}</option>
                  <option value="edit">{{ 'deviations.access.edit' | transloco }}</option>
                </select>
              </div>
            </div>
          }

          @if (grants().length) {
            <ul class="flex flex-col gap-1.5">
              @for (grant of grants(); track grant.id) {
                <li
                  class="flex items-center gap-2.5 rounded-tile border border-border bg-surface-2 px-3 py-2"
                >
                  <app-icon
                    [name]="grant.subject_type === 'department' ? 'people' : 'userplus'"
                    [size]="15"
                    class="flex-none text-fg-subtle"
                  />
                  <span class="min-w-0 flex-1 truncate text-[13.5px] text-fg">{{
                    grant.subject_name
                  }}</span>
                  <app-badge [tone]="grant.level === 'edit' ? 'accent' : 'neutral'">{{
                    (grant.level === 'edit' ? 'deviations.access.edit' : 'deviations.access.view')
                      | transloco
                  }}</app-badge>
                  @if (canManage()) {
                    <button
                      type="button"
                      [attr.aria-label]="'deviations.access.remove' | transloco"
                      (click)="removeGrant(grant)"
                      class="flex flex-none rounded-[8px] p-1 text-fg-subtle hover:bg-surface hover:text-fg"
                    >
                      <app-icon name="x" [size]="15" />
                    </button>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="text-[13px] text-fg-subtle">
              {{ 'deviations.access.noGrants' | transloco }}
            </p>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '[class.relative]': 'pickerOpen()',
    '[class.z-40]': 'pickerOpen()',
  },
})
export class DeviationAccessEditor {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly deviationId = input.required<string>();
  /** Whether the manage controls are shown. Read-only when false. */
  readonly canManage = input(true);

  readonly owner = input<string>('');
  readonly visibility = input<DeviationVisibility>('organization');
  readonly grants = input<readonly AccessGrant[]>([]);
  readonly ownerName = input<string>('');

  readonly ownerChange = output<string>();
  readonly visibilityChange = output<DeviationVisibility>();
  readonly grantsChange = output<readonly AccessGrant[]>();

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly query = signal('');
  protected readonly pendingLevel = signal<AccessLevel>('view');
  protected readonly pickerOpen = signal(false);

  private readonly subjects = signal<readonly PickerSubject[]>([]);
  private readonly orgUsers = signal<readonly OwnerOption[]>([]);

  protected readonly visibilityOptions = [
    {
      value: 'organization' as const,
      icon: 'people',
      labelKey: 'deviations.access.organization',
      hintKey: 'deviations.access.organizationHint',
    },
    {
      value: 'restricted' as const,
      icon: 'lock',
      labelKey: 'deviations.access.restricted',
      hintKey: 'deviations.access.restrictedHint',
    },
  ];

  /** Org members as owner options; ensures the current owner is always present. */
  protected readonly ownerOptions = computed<readonly OwnerOption[]>(() => {
    const users = this.orgUsers();
    const current = this.owner();
    if (current && !users.some((u) => u.id === current)) {
      return [{ id: current, name: this.ownerName() || current }, ...users];
    }
    return users;
  });

  /** Subjects matching the query that aren't already granted. */
  protected readonly filteredSubjects = computed<readonly PickerSubject[]>(() => {
    const granted = new Set(this.grants().map((g) => `${g.subject_type}:${g.subject_id}`));
    const q = this.query().trim().toLowerCase();
    return this.subjects()
      .filter((s) => !granted.has(`${s.subject_type}:${s.id}`))
      .filter(
        (s) => q === '' || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
      )
      .slice(0, 8);
  });

  private loadedForOrg: string | null = null;

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      if (orgId && orgId !== this.loadedForOrg) {
        this.loadedForOrg = orgId;
        this.loadSubjects(orgId);
      }
    });
  }

  protected onOwnerChange(userId: string): void {
    const orgId = this.orgId();
    const deviationId = this.deviationId();
    if (!orgId) {
      return;
    }
    this.api.updateDeviation(orgId, deviationId, { owner_user_id: userId }).subscribe({
      next: () => {
        this.ownerChange.emit(userId);
        this.notifications.success('deviations.access.savedToast');
      },
      error: (error: unknown) => notifyDeviationError(this.notifications, error),
    });
  }

  protected onVisibilityChange(visibility: DeviationVisibility): void {
    if (visibility === this.visibility()) {
      return;
    }
    const orgId = this.orgId();
    const deviationId = this.deviationId();
    if (!orgId) {
      return;
    }
    this.api.updateDeviation(orgId, deviationId, { visibility }).subscribe({
      next: () => {
        this.visibilityChange.emit(visibility);
        this.notifications.success('deviations.access.savedToast');
      },
      error: (error: unknown) => notifyDeviationError(this.notifications, error),
    });
  }

  protected pickSubject(subject: PickerSubject): void {
    const level = this.pendingLevel();
    this.query.set('');
    this.pickerOpen.set(false);

    const orgId = this.orgId();
    const deviationId = this.deviationId();
    if (!orgId) {
      return;
    }
    this.api
      .addGrant(orgId, deviationId, {
        subject_type: subject.subject_type,
        subject_id: subject.id,
        level,
      })
      .subscribe({
        next: (grant) => {
          this.grantsChange.emit([...this.grants(), grant]);
          this.notifications.success('deviations.access.grantAddedToast');
        },
        error: (error: unknown) => notifyDeviationError(this.notifications, error),
      });
  }

  protected removeGrant(grant: AccessGrant): void {
    const orgId = this.orgId();
    const deviationId = this.deviationId();
    if (!orgId) {
      return;
    }
    const remaining = this.grants().filter((g) => g.id !== grant.id);
    this.api.removeGrant(orgId, deviationId, grant.id).subscribe({
      next: () => {
        this.grantsChange.emit(remaining);
        this.notifications.info('deviations.access.grantRemovedToast');
      },
      error: (error: unknown) => notifyDeviationError(this.notifications, error),
    });
  }

  protected onDocumentClick(event: Event): void {
    if (!this.pickerOpen()) {
      return;
    }
    const target = event.target as HTMLElement;
    if (!target.closest('app-deviation-access-editor .relative')) {
      this.pickerOpen.set(false);
    }
  }

  private loadSubjects(orgId: string): void {
    this.api.listAccessSubjects(orgId).subscribe({
      next: (data) => {
        this.orgUsers.set(data.users.map((u) => ({ id: u.id, name: u.name })));
        this.subjects.set([
          ...data.users.map((u) => ({
            subject_type: 'user' as const,
            id: u.id,
            name: u.name,
            email: u.email,
          })),
          ...data.departments.map((d) => ({
            subject_type: 'department' as const,
            id: d.id,
            name: d.name,
            email: '',
          })),
        ]);
      },
    });
  }
}
