import { NgModule, isDevMode } from '@angular/core';
// Trigger rebuild to resolve metadata resolution issues
import { BrowserModule } from '@angular/platform-browser';
import { AccountModalComponent } from './auth/account-modal/account-modal.component';
import { RouterModule } from '@angular/router';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
// Removed redundant category imports
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { fas, faBookOpen } from '@fortawesome/free-solid-svg-icons';
import { fab, faAmazon } from '@fortawesome/free-brands-svg-icons';
import { PrintComponent } from './print/print.component'
import { provideHttpClient, withInterceptorsFromDi, withFetch } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SharedModule } from './shared/shared.module';
import { LocationStrategy, PathLocationStrategy } from '@angular/common';
import { ChatWindowComponent } from './components/chat-window/chat-window.component';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { NavbarModule } from './navbar/navbar.module';
import { NavbarIconsModule } from './navbar-icons/navbar-icons.module';
import { SearchBarModule } from './search-bar/search-bar.module';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { MerchantAuthInterceptor } from './interceptors/merchant-auth.interceptor';
import { AdminAuthInterceptor } from './interceptors/admin-auth.interceptor';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ErrorInterceptor } from './interceptors/error.interceptor';
import { UniversalInterceptor } from './interceptors/universal.interceptor';
// Removed static imports for lazy loading

import { AdminModule } from './admin/admin.module';
import { SearchResultsComponent } from './search-results/search-results.component';
import { MerchantDashboardComponent } from './merchant/dashboard/dashboard.component';
import { TutorialComponent } from './shared/tutorial/tutorial.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { VoiceCallComponent } from './features/community/voice-call/voice-call.component';
import { NetworkStatusComponent } from './shared/components/network-status/network-status.component';
import { PromotionsFabComponent } from './shared/components/promotions-fab/promotions-fab.component';
import { LiveUpdateModalComponent } from './shared/components/live-update-modal/live-update-modal.component';

// ✅ SSR-compatible standalone components
import { HomePageComponent } from './home-page/home-page.component';
import { BookDetailsComponent } from './book-details/book-details.component';
import { CheckoutModalComponent } from './checkout-modal/checkout-modal.component';
import { PaymentModalComponent } from './payment-modal/payment-modal.component';


@NgModule({
  declarations: [
    AppComponent,
    ChatWindowComponent,
  ],
  imports: [
    BrowserModule,
    RouterModule,
    AppRoutingModule,
    FontAwesomeModule,
    FormsModule,
    SharedModule,
    NgxSkeletonLoaderModule,
    NavbarModule,
    NavbarIconsModule,
    SearchBarModule,
    SearchResultsComponent,
    AdminModule,
    MerchantDashboardComponent,
    TutorialComponent,
    AccountModalComponent,
    VoiceCallComponent,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    NetworkStatusComponent,
    PromotionsFabComponent,
    LiveUpdateModalComponent,
    // ✅ كلهم standalone — بيتحطوا في imports[]
    HomePageComponent,
    BookDetailsComponent,
    CheckoutModalComponent,
    PaymentModalComponent,
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    { provide: LocationStrategy, useClass: PathLocationStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: UniversalInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: MerchantAuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AdminAuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
  constructor(library: FaIconLibrary) {
    library.addIconPacks(fas, fab);
    library.addIcons(faBookOpen, faAmazon);
  }
}