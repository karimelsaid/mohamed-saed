import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'services',
    loadComponent: () =>
      import('./pages/services/services-page.component').then((m) => m.ServicesPageComponent)
  },
  {
    path: 'products',
    loadComponent: () =>
      import('./pages/products/products-page.component').then((m) => m.ProductsPageComponent)
  },
  {
    path: 'orders',
    loadComponent: () =>
      import('./pages/orders/orders-page.component').then((m) => m.OrdersPageComponent)
  },
  {
    path: 'messages',
    loadComponent: () =>
      import('./pages/communications/communications-page.component').then(
        (m) => m.CommunicationsPageComponent
      )
  },
  {
    path: 'auth',
    loadComponent: () =>
      import('./pages/auth/auth-page.component').then((m) => m.AuthPageComponent)
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./pages/admin/admin-dashboard.component').then((m) => m.AdminDashboardComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
