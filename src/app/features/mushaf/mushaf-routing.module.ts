import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MushafPageComponent } from './components/mushaf-page.component';

const routes: Routes = [
    { path: '', component: MushafPageComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class MushafRoutingModule { }
