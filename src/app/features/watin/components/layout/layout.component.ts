import { Component, ViewChild } from '@angular/core';
import { RouterOutlet, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AudioPlayerComponent } from '../audio-player/audio-player.component';

@Component({
  selector: 'app-watin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterModule, CommonModule, AudioPlayerComponent],
  template: `
    <div class="watin-app-container">
      <!-- Main Content Area -->
      <main class="watin-main-content">
        <router-outlet></router-outlet>
      </main>

      <!-- Audio Player (global) -->
      <app-watin-audio-player #audioPlayer></app-watin-audio-player>

      <!-- Bottom Navigation -->
      <nav class="watin-bottom-nav">
        <a routerLink="/home" routerLinkActive="watin-nav-active" class="nav-item">
          <i class="fas fa-home"></i>
          <span>الرئيسية</span>
        </a>
        <a routerLink="/library" routerLinkActive="watin-nav-active" class="nav-item">
          <i class="fas fa-book"></i>
          <span>مكتبتي</span>
        </a>
        <a routerLink="/search" routerLinkActive="watin-nav-active" class="nav-item">
          <i class="fas fa-search"></i>
          <span>البحث</span>
        </a>
        <a routerLink="/more" routerLinkActive="watin-nav-active" class="nav-item">
          <i class="fas fa-bars"></i>
          <span>المزيد</span>
        </a>
      </nav>
    </div>
  `,
  styles: [`
    .watin-app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
      background-color: var(--watin-bg);
      overflow: hidden;
    }
    
    .watin-main-content {
      flex: 1;
      overflow-y: auto;
      padding-bottom: 70px; /* Space for bottom nav */
    }

    .watin-bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 65px;
      background-color: var(--watin-surface);
      display: flex;
      justify-content: space-around;
      align-items: center;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
      border-top: 1px solid rgba(0,0,0,0.05);
      z-index: 1000;
    }

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--watin-sage);
      text-decoration: none;
      gap: 4px;
      width: 25%;
      height: 100%;
      transition: color 0.2s ease;
    }

    .nav-item i {
      font-size: 20px;
    }

    .nav-item span {
      font-size: 11px;
      font-weight: 500;
    }

    .nav-item.watin-nav-active {
      color: var(--watin-forest);
    }
    
    .nav-item.watin-nav-active i {
      color: var(--watin-forest);
    }
  `]
})
export class LayoutComponent {
  @ViewChild('audioPlayer') audioPlayer!: AudioPlayerComponent;

  playLecture(audioUrl: string, title: string, speaker: string) {
    this.audioPlayer.loadAudio(audioUrl, title, speaker);
  }
}
