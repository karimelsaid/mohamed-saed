import { enableProdMode } from '@angular/core';
import { environment } from './environments/environment';
import { AppServerModule } from './app/app.module.server';

if (environment.production) {
    enableProdMode();
}

export default AppServerModule;
