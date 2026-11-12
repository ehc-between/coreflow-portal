import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { NOTIFICATION_FALLBACK_KEY } from './notification-text';
import { NotificationTextResolver } from './notification-text.service';
import { UserNotification } from './user-notification.models';

function make(title_key: string, params: Record<string, unknown> = {}): UserNotification {
  return {
    id: 'n-1',
    org_id: 'org-1',
    kind: 'risk.treatment_assigned',
    entity_type: 'risk',
    entity_id: 'r-1',
    title_key,
    category: 'assignments',
    params,
    created_at: '2026-11-01T10:00:00Z',
    read_at: null,
    is_read: false,
  };
}

describe('NotificationTextResolver', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              modules: { entities: { task: 'Task' } },
              notifications: { reminderEntityFallback: 'Item' },
            },
            'risk/en': { notifications: { treatmentAssigned: 'Treatment {{title}}' } },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: false,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: APP_CONFIG, useValue: { i18n: { availableLanguages: ['en'] } } },
      ],
    });
  });

  it('loads a module scope on demand and then resolves the scoped key', async () => {
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load('en'));
    const resolver = TestBed.inject(NotificationTextResolver);
    const n = make('risk:notifications.treatmentAssigned', { title: 'Fire' });

    expect(resolver.resolve(n).key).toBe(NOTIFICATION_FALLBACK_KEY);
    resolver.ensureScopes([n]);
    await firstValueFrom(transloco.load('risk/en'));
    expect(resolver.resolve(n).key).toBe('risk.notifications.treatmentAssigned');
    expect(transloco.translate('risk.notifications.treatmentAssigned', { title: 'Fire' })).toBe(
      'Treatment Fire',
    );
  });

  it('labels reminder entities from the global entity names', async () => {
    await firstValueFrom(TestBed.inject(TranslocoService).load('en'));
    const resolver = TestBed.inject(NotificationTextResolver);
    const known = resolver.resolve(
      make('notifications.reminderDueSoon', {
        days: 3,
        code: 'T-1',
        entity_label_key: 'modules.entities.task',
      }),
    );
    expect(known.params['entity']).toBe('Task');
    const unknown = resolver.resolve(
      make('notifications.reminderOverdue', { days: 2, entity_label_key: 'modules.entities.x' }),
    );
    expect(unknown.key).toBe('notifications.reminderOverdueNoCode');
    expect(unknown.params['entity']).toBe('Item');
  });
});
