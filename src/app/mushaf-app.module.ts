import { ErrorHandler, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule, Routes } from '@angular/router';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ServiceWorkerModule } from '@angular/service-worker'; // Added
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

// Interceptors
import { MerchantAuthInterceptor } from './interceptors/merchant-auth.interceptor';
import { AdminAuthInterceptor } from './interceptors/admin-auth.interceptor';
import { AuthInterceptor } from './interceptors/auth.interceptor';

import { MushafRootComponent } from './mushaf-root.component';
import { MushafModule } from './features/mushaf/mushaf.module';
import { GlobalErrorHandler } from './global-error-handler';
import { VoiceCallComponent } from './features/community/voice-call/voice-call.component';

// Services
import { MushafDataService } from './core/services/mushaf-data.service';
import { MushafFontService } from './core/services/mushaf-font.service';
import { MushafAssetService } from './core/services/mushaf-asset.service';
import { VoiceRecognitionService } from './core/services/voice-recognition.service';
import { QuranMatchingService } from './core/services/quran-matching.service';
import { QuranAudioService } from './core/services/quran-audio.service';
import { QuranProgressService } from './services/quran-progress.service';
import { MutabaaService } from './services/mutabaa.service';
import { HifzPlanService } from './services/hifz-plan.service';
import { PushNotificationService } from './services/push-notification.service';
import { MockPushNotificationService } from './services/mock-push-notification.service'; // Added
import { MockLocalReminderService } from './services/mock-local-reminder.service'; // Added
import { LocalReminderService } from './services/local-reminder.service';

const routes: Routes = [
    {
        path: '',
        loadChildren: () => import('./features/mushaf/mushaf.module').then(m => m.MushafModule)
    }
];

@NgModule({
    declarations: [
        MushafRootComponent
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        HttpClientModule,
        RouterModule.forRoot(routes),
        FontAwesomeModule,
        VoiceCallComponent,
        ServiceWorkerModule.register('ngsw-worker.js', {
            enabled: false,
            registrationStrategy: 'registerWhenStable:30000'
        })
    ],
    providers: [
        { provide: ErrorHandler, useClass: GlobalErrorHandler },
        { provide: HTTP_INTERCEPTORS, useClass: MerchantAuthInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: AdminAuthInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
        MushafDataService,
        MushafFontService,
        MushafAssetService,
        VoiceRecognitionService,
        QuranMatchingService,
        QuranAudioService,
        QuranProgressService,
        MutabaaService,
        HifzPlanService,
        PushNotificationService,
        LocalReminderService
    ],
    bootstrap: [MushafRootComponent]
})
export class MushafAppModule { }
