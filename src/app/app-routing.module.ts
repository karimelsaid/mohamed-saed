import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
// Removed redundant category imports
import { SearchResultsComponent } from './search-results/search-results.component';
import { HomePageComponent } from './home-page/home-page.component';
import { CartComponent } from './cart/cart.component';
import { FavoritesComponent } from './favorites/favorites.component';
// Removed static imports for lazy loading
import { NotFoundComponent } from './not-found/not-found.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { UserProfileComponent } from './auth/user-profile/user-profile.component';
import { UserOrdersComponent } from './user-orders/user-orders.component';
import { PrintComponent } from './print/print.component';
import { BookDetailsComponent } from './book-details/book-details.component';
import { ReferralsComponent } from './referrals/referrals.component';
import { LandingComponent } from './core/components/landing/landing.component';

import { AboutComponent } from './about/about.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { TermsConditionsComponent } from './terms-conditions/terms-conditions.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { MerchantDashboardComponent } from './merchant/dashboard/dashboard.component';
import { AddProductComponent } from './merchant/add-product/add-product.component';
import { EditProductComponent } from './merchant/edit-product/edit-product.component';
import { MerchantProfileComponent } from './merchant/merchant-profile/merchant-profile.component';
import { MerchantAuthGuard } from './guards/merchant-auth.guard';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { StartupGuard } from './guards/startup.guard';
import { BooksComponent } from './book-list/books/books.component';
import { LibraryComponent } from './library/library.component';
import { EpubReaderComponent } from './epub-reader/epub-reader.component';
import { SubscriptionComponent } from './subscription/subscription.component';
import { DownloadsComponent } from './downloads/downloads.component';
import { GamificationDashboardComponent } from './gamification/dashboard/dashboard.component';
import { HowToEarnComponent } from './pages/how-to-earn/how-to-earn.component';
import { MarketerHubComponent } from './marketer-hub/marketer-hub.component';
import { MarketerAuthGuard } from './guards/marketer-auth.guard';
// Removed static imports of Mushaf for lazy loading
const routes: Routes = [
  {
    path: 'merchant',
    children: [
      { path: 'dashboard', component: MerchantDashboardComponent, canActivate: [MerchantAuthGuard] },
      {
        path: 'add-product',
        component: AddProductComponent,
        canActivate: [MerchantAuthGuard],
        data: {
          requiresApproval: true,
          title: 'إضافة منتج',
          description: 'صفحة إضافة منتج جديد - متاحة للتجار المعتمدين فقط'
        }
      },
      {
        path: 'edit-product/:id',
        component: EditProductComponent,
        canActivate: [MerchantAuthGuard],
        data: {
          requiresApproval: true,
          title: 'تعديل منتج',
          description: 'صفحة تعديل المنتجات - متاحة للتجار المعتمدين فقط'
        }
      },
    ]
  },
  { path: 'Home', component: HomePageComponent },
  { path: 'exchange', loadComponent: () => import('./features/reader-community/reader-community.component').then(m => m.ReaderCommunityComponent) },
  { path: 'auctions', loadComponent: () => import('./features/reader-community/reader-community.component').then(m => m.ReaderCommunityComponent) },
  { path: 'bundles', redirectTo: '/promotions', pathMatch: 'full' },
  { path: 'books', component: BooksComponent },
  { path: 'Business-Marketing-Finance', redirectTo: '/category/أعمال وتسويق ومالية', pathMatch: 'full' },
  { path: 'Education-children', redirectTo: '/category/تربية وأطفال', pathMatch: 'full' },
  { path: 'Arts-crafts', redirectTo: '/category/فنون وحرف', pathMatch: 'full' },
  { path: 'HealthMedicineScience', redirectTo: '/category/صحة وطب وعلوم', pathMatch: 'full' },
  { path: 'Islamic', redirectTo: '/category/كتب دينية', pathMatch: 'full' },
  { path: 'Novels-stories', redirectTo: '/category/روايات وقصص', pathMatch: 'full' },
  { path: 'Self-development-psychology', redirectTo: '/category/تطوير الذات وعلم النفس', pathMatch: 'full' },
  { path: 'History-Biographies', redirectTo: '/category/تاريخ وسير ذاتية', pathMatch: 'full' },
  { path: 'Dictionaries-References', redirectTo: '/category/قواميس ومراجع', pathMatch: 'full' },
  { path: 'office-supplies', redirectTo: '/category/أدوات مكتبية', pathMatch: 'full' },
  { path: 'category/:name', component: BooksComponent },
  {
    path: 'ControlPanel',
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule),
    canActivate: [AdminAuthGuard]
  },
  { path: 'book/:id/:name?', component: BookDetailsComponent },
  { path: 'product/:id/:name?', component: BookDetailsComponent },
  { path: '', component: LandingComponent, pathMatch: 'full' }, // Landing component handles initial redirection
  { path: 'research', component: SearchResultsComponent }, // المسار الذي نوجه إليه المستخدم عند البحث
  { path: 'basket', component: CartComponent },
  { path: 'promotions', loadChildren: () => import('./features/promotions/promotions.module').then(m => m.PromotionsModule) },
  { path: 'bourse', loadComponent: () => import('./bourse/bourse.component').then(m => m.BourseComponent) },
  { path: 'favorites', component: FavoritesComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'account', redirectTo: '/profile', pathMatch: 'full' },
  { path: 'profile', component: UserProfileComponent },
  { path: 'profile/:id', component: UserProfileComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'requests', component: UserOrdersComponent },
  { path: 'referrals', component: ReferralsComponent },
  { path: 'print', component: PrintComponent },
  { path: 'library', component: LibraryComponent },
  { path: 'reader/:ebookId', component: EpubReaderComponent },
  { path: 'subscription', component: SubscriptionComponent },
  { path: 'downloads', component: DownloadsComponent },
  {
    path: 'subscription/callback',
    loadComponent: () => import('./subscription/subscription-callback/subscription-callback.component').then(m => m.SubscriptionCallbackComponent)
  },
  {
    path: 'order/callback',
    loadComponent: () => import('./checkout-modal/order-callback/order-callback.component').then(m => m.OrderCallbackComponent)
  },
  // Routes with parameters must come before routes without parameters
  { path: 'office-supplies/:id/:name?', component: BookDetailsComponent },
  // Routes without parameters come after
  // Redirected non-book/stationery routes to Home
  { path: 'electronics', redirectTo: '/Home', pathMatch: 'full' },
  { path: 'clothing', redirectTo: '/Home', pathMatch: 'full' },
  { path: 'cosmetics', redirectTo: '/Home', pathMatch: 'full' },
  { path: 'shoes', redirectTo: '/Home', pathMatch: 'full' },
  { path: 'furniture', redirectTo: '/Home', pathMatch: 'full' },
  { path: 'games', redirectTo: '/Home', pathMatch: 'full' },
  { path: 'fabrics', redirectTo: '/Home', pathMatch: 'full' },
  { path: 'others', redirectTo: '/Home', pathMatch: 'full' },


  { path: 'عن-الموقع', component: AboutComponent },
  { path: 'سياسة-الخصوصية', component: PrivacyPolicyComponent },
  { path: 'الشروط-والاحكام', component: TermsConditionsComponent },
  { path: 'achievements', component: GamificationDashboardComponent },
  { path: 'earn', component: HowToEarnComponent },
  { path: 'marketer-hub', component: MarketerHubComponent, canActivate: [MarketerAuthGuard] },
  // Mushaf and Quran Dashboard routes removed for build separation
  // path: 'mushaf', loadChildren: ...
  // path: 'quran-dashboard', loadChildren: ...
  // يجب أن يكون هذا المسار قرب النهاية لتجنب التعارض مع المسارات الثابتة الأخرى
  { 
    path: 'community', 
    children: [
      { path: '', loadComponent: () => import('./features/community/community.component').then(m => m.CommunityComponent) },
      { path: 'halaqa/:id', loadComponent: () => import('./features/community/halaqa-details/halaqa-details.component').then(m => m.HalaqaDetailsComponent) },
      { path: ':id', loadComponent: () => import('./features/community/halaqa-details/halaqa-details.component').then(m => m.HalaqaDetailsComponent) }
    ]
  },
  { 
    path: 'reader-community', 
    loadComponent: () => import('./features/reader-community/reader-community.component').then(m => m.ReaderCommunityComponent) 
  },
  { path: ':username', component: MerchantProfileComponent },
  { path: '**', component: NotFoundComponent }
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
