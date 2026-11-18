import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { AuditAccess } from '../data/audit-access';
import { auditorName, textOrNull } from '../data/audit-display';
import { auditorCheckIssues } from '../data/audit-errors';
import {
  AUDITOR_ROLES,
  AuditorCheck,
  AuditorRole,
  PlanAuditor,
  PlanDetail,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditField } from '../shared/audit-field';
import { mutator } from '../shared/mutator';
import { AuditUserSelect } from '../shared/user-select';

/**
 * The audit team of a plan: lead auditor, auditors, observers and technical experts,
 * with the competence and independence check of each internal auditor. Adding someone
 * who fails a check needs a recorded override reason (409 `auditor_check_failed`).
 * The add form stays folded behind "+ Legg til i teamet" until it is needed.
 */
@Component({
  selector: 'app-audit-plan-team',
  imports: [TranslocoPipe, Badge, Button, ConfirmDialog, Icon, AuditField, AuditUserSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (plan().auditors.length) {
      <ul class="divide-y divide-border" data-testid="audit-team">
        @for (a of plan().auditors; track a.id) {
          <li class="flex flex-wrap items-start justify-between gap-2 py-2.5">
            <div class="min-w-0">
              <p class="text-body font-semibold text-fg">
                {{ name(a) }}
                @if (a.external_name && !a.user) {
                  <span class="text-meta font-normal text-fg-subtle">
                    ({{ 'audits.team.external' | transloco }})
                  </span>
                }
              </p>
              <div class="mt-1 flex flex-wrap gap-1">
                <app-badge [tone]="a.role === 'lead' ? 'accent' : 'neutral'">
                  {{ 'audits.auditorRole.' + a.role | transloco }}
                </app-badge>
                @if (a.user && plan().kind === 'internal') {
                  <app-badge [tone]="a.competence_ok ? 'pass' : 'warn'">
                    {{
                      (a.competence_ok ? 'audits.team.competent' : 'audits.team.competenceGap')
                        | transloco
                    }}
                  </app-badge>
                  <app-badge [tone]="a.independence_ok ? 'pass' : 'warn'">
                    {{
                      (a.independence_ok
                        ? 'audits.team.independent'
                        : 'audits.team.independenceGap'
                      ) | transloco
                    }}
                  </app-badge>
                }
              </div>
              @if (a.issues.length) {
                <ul class="mt-1 list-disc pl-5 text-meta text-fg-muted">
                  @for (i of a.issues; track i) {
                    <li>{{ 'audits.auditorIssue.' + i | transloco }}</li>
                  }
                </ul>
              }
              @if (a.override_reason) {
                <p class="mt-1 text-meta text-fg-muted">
                  {{ 'audits.team.overrideReason' | transloco: { reason: a.override_reason } }}
                </p>
              }
            </div>
            @if (editable()) {
              <app-button
                variant="ghost"
                size="sm"
                [attr.aria-label]="'audits.team.removeNamed' | transloco: { name: name(a) }"
                (click)="removing.set(a)"
              >
                {{ 'audits.common.remove' | transloco }}
              </app-button>
            }
          </li>
        }
      </ul>
    } @else {
      <p class="text-body text-fg-muted">{{ 'audits.team.empty' | transloco }}</p>
    }

    @if (editable()) {
      @if (!adding()) {
        <app-button
          class="mt-3 inline-block"
          variant="secondary"
          size="sm"
          (click)="adding.set(true)"
          data-testid="team-add-open"
        >
          <app-icon name="plus" [size]="13" />
          {{ 'audits.team.add' | transloco }}
        </app-button>
      } @else {
        <div class="mt-3 rounded-tile border border-border bg-surface-2 p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h3 class="text-ui font-semibold text-fg">{{ 'audits.team.add' | transloco }}</h3>
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="'audits.common.close' | transloco"
              (click)="adding.set(false)"
            >
              <app-icon name="x" [size]="14" />
            </button>
          </div>
          <div
            class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-ui"
            role="radiogroup"
            [attr.aria-label]="'audits.team.who' | transloco"
          >
            <label class="inline-flex min-h-8 items-center gap-1.5">
              <input
                type="radio"
                name="team-who"
                [checked]="!external()"
                (change)="setExternal(false)"
              />
              {{ 'audits.team.member' | transloco }}
            </label>
            <label class="inline-flex min-h-8 items-center gap-1.5">
              <input
                type="radio"
                name="team-who"
                [checked]="external()"
                (change)="setExternal(true)"
              />
              {{ 'audits.team.externalPerson' | transloco }}
            </label>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            @if (external()) {
              <app-audit-field inputId="team-external" labelKey="audits.team.externalName">
                <input
                  id="team-external"
                  maxlength="200"
                  [value]="externalName()"
                  (input)="externalName.set($any($event.target).value)"
                />
              </app-audit-field>
            } @else {
              <app-audit-field inputId="team-user" labelKey="audits.team.person">
                <app-audit-user-select
                  inputId="team-user"
                  noneLabelKey="audits.common.choose"
                  [value]="userId()"
                  (valueChange)="userId.set($event); check()"
                />
              </app-audit-field>
            }
            <app-audit-field
              inputId="team-role"
              labelKey="audits.team.role"
              helpPage="planDetail"
              helpField="auditorRole"
            >
              <select id="team-role" (change)="role.set($any($event.target).value); check()">
                @for (r of roles; track r) {
                  <option [value]="r" [selected]="role() === r">
                    {{ 'audits.auditorRole.' + r | transloco }}
                  </option>
                }
              </select>
            </app-audit-field>
          </div>

          @if (checkResult(); as c) {
            @if (c.issues.length) {
              <div class="mt-3 rounded-tile border border-warn bg-warn-soft p-3" role="status">
                <p class="text-ui font-semibold text-warn-ink">
                  {{ 'audits.team.checkFailed' | transloco }}
                </p>
                <ul class="mt-1 list-disc pl-5 text-meta text-fg">
                  @for (i of c.issues; track i) {
                    <li>{{ 'audits.auditorIssue.' + i | transloco }}</li>
                  }
                </ul>
                <app-audit-field
                  class="mt-2"
                  inputId="team-override"
                  labelKey="audits.team.overrideLabel"
                >
                  <input
                    id="team-override"
                    maxlength="2000"
                    [value]="override()"
                    (input)="override.set($any($event.target).value)"
                  />
                </app-audit-field>
              </div>
            } @else if (plan().kind === 'internal') {
              <p class="mt-2 text-meta text-pass-ink" role="status">
                {{ 'audits.team.checkPassed' | transloco }}
              </p>
            }
          }

          <div class="mt-3 flex justify-end gap-2">
            <app-button variant="secondary" size="sm" (click)="adding.set(false)">
              {{ 'audits.common.cancel' | transloco }}
            </app-button>
            <app-button size="sm" [loading]="saving.busy()" [disabled]="!canAdd()" (click)="add()">
              {{ 'audits.team.addButton' | transloco }}
            </app-button>
          </div>
        </div>
      }
    }

    <app-confirm-dialog
      [open]="!!removing()"
      [title]="'audits.team.removeTitle' | transloco"
      [message]="
        'audits.team.removeMessage' | transloco: { name: removing() ? name(removing()!) : '' }
      "
      [confirmLabel]="'audits.common.remove' | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      [busy]="saving.busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
  `,
})
export class PlanTeam {
  private readonly api = inject(AuditsApi);
  private readonly access = inject(AuditAccess);

  readonly plan = input.required<PlanDetail>();
  readonly editable = input(false);
  /** The team changed: the host reloads the plan. */
  readonly changed = output<void>();

  protected readonly roles = AUDITOR_ROLES;
  protected readonly saving = mutator();
  protected readonly adding = signal(false);
  protected readonly external = signal(false);
  protected readonly userId = signal('');
  protected readonly externalName = signal('');
  protected readonly role = signal<AuditorRole>('auditor');
  protected readonly override = signal('');
  protected readonly checkResult = signal<AuditorCheck | null>(null);
  protected readonly removing = signal<PlanAuditor | null>(null);
  private checkSub: Subscription | null = null;

  protected readonly needsOverride = computed(() => (this.checkResult()?.issues.length ?? 0) > 0);
  protected readonly canAdd = computed(() => {
    if (this.saving.busy()) {
      return false;
    }
    if (this.external()) {
      return !!this.externalName().trim() && this.role() !== 'lead';
    }
    return !!this.userId() && (!this.needsOverride() || !!this.override().trim());
  });

  protected readonly name = auditorName;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.checkSub?.unsubscribe());
  }

  protected setExternal(external: boolean): void {
    this.external.set(external);
    this.checkResult.set(null);
    if (external && this.role() === 'lead') {
      this.role.set('auditor');
    }
  }

  /** Preview the competence / independence check of the chosen member and role. */
  protected check(): void {
    this.checkSub?.unsubscribe();
    this.checkResult.set(null);
    this.override.set('');
    const orgId = this.access.orgId();
    const userId = this.userId();
    if (!orgId || !userId || this.external()) {
      return;
    }
    this.checkSub = this.api
      .checkAuditor(orgId, this.plan().id, userId, this.role())
      .subscribe({ next: (c) => this.checkResult.set(c), error: () => this.checkResult.set(null) });
  }

  protected add(): void {
    const orgId = this.access.orgId();
    if (!orgId || !this.canAdd()) {
      return;
    }
    const body = this.external()
      ? { external_name: this.externalName().trim(), role: this.role() }
      : {
          user_id: this.userId(),
          role: this.role(),
          ...(textOrNull(this.override()) ? { override_reason: this.override().trim() } : {}),
        };
    this.saving.run(this.api.assignAuditor(orgId, this.plan().id, body), {
      success: 'audits.notices.auditorAdded',
      next: () => {
        this.userId.set('');
        this.externalName.set('');
        this.override.set('');
        this.checkResult.set(null);
        this.adding.set(false);
        this.changed.emit();
      },
      error: (error) => {
        const issues = auditorCheckIssues(error);
        if (issues.length) {
          this.checkResult.set({
            user_id: this.userId(),
            competence_ok: false,
            independence_ok: false,
            issues,
          });
        }
      },
    });
  }

  protected remove(): void {
    const orgId = this.access.orgId();
    const target = this.removing();
    if (!orgId || !target) {
      return;
    }
    this.saving.run(this.api.removeAuditor(orgId, this.plan().id, target.id), {
      success: 'audits.notices.auditorRemoved',
      next: () => {
        this.removing.set(null);
        this.changed.emit();
      },
      error: () => {
        this.removing.set(null);
      },
    });
  }
}
