import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Guards
import { MerchantAuthGuard } from './guards/merchant-auth.guard';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { MarketerAuthGuard } from './guards/marketer-auth.guard';

// Static components
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { UserProfileComponent } from './auth/user-profile/user-profile.component';
import { UserOrdersComponent } from './user-orders/user-orders.component';
import { PrintComponent } from './print/print.component';
import { ReferralsComponent } from './referrals/referrals.component';
import { AboutComponent } from './about/about.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { TermsConditionsComponent } from './terms-conditions/terms-conditions.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { MerchantDashboardComponent } from './merchant/dashboard/dashboard.component';
import { AddProductComponent } from './merchant/add-product/add-product.component';
import { EditProductComponent } from './merchant/edit-product/edit-product.component';
import { MerchantProfileComponent } from './merchant/merchant-profile/merchant-profile.component';
import { LibraryComponent } from './library/library.component';
import { EpubReaderComponent } from './epub-reader/epub-reader.component';
import { SubscriptionComponent } from './subscription/subscription.component';
import { DownloadsComponent } from './downloads/downloads.component';
import { GamificationDashboardComponent } from './gamification/dashboard/dashboard.component';
import { MarketerHubComponent } from './marketer-hub/marketer-hub.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { RecommendationsComponent } from './recommendations/recommendations.component';

// ✅ Standalone components imported for SSR compatibility
import { HomePageComponent } from './home-page/home-page.component';
import { BookDetailsComponent } from './book-details/book-details.component';
import { BookResolver } from './book.resolver';

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
  // ✅ SSR-compatible: static import + resolver يجيب البيانات قبل الـ render
  { path: 'Home', component: HomePageComponent },
  { path: 'book/:id', component: BookDetailsComponent, resolve: { book: BookResolver } },
  { path: 'book/:id/:name', component: BookDetailsComponent, resolve: { book: BookResolver } },
  { path: 'product/:id', component: BookDetailsComponent, resolve: { book: BookResolver } },
  { path: 'product/:id/:name', component: BookDetailsComponent, resolve: { book: BookResolver } },

  { path: 'exchange', loadComponent: () => import('./features/reader-community/reader-community.component').then(m => m.ReaderCommunityComponent) },
  { path: 'auctions', loadComponent: () => import('./features/reader-community/reader-community.component').then(m => m.ReaderCommunityComponent) },
  { path: 'bundles', redirectTo: '/promotions', pathMatch: 'full' },
  { path: 'books', loadComponent: () => import('./book-list/books/books.component').then(m => m.BooksComponent) },
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
  { path: 'category/:name', loadComponent: () => import('./book-list/books/books.component').then(m => m.BooksComponent) },
  {
    path: 'ControlPanel',
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule),
    canActivate: [AdminAuthGuard]
  },
  {
    path: '',
    loadComponent: () => import('./core/components/landing/landing.component').then(m => m.LandingComponent),
    pathMatch: 'full'
  },
  { path: 'research', loadComponent: () => import('./search-results/search-results.component').then(m => m.SearchResultsComponent) },
  { path: 'basket', loadComponent: () => import('./cart/cart.component').then(m => m.CartComponent) },
  { path: 'promotions', loadChildren: () => import('./features/promotions/promotions.module').then(m => m.PromotionsModule) },
  { path: 'bourse', loadComponent: () => import('./bourse/bourse.component').then(m => m.BourseComponent) },
  { path: 'favorites', loadComponent: () => import('./favorites/favorites.component').then(m => m.FavoritesComponent) },
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
  { path: 'subscription/callback', loadComponent: () => import('./subscription/subscription-callback/subscription-callback.component').then(m => m.SubscriptionCallbackComponent) },
  { path: 'order/callback', loadComponent: () => import('./checkout-modal/order-callback/order-callback.component').then(m => m.OrderCallbackComponent) },
  { path: 'office-supplies/:id/:name?', loadComponent: () => import('./book-details/book-details.component').then(m => m.BookDetailsComponent) },
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
  { path: 'earn', loadComponent: () => import('./pages/how-to-earn/how-to-earn.component').then(m => m.HowToEarnComponent) },
  { path: 'marketer-hub', component: MarketerHubComponent, canActivate: [MarketerAuthGuard] },
  { path: 'recommendations', component: RecommendationsComponent },
  {
    path: 'community',
    children: [
      { path: '', loadComponent: () => import('./features/community/community.component').then(m => m.CommunityComponent) },
      { path: 'halaqa/:id', loadComponent: () => import('./features/community/halaqa-details/halaqa-details.component').then(m => m.HalaqaDetailsComponent) },
      { path: ':id', loadComponent: () => import('./features/community/halaqa-details/halaqa-details.component').then(m => m.HalaqaDetailsComponent) }
    ]
  },
  { path: 'reader-community', loadComponent: () => import('./features/reader-community/reader-community.component').then(m => m.ReaderCommunityComponent) },
  { path: ':username', component: MerchantProfileComponent },
  { path: '**', component: NotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    initialNavigation: 'enabledBlocking', // ✅ مطلوب لـ SSR - بيخلي Angular Universal ينتظر الـ routing قبل ما يرسل الـ HTML
    scrollPositionRestoration: 'enabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }