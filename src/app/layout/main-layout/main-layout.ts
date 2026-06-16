import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AskPanel } from '../../features/ask/ask-panel';
import { CommandPalette } from '../../features/command-palette/command-palette';
import { Notifications } from '../../shared/notifications/notifications';
import { SideNav } from '../side-nav/side-nav';
import { TopBar } from '../top-bar/top-bar';

/**
 * Application shell: top bar + sidebar nav + routed content outlet. All
 * authenticated feature routes render inside this.
 */
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, TopBar, SideNav, Notifications, AskPanel, CommandPalette],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './main-layout.html',
})
export class MainLayout {}
