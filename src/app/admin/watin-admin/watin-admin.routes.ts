import { Routes } from '@angular/router';

export const WATIN_ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/watin-admin-shell.component').then(m => m.WatinAdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { 
        path: 'overview', 
        title: 'وتين - لوحة التحكم', 
        loadComponent: () => import('./pages/overview/overview.page').then(m => m.OverviewPage) 
      },
      { 
        path: 'speakers', 
        title: 'وتين - المشايخ', 
        loadComponent: () => import('./pages/speakers/speakers.page').then(m => m.SpeakersPage) 
      },
      { 
        path: 'categories', 
        title: 'وتين - الأقسام', 
        loadComponent: () => import('./pages/categories/categories.page').then(m => m.CategoriesPage) 
      },
      { 
        path: 'lectures', 
        title: 'وتين - المحاضرات', 
        loadComponent: () => import('./pages/lectures/lectures.page').then(m => m.LecturesPage) 
      },
      { 
        path: 'transcription-center', 
        title: 'وتين - مركز التفريغ', 
        loadComponent: () => import('./pages/transcription-center/transcription-center.page').then(m => m.TranscriptionCenterPage) 
      },
      { 
        path: 'review/:id', 
        title: 'وتين - محرر المراجعة', 
        loadComponent: () => import('./pages/review-editor/review-editor.page').then(m => m.ReviewEditorPage) 
      },
      { 
        path: 'apps', 
        title: 'وتين - التطبيقات', 
        loadComponent: () => import('./pages/apps/apps.page').then(m => m.AppsPage) 
      }
    ]
  }
];
