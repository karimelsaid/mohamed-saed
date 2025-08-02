import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // لو المكون بيستخدم ngModel
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AccountModalComponent } from '../auth/account-modal/account-modal.component';
import { LoginComponent } from '../auth/login/login.component';
import { RegisterComponent } from '../auth/register/register.component';
import { FreeShippingRulesComponent } from '../admin/admin-dashboard/free-shipping-rules.component';
import { AdminMerchantsComponent } from '../admin/admin-merchants.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    FontAwesomeModule,
    AccountModalComponent,
    LoginComponent,
    RegisterComponent,
    FreeShippingRulesComponent,
    AdminMerchantsComponent
  ],
  exports: [
    AccountModalComponent, // 👈 علشان نقدر نستخدمه بره
    LoginComponent,
    RegisterComponent,
    FreeShippingRulesComponent,
    AdminMerchantsComponent
  ]
})
export class SharedModule { }
