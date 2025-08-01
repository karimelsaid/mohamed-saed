import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
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
import { NavbarComponent } from './navbar/navbar.component';
import {FontAwesomeModule} from '@fortawesome/angular-fontawesome';
import { PrintComponent } from './print/print.component'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TarekhComponent } from './book-list/tarekh/tarekh.component';
import { QamosComponent } from './book-list/qamos/qamos.component';
import {FormsModule} from '@angular/forms';
import { SearchResultsComponent } from './search-results/search-results.component';
import { HomePageComponent } from './home-page/home-page.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { SharedModule } from './shared/shared.module';
import { FavoritesComponent } from './favorites/favorites.component';
import { AdminDashboardComponent } from './admin/admin-dashboard/admin-dashboard.component';
import { LocationStrategy, PathLocationStrategy } from '@angular/common';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { ChatWindowComponent } from './components/chat-window/chat-window.component';
import { NavbarIconsComponent } from './navbar-icons/navbar-icons.component';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { FreeShippingRulesComponent } from './admin/admin-dashboard/free-shipping-rules.component';
import { AdminMerchantsComponent } from './admin/admin-merchants.component';

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
    NavbarComponent,
    PrintComponent,
    TarekhComponent,
    QamosComponent,
    SearchResultsComponent,
    HomePageComponent,
    FavoritesComponent,
    SearchBarComponent,
    ChatWindowComponent,
    AdminDashboardComponent
  ],
  imports: [
    BrowserModule,
    RouterModule,
    AppRoutingModule,
    FontAwesomeModule,
    FormsModule,
    SharedModule,
    NgxSkeletonLoaderModule,
    RegisterComponent,
    LoginComponent,
    NavbarIconsComponent,
    FreeShippingRulesComponent,
    AdminMerchantsComponent
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi()), // استخدام provideHttpClient بدلاً من HttpClientModule
    { provide: LocationStrategy, useClass: PathLocationStrategy }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
