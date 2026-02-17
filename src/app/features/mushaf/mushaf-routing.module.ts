import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MushafPageComponent } from './components/mushaf-page.component';
import { LoginComponent } from '../../auth/login/login.component';
import { RegisterComponent } from '../../auth/register/register.component';
import { UserProfileComponent } from '../../auth/user-profile/user-profile.component';
import { CommunityComponent } from '../community/community.component';

const routes: Routes = [
    { path: '', component: MushafPageComponent },
    { path: 'login', component: LoginComponent },
    { path: 'register', component: RegisterComponent },
    { path: 'profile', component: UserProfileComponent },
    { path: 'community', component: CommunityComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class MushafRoutingModule { }
