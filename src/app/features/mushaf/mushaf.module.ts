import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MushafPageComponent } from './components/mushaf-page.component';
import { MushafRoutingModule } from './mushaf-routing.module';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { MutabaaTrackerComponent } from './components/mutabaa-tracker/mutabaa-tracker.component';
import { HifzWizardComponent } from './components/hifz-wizard/hifz-wizard.component';

@NgModule({
    declarations: [
        MushafPageComponent,
        HifzWizardComponent
    ],
    imports: [
        CommonModule,
        MushafRoutingModule,
        FormsModule,
        FontAwesomeModule,
        MutabaaTrackerComponent
    ],
    exports: [
        MushafPageComponent
    ]
})
export class MushafModule { }
