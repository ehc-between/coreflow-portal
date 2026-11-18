import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Icon } from '../../../shared/ui/icon/icon';
import { UserRef } from '../data/hse.models';
import { directoryOptions } from './hse-shared';

/** What a people picker holds: members by id, everyone else by name. */
export interface PeopleValue {
  readonly userIds: readonly string[];
  readonly names: readonly string[];
}

export const NO_PEOPLE: PeopleValue = { userIds: [], names: [] };

/** Add a name (trimmed, case-insensitive de-duplicated); unchanged when blank or present. */
export function addName(names: readonly string[], raw: string): readonly string[] {
  const name = raw.trim();
  if (!name || names.some((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return names;
  }
  return [...names, name];
}

/** Total number of people in a picker value. */
export function peopleCount(value: PeopleValue): number {
  return value.userIds.length + value.names.length;
}

let nextId = 0;

/**
 * Pick people for an HSE record: members of the organisation (stored as user ids,
 * so their SJAs, sign-offs and training can be traced) plus external people by
 * name (contractors, visitors). Chips show who is picked; each has a remove
 * button. `known` names members that may no longer be in the directory.
 */
@Component({
  selector: 'app-hse-people-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-2" [attr.data-testid]="testId()">
      @if (chips().length) {
        <ul class="flex flex-wrap gap-1.5" [attr.aria-label]="labelKey() | transloco">
          @for (chip of chips(); track chip.key) {
            <li
              class="inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-meta font-semibold"
              [class]="
                chip.member
                  ? 'border-accent-border bg-accent-soft text-accent'
                  : 'border-border bg-surface-2 text-fg'
              "
            >
              @if (!chip.member) {
                <span class="sr-only">{{ 'hse.people.external' | transloco }}: </span>
              }
              <span class="truncate">{{ chip.label }}</span>
              @if (!chip.member) {
                <span class="font-normal text-fg-subtle" aria-hidden="true">{{
                  'hse.people.externalShort' | transloco
                }}</span>
              }
              <button
                type="button"
                class="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-fg-subtle hover:bg-surface hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="'hse.people.remove' | transloco: { name: chip.label }"
                (click)="remove(chip)"
              >
                <app-icon name="x" [size]="12" />
              </button>
            </li>
          }
        </ul>
      }
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          [id]="inputId()"
          [attr.aria-label]="'hse.people.addMember' | transloco"
          [attr.aria-describedby]="describedBy() || null"
          (change)="addMember($any($event.target))"
          data-testid="people-add-member"
        >
          <option value="" selected>{{ 'hse.people.addMember' | transloco }}</option>
          @for (o of available(); track o.value) {
            <option [value]="o.value">{{ o.label }}</option>
          }
        </select>
        <div class="flex gap-1.5">
          <label [attr.for]="nameId" class="sr-only">{{
            'hse.people.addExternal' | transloco
          }}</label>
          <input
            [id]="nameId"
            type="text"
            maxlength="200"
            autocomplete="off"
            class="min-w-0 flex-1"
            [placeholder]="'hse.people.externalPlaceholder' | transloco"
            [value]="draft()"
            (input)="draft.set($any($event.target).value)"
            (keydown.enter)="$event.preventDefault(); addExternal()"
            data-testid="people-add-name"
          />
          <button
            type="button"
            class="inline-flex h-10 flex-none items-center gap-1 rounded-tile border border-border bg-bg px-3 text-ui font-semibold text-fg-muted hover:text-fg disabled:opacity-50"
            [disabled]="!draft().trim()"
            (click)="addExternal()"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'hse.people.add' | transloco }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class HsePeoplePicker {
  private readonly directory = inject(AssigneeOptionsService);

  readonly value = input<PeopleValue>(NO_PEOPLE);
  /** Names of members already on the record (shown even if they left the directory). */
  readonly known = input<readonly UserRef[]>([]);
  readonly inputId = input(`cf-hse-people-${++nextId}`);
  readonly labelKey = input('hse.people.picked');
  readonly describedBy = input('');
  readonly testId = input('people-picker');
  readonly valueChange = output<PeopleValue>();

  protected readonly nameId = `cf-hse-people-name-${++nextId}`;
  protected readonly draft = signal('');

  private readonly members = computed(() => directoryOptions(this.directory, 'user'));

  protected readonly available = computed(() => {
    const picked = new Set(this.value().userIds);
    return this.members().filter((m) => !picked.has(m.value));
  });

  protected readonly chips = computed(() => {
    const names = new Map<string, string>();
    for (const u of this.known()) {
      names.set(u.id, u.name);
    }
    for (const m of this.members()) {
      names.set(m.value, m.label);
    }
    const v = this.value();
    return [
      ...v.userIds.map((id) => ({ key: `u:${id}`, id, label: names.get(id) ?? id, member: true })),
      ...v.names.map((name) => ({ key: `n:${name}`, id: name, label: name, member: false })),
    ];
  });

  constructor() {
    this.directory.ensureLoaded();
  }

  protected addMember(select: HTMLSelectElement): void {
    const id = select.value;
    select.value = '';
    const v = this.value();
    if (id && !v.userIds.includes(id)) {
      this.valueChange.emit({ ...v, userIds: [...v.userIds, id] });
    }
  }

  protected addExternal(): void {
    const v = this.value();
    const names = addName(v.names, this.draft());
    this.draft.set('');
    if (names !== v.names) {
      this.valueChange.emit({ ...v, names });
    }
  }

  protected remove(chip: { id: string; member: boolean }): void {
    const v = this.value();
    this.valueChange.emit(
      chip.member
        ? { ...v, userIds: v.userIds.filter((id) => id !== chip.id) }
        : { ...v, names: v.names.filter((n) => n !== chip.id) },
    );
  }
}
