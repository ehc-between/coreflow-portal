import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  EnvironmentProviders,
  Provider,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';

/** Test-only helpers shared by the record-kit specs (not used by app code). */

export const KIT_BASE = 'http://test/api';
export const KIT_ORG = 'org-1';
export const kitUrl = (path: string) => `${KIT_BASE}/v1/orgs/${KIT_ORG}/${path}`;

export const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** Transloco with the real English global + kit files. */
export function kitTransloco() {
  return TranslocoTestingModule.forRoot({
    langs: { en, 'kit/en': kitEn },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });
}

export interface KitTestOptions {
  readonly permissions?: readonly string[];
  readonly providers?: (Provider | EnvironmentProviders)[];
}

/** Configure TestBed for a kit component: http testing, org, router, assistant stub. */
export function configureKit(component: unknown, options: KitTestOptions = {}) {
  const prompts: string[] = [];
  const ask = { prompts, showWith: (prompt: string) => prompts.push(prompt) };
  TestBed.configureTestingModule({
    imports: [component as never, kitTransloco()],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: KIT_BASE } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(KIT_ORG).asReadonly(),
          currentOrg: signal({
            id: KIT_ORG,
            name: 'Org',
            roles: [],
            permissions: options.permissions ?? [],
          }).asReadonly(),
        },
      },
      { provide: AskPanelService, useValue: ask },
      ...(options.providers ?? []),
    ],
  });
  return { http: TestBed.inject(HttpTestingController), ask };
}

/** Answer the entity-type catalog request if the component made one. */
export function flushEntityTypes(http: HttpTestingController): void {
  for (const req of http.match((r) => r.url === kitUrl('entity-types'))) {
    req.flush({
      items: [
        {
          entity_type: 'document',
          module: 'documents',
          label_key: 'modules.entities.document',
          linkable: true,
          commentable: true,
          attachable: true,
          revisioned: false,
          searchable: true,
        },
        {
          entity_type: 'deviation',
          module: 'deviations',
          label_key: 'modules.entities.deviation',
          linkable: true,
          commentable: true,
          attachable: true,
          revisioned: false,
          searchable: true,
        },
      ],
      link_types: [
        'relates_to',
        'caused_by',
        'mitigates',
        'evidence_for',
        'supersedes',
        'implements',
        'derived_from',
      ],
    });
  }
}
