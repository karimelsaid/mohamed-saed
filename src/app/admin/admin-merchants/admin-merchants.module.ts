import { NgModule } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AdminMerchantsComponent } from './admin-merchants.component';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@NgModule({
  declarations: [
    AdminMerchantsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    FontAwesomeModule
  ],
  providers: [DatePipe],
  exports: [
    AdminMerchantsComponent
  ]
})
export class AdminMerchantsModule { }
