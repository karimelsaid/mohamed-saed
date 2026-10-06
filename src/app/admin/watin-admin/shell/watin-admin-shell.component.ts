import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-watin-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="watin-admin-layout">
      <!-- Watin Admin Sidebar/Topnav -->
      <nav class="watin-nav">
        <ul>
          <li><a routerLink="./overview" routerLinkActive="active">نظرة عامة</a></li>
          <li><a routerLink="./speakers" routerLinkActive="active">المشايخ</a></li>
          <li><a routerLink="./categories" routerLinkActive="active">الأقسام</a></li>
          <li><a routerLink="./lectures" routerLinkActive="active">المحاضرات</a></li>
          <li><a routerLink="./transcription-center" routerLinkActive="active">مركز التفريغ</a></li>
          <li><a routerLink="./apps" routerLinkActive="active">التطبيقات</a></li>
        </ul>
      </nav>

      <!-- Main Content -->
      <main class="watin-content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .watin-admin-layout {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .watin-nav {
      background: #f8f9fa;
      padding: 10px 20px;
      border-radius: 8px;
    }
    .watin-nav ul {
      list-style: none;
      display: flex;
      gap: 20px;
      margin: 0;
      padding: 0;
    }
    .watin-nav a {
      text-decoration: none;
      color: #333;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 4px;
    }
    .watin-nav a.active {
      background: var(--primary-color, #1F3A2E);
      color: white;
    }
    .watin-content {
      background: white;
      border-radius: 8px;
      min-height: 400px;
    }
  `]
})
export class WatinAdminShellComponent {}
