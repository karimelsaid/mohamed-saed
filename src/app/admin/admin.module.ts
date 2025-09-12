import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { MerchantManagementComponent } from './merchant-management/merchant-management.component';
import { ProductApprovalComponent } from './product-approval/product-approval.component';
import { FreeShippingRulesComponent } from './admin-dashboard/free-shipping/free-shipping-rules.component';

@NgModule({
  declarations: [
    AdminDashboardComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    FontAwesomeModule,
    MerchantManagementComponent,
    ProductApprovalComponent,
    FreeShippingRulesComponent
  ],
  exports: [
    AdminDashboardComponent,
    MerchantManagementComponent,
    ProductApprovalComponent
  ]
})
export class AdminModule { }
