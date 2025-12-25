import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MushafPageComponent } from './components/mushaf-page.component';
import { MushafRoutingModule } from './mushaf-routing.module';
import { FormsModule } from '@angular/forms';

@NgModule({
    declarations: [
        MushafPageComponent
    ],
    imports: [
        CommonModule,
        MushafRoutingModule,
        FormsModule
    ],
    exports: [
        MushafPageComponent
    ]
})
export class MushafModule { }
