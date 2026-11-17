import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Offline-capable app shell only (see ngsw-config.json): no /api response is ever cached, so private data never lands in
    // the browser cache. Disabled in development so it cannot serve stale code to a developer.
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Restore the session (silent refresh) BEFORE the first navigation so guards see the user.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restore())),
  ],
};
