import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { PaymentRequestsComponent } from './payment-requests/payment-requests.component';
import { AdminAutomationComponent } from './admin-automation/admin-automation.component';
import { AmazonCatalogComponent } from './amazon-catalog/amazon-catalog.component';
import { ShippingSettingsComponent } from './shipping-settings/shipping-settings.component';
import { PartnershipComponent } from './partnership/partnership.component';

const routes: Routes = [
    { path: '', component: AdminDashboardComponent },
    { path: 'payment-requests', component: PaymentRequestsComponent },
    { path: 'automation', component: AdminAutomationComponent },
    { path: 'ai-control-center', loadComponent: () => import('./ai-control-center/ai-control-center.component').then(m => m.AiControlCenterComponent) },
    { path: 'promotions-manager', loadComponent: () => import('./promotions-manager/promotions-manager.component').then(m => m.PromotionsManagerComponent) },
    { path: 'sales-registration', loadComponent: () => import('./sales-registration/sales-registration.component').then(m => m.SalesRegistrationComponent) },
    { path: 'shortages-report', loadComponent: () => import('./shortages-report/shortages-report.component').then(m => m.ShortagesReportComponent) },
    { path: 'marketers', loadComponent: () => import('./marketer-management/marketer-management.component').then(m => m.MarketerManagementComponent) },
    { path: 'special-offers', loadComponent: () => import('./special-offers-manager/special-offers-manager.component').then(m => m.SpecialOffersManagerComponent) },
    { path: 'product-management', loadComponent: () => import('./product-management/product-management.component').then(m => m.ProductManagementComponent) },
    { path: 'amazon-diagnostics', loadComponent: () => import('./amazon-diagnostics/amazon-diagnostics.component').then(m => m.AmazonDiagnosticsComponent) },
    { path: 'amazon-catalog', component: AmazonCatalogComponent },
    { path: 'shipping-settings', component: ShippingSettingsComponent },
    { path: 'partnership', component: PartnershipComponent },
    { path: 'youtube-manager', loadComponent: () => import('./youtube-manager/youtube-manager.component').then(m => m.YoutubeManagerComponent) },
    { path: 'categories', loadComponent: () => import('./admin-categories/admin-categories.component').then(m => m.AdminCategoriesComponent) },
    { path: 'watin', loadChildren: () => import('./watin-admin/watin-admin.routes').then(m => m.WATIN_ADMIN_ROUTES) }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AdminRoutingModule { }
