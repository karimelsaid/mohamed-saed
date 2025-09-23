import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // لو المكون بيستخدم ngModel
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AccountModalComponent } from '../auth/account-modal/account-modal.component';
import { LoginComponent } from '../auth/login/login.component';
import { RegisterComponent } from '../auth/register/register.component';
import { FreeShippingRulesComponent } from '../admin/admin-dashboard/free-shipping/free-shipping-rules.component';
import { ModalDialogComponent } from './modal-dialog/modal-dialog.component';
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    FontAwesomeModule,
    AccountModalComponent,
    LoginComponent,
    RegisterComponent,
    FreeShippingRulesComponent,
    ModalDialogComponent
  ],
  exports: [
    AccountModalComponent, // 👈 علشان نقدر نستخدمه بره
    LoginComponent,
    RegisterComponent,
    FreeShippingRulesComponent,
    ModalDialogComponent
  ]
})
export class SharedModule { }
