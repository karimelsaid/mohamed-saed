import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { PromotionsComponent } from './promotions.component';
import { LuckyWheelComponent } from './lucky-wheel/lucky-wheel.component';

const routes: Routes = [
    { path: '', component: PromotionsComponent }
];

@NgModule({
    declarations: [
    ],
    imports: [
        CommonModule,
        FontAwesomeModule,
        PromotionsComponent,
        LuckyWheelComponent,
        RouterModule.forChild(routes)
    ]
})
export class PromotionsModule { }
