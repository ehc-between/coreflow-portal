import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../icon/icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Design-system button. Renders a native <button>; consumers project label/icon
 * content. `loading` disables the button and swaps in a pulsing spark glyph.
 */
@Component({
  selector: 'app-button',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      class="inline-flex items-center justify-center gap-2 rounded-tile border font-sans font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      [class]="classes()"
      [class.w-full]="full()"
    >
      @if (loading()) {
        <span class="animate-cf-pulse inline-flex"
          ><app-icon name="spark" [size]="iconSize()"
        /></span>
      }
      <ng-content />
    </button>
  `,
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly full = input(false);

  private readonly sizeClasses: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-9 px-4 text-[13.5px]',
    lg: 'h-11 px-5 text-[15px]',
  };

  private readonly variantClasses: Record<ButtonVariant, string> = {
    primary: 'border-transparent bg-accent text-white hover:bg-accent-2',
    secondary: 'border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2',
    ghost: 'border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
    danger: 'border-transparent bg-fail text-white hover:opacity-90',
  };

  protected readonly classes = computed(
    () => `${this.sizeClasses[this.size()]} ${this.variantClasses[this.variant()]}`,
  );

  protected readonly iconSize = computed(() => (this.size() === 'lg' ? 18 : 15));
}
