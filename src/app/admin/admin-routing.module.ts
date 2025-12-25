import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { PaymentRequestsComponent } from './payment-requests/payment-requests.component';

const routes: Routes = [
    { path: '', component: AdminDashboardComponent },
    { path: 'payment-requests', component: PaymentRequestsComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AdminRoutingModule { }
