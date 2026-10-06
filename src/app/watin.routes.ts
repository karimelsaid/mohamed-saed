import { Routes } from '@angular/router';
import { LayoutComponent } from './features/watin/components/layout/layout.component';
import { HomeComponent } from './features/watin/components/home/home.component';
import { LectureTranscriptionComponent } from './features/watin/components/lecture-transcription/lecture-transcription.component';
import { LibraryComponent } from './features/watin/components/library/library.component';
import { SearchComponent } from './features/watin/components/search/search.component';
import { MoreComponent } from './features/watin/components/more/more.component';
import { LecturesComponent } from './features/watin/components/lectures/lectures.component';
import { CategoriesComponent } from './features/watin/components/categories/categories.component';
import { LectureDetailsComponent } from './features/watin/components/lecture-details/lecture-details.component';
import { IslamicLessonsComponent } from './features/watin/components/islamic-lessons/islamic-lessons.component';

export const watinRoutes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', component: HomeComponent },
      { path: 'transcription', component: LectureTranscriptionComponent },
      { path: 'library', component: LibraryComponent },
      { path: 'search', component: SearchComponent },
      { path: 'more', component: MoreComponent },
      { path: 'lectures', component: LecturesComponent },
      { path: 'lectures/:slug', component: LectureDetailsComponent },
      { path: 'categories', component: CategoriesComponent },
      { path: 'islamic-lessons', component: IslamicLessonsComponent }
    ]
  },
  { 
    path: 'login', 
    loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent) 
  },
  { 
    path: 'register', 
    loadComponent: () => import('./auth/register/register.component').then(m => m.RegisterComponent) 
  },
  { 
    path: 'profile', 
    loadComponent: () => import('./features/watin/components/profile/watin-profile.component').then(m => m.WatinProfileComponent) 
  }
];
