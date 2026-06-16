import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AvatarSize = 'sm' | 'md' | 'lg';

/**
 * Initials avatar. Derives up-to-two initials from `name` (or uses explicit
 * `initials`); `gradient` paints the brand blue→violet fill, otherwise a muted
 * surface chip is used.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex shrink-0 items-center justify-center rounded-tile font-sans font-bold select-none"
      [class]="classes()"
    >
      {{ resolvedInitials() }}
    </span>
  `,
})
export class Avatar {
  readonly name = input('');
  readonly initials = input<string | null>(null);
  readonly size = input<AvatarSize>('md');
  readonly gradient = input(true);

  private readonly sizeClasses: Record<AvatarSize, string> = {
    sm: 'h-7 w-7 text-[11px]',
    md: 'h-[34px] w-[34px] text-[13px]',
    lg: 'h-10 w-10 text-[15px]',
  };

  protected readonly resolvedInitials = computed(() => {
    const explicit = this.initials();
    if (explicit) {
      return explicit.slice(0, 2).toUpperCase();
    }
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '';
    }
    const chars =
      parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
    return chars.toUpperCase();
  });

  protected readonly classes = computed(() => {
    const base = this.sizeClasses[this.size()];
    const fill = this.gradient()
      ? 'bg-[linear-gradient(135deg,#2f6fdb,#5a4be6)] text-white'
      : 'bg-surface-2 text-fg-muted';
    return `${base} ${fill}`;
  });
}
