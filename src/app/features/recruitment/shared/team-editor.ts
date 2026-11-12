import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { RecruitmentApi } from '../data/recruitment-api';
import { recruitmentError } from '../data/recruitment-errors';
import { RecruitmentPeople } from '../data/recruitment-people';
import { RequisitionDetail, TEAM_ROLES, TeamMember, TeamRole } from '../data/recruitment.models';

interface Row {
  readonly user_id: string;
  readonly team_role: TeamRole;
}

let nextId = 0;

/**
 * The requisition's hiring team. Only the team (plus the record's creator and
 * `recruitment:manage` holders) can see its candidates, which is how candidate
 * data stays need-to-know (GDPR Art. 5(1)(f)).
 */
@Component({
  selector: 'app-team-editor',
  imports: [TranslocoPipe, Button, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-card>
      <div class="mb-2 flex items-center justify-between gap-2">
        <h2 class="text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
          {{ 'recruitment.team.title' | transloco }}
        </h2>
        @if (canEdit() && !editing()) {
          <button
            type="button"
            class="rounded-[6px] px-2 py-0.5 text-[12.5px] font-semibold text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            (click)="startEdit()"
            data-testid="team-edit"
          >
            {{ 'recruitment.team.edit' | transloco }}
          </button>
        }
      </div>
      @if (!editing()) {
        <ul class="flex flex-col gap-1.5">
          @for (m of team(); track m.user_id + m.team_role) {
            <li class="flex items-center justify-between gap-2 text-[13px]">
              <span class="truncate text-fg">{{ m.name }}</span>
              <span class="flex-none text-[12px] text-fg-muted">{{
                'recruitment.teamRole.' + m.team_role | transloco
              }}</span>
            </li>
          } @empty {
            <li class="text-[13px] text-fg-muted">{{ 'recruitment.team.empty' | transloco }}</li>
          }
        </ul>
        <p class="mt-3 text-[12px] leading-snug text-fg-subtle">
          {{ 'recruitment.team.accessNote' | transloco }}
        </p>
      } @else {
        <ul class="flex flex-col gap-2">
          @for (row of rows(); track $index; let i = $index) {
            <li class="flex flex-col gap-1.5 rounded-tile border border-border p-2">
              <label class="sr-only" [attr.for]="uid + '-user-' + i">{{
                'recruitment.team.person' | transloco
              }}</label>
              <select
                [id]="uid + '-user-' + i"
                class="cf-input"
                (change)="update(i, { user_id: $any($event.target).value })"
              >
                <option value="" [selected]="!row.user_id">
                  {{ 'recruitment.team.choosePerson' | transloco }}
                </option>
                @for (u of people.users(); track u.id) {
                  <option [value]="u.id" [selected]="u.id === row.user_id">{{ u.name }}</option>
                }
              </select>
              <div class="flex items-center gap-1.5">
                <label class="sr-only" [attr.for]="uid + '-role-' + i">{{
                  'recruitment.team.role' | transloco
                }}</label>
                <select
                  [id]="uid + '-role-' + i"
                  class="cf-input flex-1"
                  (change)="update(i, { team_role: $any($event.target).value })"
                >
                  @for (r of roles; track r) {
                    <option [value]="r" [selected]="r === row.team_role">
                      {{ 'recruitment.teamRole.' + r | transloco }}
                    </option>
                  }
                </select>
                <button
                  type="button"
                  class="flex rounded-[6px] p-1.5 text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  [attr.aria-label]="'recruitment.team.remove' | transloco"
                  (click)="remove(i)"
                >
                  <app-icon name="trash" [size]="14" />
                </button>
              </div>
            </li>
          }
        </ul>
        <button
          type="button"
          class="mt-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[13px] font-semibold text-accent hover:bg-accent-soft"
          (click)="add()"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'recruitment.team.add' | transloco }}
        </button>
        <div class="mt-3 flex justify-end gap-2">
          <app-button size="sm" variant="secondary" (click)="editing.set(false)">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button size="sm" [loading]="saving()" (click)="save()">
            {{ 'recruitment.common.save' | transloco }}
          </app-button>
        </div>
      }
    </app-card>
  `,
  styles: [
    `
      .cf-input {
        width: 100%;
        height: 36px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        padding: 0 10px;
        outline: none;
      }
      .cf-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class TeamEditor {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly toasts = inject(NotificationService);
  protected readonly people = inject(RecruitmentPeople);

  readonly requisitionId = input.required<string>();
  readonly team = input<readonly TeamMember[]>([]);
  readonly canEdit = input(false);
  readonly saved = output<RequisitionDetail>();

  protected readonly roles = TEAM_ROLES;
  protected readonly uid = `cf-team-${++nextId}`;
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly rows = linkedSignal<readonly Row[]>(() =>
    this.team().map((m) => ({ user_id: m.user_id, team_role: m.team_role })),
  );

  protected startEdit(): void {
    this.people.ensureLoaded();
    this.rows.set(this.team().map((m) => ({ user_id: m.user_id, team_role: m.team_role })));
    this.editing.set(true);
  }

  protected add(): void {
    this.rows.update((rows) => [...rows, { user_id: '', team_role: 'interviewer' }]);
  }

  protected remove(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected update(index: number, patch: Partial<Row>): void {
    this.rows.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId || this.saving()) {
      return;
    }
    const members = this.rows().filter((r) => r.user_id);
    this.saving.set(true);
    this.api.setTeam(orgId, this.requisitionId(), members).subscribe({
      next: (req) => {
        this.saving.set(false);
        this.editing.set(false);
        this.toasts.success('recruitment.team.saved');
        this.saved.emit(req);
      },
      error: (err) => {
        this.saving.set(false);
        this.toasts.error(recruitmentError(err).key);
      },
    });
  }
}
