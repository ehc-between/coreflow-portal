import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { GuidanceApi } from './guidance-api';
import { LearningProgressItem } from './guidance.models';
import { LearningProgressService } from './learning-progress.service';

function item(over: Partial<LearningProgressItem>): LearningProgressItem {
  return {
    id: 'p-1',
    module: 'platform',
    lesson_key: 'platform.a',
    seen_at: '2026-11-01T10:00:00',
    completed_at: null,
    quiz_score: null,
    quiz_passed: null,
    attempts: 0,
    ...over,
  };
}

function setup() {
  const orgId = signal<string | null>('org-1');
  const api = {
    listProgress: vi.fn(() => of({ items: [item({})] })),
    recordProgress: vi.fn((_org: string, body: { lesson_key: string }) =>
      of(item({ id: 'p-2', lesson_key: body.lesson_key, completed_at: '2026-11-02T10:00:00' })),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: GuidanceApi, useValue: api },
      { provide: AuthService, useValue: { isAuthenticated: signal(true) } },
      { provide: SelectedOrgService, useValue: { currentOrgId: orgId } },
    ],
  });
  const service = TestBed.inject(LearningProgressService);
  TestBed.tick();
  return { service, api, orgId };
}

describe('LearningProgressService', () => {
  it('loads only once it is wanted, and again on org change', () => {
    const { service, api, orgId } = setup();
    expect(api.listProgress).not.toHaveBeenCalled();
    service.ensureLoaded();
    service.ensureLoaded();
    expect(api.listProgress).toHaveBeenCalledTimes(1);
    expect(service.byKey().get('platform.a')?.id).toBe('p-1');

    orgId.set('org-2');
    TestBed.tick();
    expect(api.listProgress).toHaveBeenLastCalledWith('org-2');
  });

  it('records events with the contract body and merges the returned row', () => {
    const { service, api } = setup();
    service.ensureLoaded();
    service.record('platform', 'platform.b', 'completed').subscribe();
    expect(api.recordProgress).toHaveBeenCalledWith('org-1', {
      module: 'platform',
      lesson_key: 'platform.b',
      event: 'completed',
    });
    service.record('platform', 'platform.c', 'quiz', { score: 50, passed: false }).subscribe();
    expect(api.recordProgress).toHaveBeenLastCalledWith('org-1', {
      module: 'platform',
      lesson_key: 'platform.c',
      event: 'quiz',
      score: 50,
      passed: false,
    });
    expect(service.items().map((i) => i.lesson_key)).toEqual([
      'platform.a',
      'platform.b',
      'platform.c',
    ]);
    expect(service.completedCount()).toBe(2);
  });

  it('records nothing without an org', () => {
    const { service, api, orgId } = setup();
    orgId.set(null);
    TestBed.tick();
    let result: unknown = 'unset';
    service.record('platform', 'platform.a', 'seen').subscribe((r) => (result = r));
    expect(result).toBeNull();
    expect(api.recordProgress).not.toHaveBeenCalled();
  });
});
