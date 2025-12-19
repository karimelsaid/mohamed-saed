import { Component, Input, Output, EventEmitter, ElementRef, ViewChild } from '@angular/core';
import { faCoins, faShareAlt, faCheckCircle, faTimes } from '@fortawesome/free-solid-svg-icons';
import html2canvas from 'html2canvas';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-achievement-card',
  templateUrl: './achievement-card.component.html',
  styleUrls: ['./achievement-card.component.css'],
  standalone: false
})
export class AchievementCardComponent {
  @Input() visible: boolean = false;
  @Input() userName: string = 'قارئ متميز';
  @Input() coinsEarned: number = 0;
  @Input() milestoneTitle: string = 'بداية الرحلة';

  private _userImage: string | null = null;
  @Input()
  set userImage(value: string | null) {
    this._userImage = this.processImageUrl(value);
  }
  get userImage(): string | null {
    return this._userImage;
  }

  processImageUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith('data:')) return path; // Allow Base64
    if (path.startsWith('http')) return path; // Already absolute/external

    // Clean path
    let cleanPath = path.replace(/\\/g, '/');
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);

    // Handle base URL
    let baseUrl = environment.apiBaseUrl;
    if (baseUrl.endsWith('/api')) {
      baseUrl = baseUrl.slice(0, -4);
    }

    return `${baseUrl}/${cleanPath}`;
  }

  @Output() close = new EventEmitter<void>();

  @ViewChild('cardContainer') cardContainer!: ElementRef;

  faCoins = faCoins;
  faShareAlt = faShareAlt;
  faCheckCircle = faCheckCircle;
  faTimes = faTimes;

  isSharing = false;

  closeModal() {
    this.visible = false;
    this.close.emit();
  }

  // ... (existing imports moved to top)

  async shareAchievement() {
    console.log('--- SHARE V5 (VISIBLE SNAPSHOT) - ' + new Date().toISOString() + ' ---');
    this.isSharing = true;

    try {
      const cardEl = this.cardContainer.nativeElement;
      if (!cardEl) {
        console.error('Card container not found!');
        this.isSharing = false;
        return;
      }

      // 1. Backup original image
      const originalImage = this._userImage;

      // 2. Pre-load user image as base64 and UPDATE STATE
      if (originalImage && originalImage.startsWith('http')) {
        console.log('Generating Base64 for visible capture...');
        try {
          const base64Img = await this.getBase64Image(originalImage);
          console.log('Base64 ready, updating UI state...');

          // This will update the visible <img> via Angular binding
          this._userImage = base64Img;

          // Wait for Angular to render and Image to decode
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
          console.warn('Failed to generate base64', e);
        }
      }

      try {
        console.log('Capturing visible card...');

        const canvas = await html2canvas(cardEl, {
          scale: 2,
          backgroundColor: null, // Transparent background if possible
          logging: true,
          useCORS: true,
          allowTaint: false, // Security Safety
          windowWidth: cardEl.scrollWidth,
          windowHeight: cardEl.scrollHeight
        });
        console.log('Capture finished');

        const base64Data = canvas.toDataURL('image/png');

        if (Capacitor.isNativePlatform()) {
          const fileName = `knooz-achievement-${Date.now()}.png`;
          const savedFile = await Filesystem.writeFile({
            path: fileName,
            data: base64Data.split(',')[1],
            directory: Directory.Cache
          });

          await Share.share({
            title: 'إنجازي على كنوز بوك 🏆',
            text: `حققت ${this.coinsEarned} عملة على منصة كنوز بوك! اقرأ واكسب معي.`,
            url: savedFile.uri,
            dialogTitle: 'مشاركة الإنجاز'
          });
        } else {
          this.fallbackShare(base64Data);
        }

      } catch (innerErr) {
        console.error('Capture failed', innerErr);
      } finally {
        // Restore original image state
        this._userImage = originalImage;
        this.isSharing = false;
      }

    } catch (error) {
      console.error('Share Error', error);
      this.isSharing = false;
    }
  }

  async getBase64Image(url: string): Promise<string> {
    // 1. Try Native Download (Bypass CORS)
    if (Capacitor.isNativePlatform()) {
      try {
        console.log('Downloading natively:', url);
        const filename = `temp_img_${Date.now()}.jpg`;
        const download = await Filesystem.downloadFile({
          path: filename,
          directory: Directory.Cache,
          url: url
        });
        // Read back as base64
        const read = await Filesystem.readFile({
          path: filename,
          directory: Directory.Cache
        });
        // Cleanup async (don't await)
        Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => { });

        // Clean the data (remove newlines/whitespace)
        let rawData = typeof read.data === 'string' ? read.data : '';
        rawData = rawData.replace(/(\r\n|\n|\r)/gm, "");

        return `data:image/jpeg;base64,${rawData}`;
      } catch (e) {
        console.warn('Native download failed, trying fetch...', e);
      }
    }

    // 2. Fallback to Fetch (Web / CORS enabled)
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Fallback: Download the image (for Web or failed Native Share)
  fallbackShare(imageUrl: string) {
    const link = document.createElement('a');
    link.download = `knooz-achievement-${Date.now()}.png`;
    link.href = imageUrl;
    link.click();
  }
}
