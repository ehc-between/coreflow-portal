import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { OrgMember, OrgRole } from '../../../core/org/org.models';
import { roleDescription, roleLabel } from '../../../core/org/roles';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { roleChange } from './member-rules';

/** Most roles one member can hold (backend limit). */
export const MAX_MEMBER_ROLES = 10;

/**
 * Change a member's access level(s). One or more roles via checkboxes (the union
 * of their permissions applies); the panel shows, before saving, which roles and
 * which modules the person gains or loses. Nothing is saved until "Lagre tilgang".
 */
@Component({
  selector: 'app-role-editor',
  imports: [RouterLink, TranslocoPipe, Button, Icon, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="member() !== null"
      [title]="'settings.members.editor.title' | transloco: { name: name() }"
      [subtitle]="member()?.email ?? ''"
      [closeLabel]="'common.close' | transloco"
      [width]="520"
      (closed)="closed.emit()"
    >
      <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()">
        <p class="text-ui text-fg-muted">{{ 'settings.members.editor.intro' | transloco }}</p>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-ui font-semibold text-fg">
            {{ 'settings.members.editor.levels' | transloco }}
          </legend>
          @for (role of roles(); track role.key) {
            <label
              class="flex cursor-pointer items-start gap-3 rounded-tile border border-border px-3 py-2.5 hover:bg-surface-2"
              [class.opacity-60]="!role.grantable"
              [attr.data-testid]="'role-option-' + role.key"
            >
              <input
                type="checkbox"
                class="mt-0.5 size-4 accent-accent"
                [checked]="selected().has(role.key)"
                [disabled]="!role.grantable || busy()"
                (change)="toggle(role.key, $any($event.target).checked)"
              />
              <span class="min-w-0">
                <span class="block text-ui font-semibold text-fg">{{ roleName(role.key) }}</span>
                @if (roleDescription(role.key); as description) {
                  <span class="block text-meta text-fg-muted">{{ description }}</span>
                }
                @if (!role.grantable) {
                  <span class="block text-meta text-fg-subtle">
                    {{ 'settings.members.editor.notGrantable' | transloco }}
                  </span>
                }
              </span>
            </label>
          }
        </fieldset>

        <section
          class="rounded-tile border border-border bg-surface-2 px-4 py-3"
          aria-live="polite"
          data-testid="role-change-summary"
        >
          <h3 class="text-ui font-semibold text-fg">
            {{ 'settings.members.editor.summary' | transloco }}
          </h3>
          @if (!change().changed) {
            <p class="mt-1 text-ui text-fg-muted">
              {{ 'settings.members.editor.noChange' | transloco }}
            </p>
          } @else {
            <ul class="mt-2 flex flex-col gap-1.5 text-ui">
              <li class="text-fg-muted">
                {{ 'settings.members.editor.from' | transloco: { roles: currentLabel() } }}
              </li>
              <li class="font-semibold text-fg">
                {{ 'settings.members.editor.to' | transloco: { roles: nextLabel() } }}
              </li>
              @if (change().gainedModules.length) {
                <li class="flex items-start gap-1.5 text-pass">
                  <app-icon name="plus" [size]="14" />
                  <span>{{
                    'settings.members.editor.gains' | transloco: { modules: gainedLabel() }
                  }}</span>
                </li>
              } @else if (change().gained) {
                <li class="flex items-start gap-1.5 text-pass">
                  <app-icon name="plus" [size]="14" />
                  <span>{{
                    'settings.members.editor.gainsRights' | transloco: { count: change().gained }
                  }}</span>
                </li>
              }
              @if (change().lostModules.length) {
                <li class="flex items-start gap-1.5 text-fail">
                  <app-icon name="x" [size]="14" />
                  <span>{{
                    'settings.members.editor.loses' | transloco: { modules: lostLabel() }
                  }}</span>
                </li>
              } @else if (change().lost) {
                <li class="flex items-start gap-1.5 text-fail">
                  <app-icon name="x" [size]="14" />
                  <span>{{
                    'settings.members.editor.losesRights' | transloco: { count: change().lost }
                  }}</span>
                </li>
              }
            </ul>
          }
        </section>

        @if (selected().size === 0) {
          <p role="alert" class="text-ui font-medium text-fail">
            {{ 'settings.members.editor.needOne' | transloco }}
          </p>
        }

        <p class="text-meta text-fg-subtle">
          {{ 'settings.members.roleChangeHint' | transloco }}
          <a routerLink="/settings/roles" class="font-semibold text-accent hover:underline">{{
            'settings.members.editor.seeMatrix' | transloco
          }}</a>
        </p>

        <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <app-button variant="ghost" (click)="closed.emit()">
            {{ 'settings.cancel' | transloco }}
          </app-button>
          <app-button
            type="submit"
            data-testid="role-save"
            [loading]="busy()"
            [disabled]="!change().changed || selected().size === 0"
          >
            {{ 'settings.members.editor.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class RoleEditor {
  private readonly language = inject(LanguageService);

  /** The member being edited; null closes the panel. */
  readonly member = input<OrgMember | null>(null);
  /** The whole role catalogue (non-grantable roles are shown disabled). */
  readonly roles = input<readonly OrgRole[]>([]);
  readonly busy = input(false);

  readonly saved = output<readonly string[]>();
  readonly closed = output<void>();

  protected readonly selected = signal<ReadonlySet<string>>(new Set());

  protected readonly name = computed(() => {
    const member = this.member();
    return member ? member.full_name?.trim() || member.email : '';
  });

  private readonly nextKeys = computed(() =>
    this.roles()
      .map((role) => role.key)
      .filter((key) => this.selected().has(key)),
  );

  protected readonly change = computed(() =>
    roleChange(this.member()?.roles ?? [], this.nextKeys(), this.roles()),
  );

  protected readonly currentLabel = computed(() => this.joinRoles(this.member()?.roles ?? []));
  protected readonly nextLabel = computed(() => this.joinRoles(this.nextKeys()));
  protected readonly gainedLabel = computed(() => this.joinModules(this.change().gainedModules));
  protected readonly lostLabel = computed(() => this.joinModules(this.change().lostModules));

  constructor() {
    effect(() => {
      const member = this.member();
      untracked(() => this.selected.set(new Set(member?.roles ?? [])));
    });
  }

  protected roleName(key: string): string {
    return roleLabel((k) => this.language.translate(k), key, this.roles());
  }

  protected roleDescription(key: string): string {
    return roleDescription((k) => this.language.translate(k), key);
  }

  protected toggle(key: string, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size >= MAX_MEMBER_ROLES) return current;
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  protected save(): void {
    const change = this.change();
    if (!change.changed || this.selected().size === 0 || this.busy()) {
      return;
    }
    this.saved.emit(this.nextKeys());
  }

  private joinRoles(keys: readonly string[]): string {
    return keys.length
      ? keys.map((key) => this.roleName(key)).join(', ')
      : this.language.translate('settings.members.editor.none');
  }

  private joinModules(keys: readonly string[]): string {
    return keys
      .map((key) => {
        const label = this.language.translate(`modules.names.${key}`);
        return label === `modules.names.${key}` ? this.platformArea(key) : label;
      })
      .join(', ');
  }

  /** Platform permission prefixes (org, users, audit, …) have their own names. */
  private platformArea(key: string): string {
    const k = `settings.roles.areas.${key}`;
    const label = this.language.translate(k);
    return label === k ? this.language.translate('settings.roles.areas.other') : label;
  }
}
