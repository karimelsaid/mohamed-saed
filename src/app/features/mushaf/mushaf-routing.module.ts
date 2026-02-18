import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MushafPageComponent } from './components/mushaf-page.component';

const routes: Routes = [
    { path: '', component: MushafPageComponent },
    {
        path: 'login',
        loadComponent: () => import('../../auth/login/login.component').then(m => m.LoginComponent)
    },
    {
        path: 'register',
        loadComponent: () => import('../../auth/register/register.component').then(m => m.RegisterComponent)
    },
    {
        path: 'profile',
        loadComponent: () => import('../../auth/user-profile/user-profile.component').then(m => m.UserProfileComponent)
    },
    {
        path: 'community',
        loadComponent: () => import('../community/community.component').then(m => m.CommunityComponent)
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class MushafRoutingModule { }
