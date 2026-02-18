import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MushafPageComponent } from './components/mushaf-page.component';

const routes: Routes = [
    { path: '', component: MushafPageComponent },
    {
        path: 'login',
        loadComponent: () => import('./components/mushaf-login.component').then(m => m.MushafLoginComponent)
    },
    {
        path: 'register',
        loadComponent: () => import('./components/mushaf-register.component').then(m => m.MushafRegisterComponent)
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

