import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { WatinRootComponent } from '../app/watin-root.component';
import { environment } from '../environments/environment';
import { watinRoutes } from '../app/watin.routes';

if (environment.production) {
    enableProdMode();
}

bootstrapApplication(WatinRootComponent, {
    providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideRouter(watinRoutes)
    ]
}).catch(err => console.error(err));
