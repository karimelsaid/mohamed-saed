import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { MerchantManagementComponent } from './merchant-management/merchant-management.component';
import { ProductApprovalComponent } from './product-approval/product-approval.component';
import { FreeShippingRulesComponent } from './admin-dashboard/free-shipping/free-shipping-rules.component';
import { ModalDialogComponent } from '../shared/modal-dialog/modal-dialog.component';
import { PaymentRequestsComponent } from './payment-requests/payment-requests.component';
import { AmazonPriceCalculatorComponent } from './amazon-price-calculator/amazon-price-calculator.component';
import { AdminEbooksComponent } from './admin-ebooks/admin-ebooks.component';
import { SubscriptionSettingsComponent } from './subscription-settings/subscription-settings.component';
import { SalesHistoryComponent } from './sales-history/sales-history.component';
import { AdminBourseSettingsComponent } from './admin-bourse-settings/admin-bourse-settings.component';
import { AdminAutomationComponent } from './admin-automation/admin-automation.component';
import { AmazonCatalogComponent } from './amazon-catalog/amazon-catalog.component';

import { AdminRoutingModule } from './admin-routing.module';

@NgModule({
  declarations: [
  ],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    FontAwesomeModule,
    AdminRoutingModule,
    // Standalone components are imported here
    AdminDashboardComponent,
    MerchantManagementComponent,
    ProductApprovalComponent,
    FreeShippingRulesComponent,
    ModalDialogComponent,
    PaymentRequestsComponent,
    AmazonPriceCalculatorComponent,
    AdminEbooksComponent,
    SubscriptionSettingsComponent,
    SalesHistoryComponent,
    AdminBourseSettingsComponent,
    AdminAutomationComponent
  ],
  exports: [
    MerchantManagementComponent,
    ProductApprovalComponent
  ]
})
// Force rebuild
export class AdminModule { }
