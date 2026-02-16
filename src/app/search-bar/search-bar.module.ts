import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchBarComponent } from './search-bar.component';

@NgModule({
  imports: [
    CommonModule,
    SearchBarComponent
  ],
  exports: [
    SearchBarComponent
  ]
})
export class SearchBarModule { }
