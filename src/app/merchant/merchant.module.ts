import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MerchantRegistrationComponent } from './merchant-registration.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    MerchantRegistrationComponent
  ],
  exports: [
    MerchantRegistrationComponent
  ]
})
export class MerchantModule { }
