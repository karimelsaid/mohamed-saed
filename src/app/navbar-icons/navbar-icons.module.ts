import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavbarIconsComponent } from './navbar-icons.component';

@NgModule({
  imports: [
    CommonModule,
    NavbarIconsComponent
  ],
  exports: [
    NavbarIconsComponent
  ]
})
export class NavbarIconsModule { }
