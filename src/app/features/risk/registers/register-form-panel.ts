import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { RiskApi } from '../data/risk-api';
import { riskErrorKey } from '../data/risk-errors';
import {
  Matrix,
  RISK_CATEGORIES,
  Register,
  RegisterCreate,
  RegisterStatus,
  RiskCategory,
} from '../data/risk.models';
import { PersonSelect } from '../shared/person-select';
import { RiskPermissions } from '../shared/risk-permissions';

interface RegisterForm {
  readonly name: string;
  readonly category: RiskCategory;
  readonly description: string;
  readonly matrix_id: string;
  readonly owner_user_id: string;
  readonly review_interval_months: string;
  readonly is_default: boolean;
  readonly status: RegisterStatus;
}

function toForm(r: Register | null, matrices: readonly Matrix[]): RegisterForm {
  return {
    name: r?.name ?? '',
    category: r?.category ?? 'enterprise',
    description: r?.description ?? '',
    matrix_id: r?.matrix_id ?? matrices.find((m) => m.is_default)?.id ?? matrices[0]?.id ?? '',
    owner_user_id: r?.owner?.id ?? '',
    review_interval_months: String(r?.review_interval_months ?? 12),
    is_default: r?.is_default ?? false,
    status: r?.status ?? 'active',
  };
}

/** Side panel to create (`register` null) or edit a risk register (`risk:manage`). */
@Component({
  selector: 'app-register-form-panel',
  imports: [TranslocoPipe, FieldHelp, Alert, Button, FormField, SlideOver, PersonSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="(register() ? 'risk.registers.editTitle' : 'risk.registers.newTitle') | transloco"
      [closeLabel]="'risk.common.close' | transloco"
      (closed)="closed.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
        <app-form-field [label]="'risk.registers.name' | transloco" inputId="register-name">
          <input
            id="register-name"
            required
            maxlength="255"
            [value]="form().name"
            (input)="set('name', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'risk.fields.category' | transloco" inputId="register-category">
          <select id="register-category" (change)="set('category', $any($event.target).value)">
            @for (c of categories; track c) {
              <option [value]="c" [selected]="c === form().category">
                {{ 'risk.categories.' + c | transloco }}
              </option>
            }
          </select>
          <app-field-help scope="risk" page="registers" field="category" />
        </app-form-field>
        <app-form-field [label]="'risk.registers.matrix' | transloco" inputId="register-matrix">
          <select id="register-matrix" (change)="set('matrix_id', $any($event.target).value)">
            @if (!matrices().length) {
              <option value="">{{ 'risk.registers.defaultMatrix' | transloco }}</option>
            }
            @for (m of matrices(); track m.id) {
              <option [value]="m.id" [selected]="m.id === form().matrix_id">{{ m.name }}</option>
            }
          </select>
          <app-field-help scope="risk" page="registers" field="matrix" />
        </app-form-field>
        <app-form-field
          [label]="'risk.fields.description' | transloco"
          inputId="register-description"
        >
          <textarea
            id="register-description"
            rows="3"
            [value]="form().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field [label]="'risk.fields.owner' | transloco" inputId="register-owner">
          <app-person-select
            inputId="register-owner"
            [value]="form().owner_user_id"
            [currentName]="register()?.owner?.name ?? null"
            (valueChange)="set('owner_user_id', $event)"
          />
        </app-form-field>
        <app-form-field
          [label]="'risk.fields.reviewInterval' | transloco"
          inputId="register-interval"
        >
          <input
            id="register-interval"
            type="number"
            min="1"
            max="60"
            [value]="form().review_interval_months"
            (input)="set('review_interval_months', $any($event.target).value)"
          />
          <app-field-help scope="risk" page="registers" field="interval" />
        </app-form-field>
        <label class="inline-flex items-center gap-2 text-[13px] text-fg">
          <input
            type="checkbox"
            [checked]="form().is_default"
            (change)="set('is_default', $any($event.target).checked)"
          />
          {{ 'risk.registers.isDefault' | transloco }}
        </label>
        @if (register()) {
          <label class="inline-flex items-center gap-2 text-[13px] text-fg">
            <input
              type="checkbox"
              [checked]="form().status === 'archived'"
              (change)="set('status', $any($event.target).checked ? 'archived' : 'active')"
            />
            {{ 'risk.registers.archived' | transloco }}
          </label>
        }
        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }
        <div class="flex justify-end">
          <app-button
            type="submit"
            [loading]="saving()"
            [disabled]="saving() || !form().name.trim()"
          >
            {{ 'risk.common.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class RegisterFormPanel {
  private readonly api = inject(RiskApi);
  private readonly toasts = inject(NotificationService);
  private readonly perms = inject(RiskPermissions);

  readonly open = input(false);
  readonly register = input<Register | null>(null);
  readonly matrices = input<readonly Matrix[]>([]);
  readonly saved = output<Register>();
  readonly closed = output<void>();

  protected readonly categories = RISK_CATEGORIES;
  protected readonly form = signal<RegisterForm>(toForm(null, []));
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.open()) {
        const register = this.register();
        const matrices = this.matrices();
        untracked(() => {
          this.form.set(toForm(register, matrices));
          this.errorKey.set(null);
        });
      }
    });
  }

  protected set<K extends keyof RegisterForm>(key: K, value: RegisterForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    const f = this.form();
    if (!orgId || !f.name.trim()) {
      return;
    }
    const body: RegisterCreate = {
      name: f.name.trim(),
      category: f.category,
      description: f.description.trim() || null,
      matrix_id: f.matrix_id || null,
      owner_user_id: f.owner_user_id || null,
      review_interval_months: Math.min(60, Math.max(1, Number(f.review_interval_months) || 12)),
      is_default: f.is_default,
    };
    const current = this.register();
    this.saving.set(true);
    const request = current
      ? this.api.updateRegister(orgId, current.id, { ...body, status: f.status })
      : this.api.createRegister(orgId, body);
    request.subscribe({
      next: (register) => {
        this.saving.set(false);
        this.toasts.success('risk.notices.registerSaved', { name: register.name });
        this.saved.emit(register);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }
}
