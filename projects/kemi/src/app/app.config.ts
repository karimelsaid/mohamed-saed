import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { EdlService } from './core/edl.service';
import { ProjectService } from './core/project.service';
import { IpcService } from './core/ipc.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    EdlService,
    ProjectService,
    IpcService
  ],
};
