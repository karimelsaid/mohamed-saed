import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
// استيراد المكونات الخاصة بكل قسم
import { AamalComponent } from './book-list/aamal/aamal.component';
import { ChildComponent } from './book-list/child/child.component';
import { FenonComponent } from './book-list/fenon/fenon.component';
import { FitComponent } from './book-list/fit/fit.component';
import { IslamicComponent } from './book-list/islamic/islamic.component';
import { RewayatComponent } from './book-list/rewayat/rewayat.component';
import { TatwerComponent } from './book-list/tatwer/tatwer.component';
import { TarekhComponent } from './book-list/tarekh/tarekh.component';
import { QamosComponent } from './book-list/qamos/qamos.component';
import { SearchResultsComponent } from './search-results/search-results.component';
import { HomePageComponent } from './home-page/home-page.component';
import { CartComponent } from './cart/cart.component';
import { FavoritesComponent } from './favorites/favorites.component';
import { AdminDashboardComponent } from './admin/admin-dashboard/admin-dashboard.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { UserOrdersComponent } from './user-orders/user-orders.component';
import { PrintComponent } from './print/print.component';
import { BookDetailsComponent } from './book-details/book-details.component';


import { AboutComponent } from './about/about.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { TermsConditionsComponent } from './terms-conditions/terms-conditions.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';

const routes: Routes = [
  { path: 'Home', component: HomePageComponent },
  { path: 'Business-Marketing-Finance', component: ChildComponent },
  { path: 'Education-children', component: ChildComponent },
  { path: 'Arts-crafts', component: FenonComponent },
  { path: 'HealthMedicineScience', component: FitComponent },
  { path: 'Islamic', component: IslamicComponent },
  { path: 'Novels-stories', component: RewayatComponent },
  { path: 'Self-development-psychology', component: TatwerComponent },
  { path: 'History-Biographies', component: TarekhComponent },
  { path: 'Dictionaries-References', component: QamosComponent },
  { path: 'ControlPanel', component: AdminDashboardComponent },
  { path: 'book/:name', component: BookDetailsComponent },
  { path: '', redirectTo: '/Home', pathMatch: 'full' },  // الصفحة الرئيسية هي "home" افتراضيًا
  { path: 'research', component: SearchResultsComponent }, // المسار الذي نوجه إليه المستخدم عند البحث
  { path: 'basket', component: CartComponent },
  { path: 'Favorites', component: FavoritesComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'requests', component: UserOrdersComponent },
  { path: 'print', component: PrintComponent },

  { path: 'عن-الموقع', component: AboutComponent },
  { path: 'سياسة-الخصوصية', component: PrivacyPolicyComponent },
  { path: 'الشروط-والاحكام', component: TermsConditionsComponent },

  { path: '**', component: NotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
