import { TestBed } from '@angular/core/testing';
import { CommandPaletteService } from './command-palette.service';

describe('CommandPaletteService', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [CommandPaletteService] });
    return TestBed.inject(CommandPaletteService);
  }

  it('starts closed', () => {
    expect(setup().open()).toBe(false);
  });

  it('show() opens and hide() closes', () => {
    const svc = setup();
    svc.show();
    expect(svc.open()).toBe(true);
    svc.hide();
    expect(svc.open()).toBe(false);
  });

  it('toggle() flips the open state', () => {
    const svc = setup();
    svc.toggle();
    expect(svc.open()).toBe(true);
    svc.toggle();
    expect(svc.open()).toBe(false);
  });
});
