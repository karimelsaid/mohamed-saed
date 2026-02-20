import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AccountModalComponent } from './auth/account-modal/account-modal.component';
import { RouterModule } from '@angular/router';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { IslamicComponent } from './book-list/islamic/islamic.component';
import { TatwerComponent } from './book-list/tatwer/tatwer.component';
import { RewayatComponent } from './book-list/rewayat/rewayat.component';
import { AamalComponent } from './book-list/aamal/aamal.component';
import { FitComponent } from './book-list/fit/fit.component';
import { FenonComponent } from './book-list/fenon/fenon.component';
import { ChildComponent } from './book-list/child/child.component';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { fas, faBookOpen } from '@fortawesome/free-solid-svg-icons';
import { fab, faAmazon } from '@fortawesome/free-brands-svg-icons';
import { PrintComponent } from './print/print.component'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TarekhComponent } from './book-list/tarekh/tarekh.component';
import { QamosComponent } from './book-list/qamos/qamos.component';
import { FormsModule } from '@angular/forms';
import { SearchResultsComponent } from './search-results/search-results.component';
import { HomePageComponent } from './home-page/home-page.component';
import { SharedModule } from './shared/shared.module';
import { FavoritesComponent } from './favorites/favorites.component';
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
// Removed static imports for lazy loading

import { AdminModule } from './admin/admin.module';
import { MerchantDashboardComponent } from './merchant/dashboard/dashboard.component';
import { TutorialComponent } from './shared/tutorial/tutorial.component';
import { FloatingWheelWidgetComponent } from './features/promotions/floating-wheel-widget/floating-wheel-widget.component';
import { OfficeSuppliesComponent } from './book-list/office-supplies/office-supplies.component';
import { ElectronicsComponent } from './book-list/electronics/electronics.component';
import { ClothingComponent } from './book-list/clothing/clothing.component';
import { CosmeticsComponent } from './book-list/cosmetics/cosmetics.component';
import { ShoesComponent } from './book-list/shoes/shoes.component';
import { FurnitureComponent } from './book-list/furniture/furniture.component';
import { GamesComponent } from './book-list/games/games.component';
import { FabricsComponent } from './book-list/fabrics/fabrics.component';
import { OthersComponent } from './book-list/others/others.component';
import { BooksComponent } from './book-list/books/books.component';
import { HowToEarnComponent } from './pages/how-to-earn/how-to-earn.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { LandingComponent } from './core/components/landing/landing.component';
import { VoiceCallComponent } from './features/community/voice-call/voice-call.component';


@NgModule({
  declarations: [
    AppComponent,
    IslamicComponent,
    TatwerComponent,
    RewayatComponent,
    AamalComponent,
    FitComponent,
    FenonComponent,
    ChildComponent,
    TarekhComponent,
    QamosComponent,
    SearchResultsComponent,
    HomePageComponent,
    FavoritesComponent,
    ChatWindowComponent,
    OfficeSuppliesComponent,
    ElectronicsComponent,
    ClothingComponent,
    CosmeticsComponent,
    ShoesComponent,
    FurnitureComponent,
    GamesComponent,
    FabricsComponent,
    OthersComponent,
    BooksComponent,

    HowToEarnComponent,
    LandingComponent,
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
    AdminModule,
    // Removed from initial bundle
    MerchantDashboardComponent,
    TutorialComponent,
    AccountModalComponent,
    VoiceCallComponent,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: true, // Force enabled for testing Browser Notifications in Dev Mode
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerImmediately'
    }),
    FloatingWheelWidgetComponent
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi()), // استخدام provideHttpClient بدلاً من HttpClientModule
    { provide: LocationStrategy, useClass: PathLocationStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: MerchantAuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AdminAuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
  constructor(library: FaIconLibrary) {
    library.addIconPacks(fas, fab);
    library.addIcons(faBookOpen, faAmazon);
  }
}
