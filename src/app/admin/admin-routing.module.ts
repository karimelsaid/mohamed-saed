import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { PaymentRequestsComponent } from './payment-requests/payment-requests.component';
import { AdminAutomationComponent } from './admin-automation/admin-automation.component';

const routes: Routes = [
    { path: '', component: AdminDashboardComponent },
    { path: 'payment-requests', component: PaymentRequestsComponent },
    { path: 'automation', component: AdminAutomationComponent },
    { path: 'promotions-manager', loadComponent: () => import('./promotions-manager/promotions-manager.component').then(m => m.PromotionsManagerComponent) },
    { path: 'sales-registration', loadComponent: () => import('./sales-registration/sales-registration.component').then(m => m.SalesRegistrationComponent) },
    { path: 'shortages-report', loadComponent: () => import('./shortages-report/shortages-report.component').then(m => m.ShortagesReportComponent) },
    { path: 'marketers', loadComponent: () => import('./marketer-management/marketer-management.component').then(m => m.MarketerManagementComponent) },
    { path: 'special-offers', loadComponent: () => import('./special-offers-manager/special-offers-manager.component').then(m => m.SpecialOffersManagerComponent) }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AdminRoutingModule { }
