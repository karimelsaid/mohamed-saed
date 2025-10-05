import { Component, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { faChevronLeft, faChevronRight, faSearch } from '@fortawesome/free-solid-svg-icons';
import { faGooglePlay } from '@fortawesome/free-brands-svg-icons';
import { DataService } from './services/data.service';
import { ModalService, ModalConfig } from './services/modal.service';
import { TutorialService } from './services/tutorial.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: false,
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'kenouz';  // Added title property to fix the error
  currentYear = new Date().getFullYear(); // السنة الحالية

  faChevronLeft = faChevronLeft;
  faChevronRight = faChevronRight;
  faSearch = faSearch;
  faGooglePlay = faGooglePlay;
  outOn = false;
  isSearchPage: boolean = false; // متغير لتحديد إذا كانت الصفحة هي صفحة البحث

  allBooks: any[] = []; // جميع الكتب في الموقع

  isDarkMode: boolean = false; // Track dark mode state
  modalConfig: ModalConfig | null = null;
  private modalSubscription: Subscription | null = null;

  constructor(private router: Router, private dataService: DataService, private modalService: ModalService, private tutorialService: TutorialService) {}

  ngOnInit(): void {
    // تحقق من وجود صفحة البحث في المسار
    this.router.events.subscribe((event: any) => {
      if (event.url) {
        // تحقق إذا كان الـ URL يحتوي على استعلام البحث
        this.isSearchPage = event.url.includes('/search'); // على حسب المسار الذي تستخدمه للبحث
      }
    });

    // Scroll to top on navigation
    this.router.events.subscribe((event: any) => {
      if (event.urlAfterRedirects) {
        window.scrollTo(0, 0);
      }
    });

    // Load allBooks data here
    this.dataService.getData().subscribe((data: any) => {
      this.allBooks = data;
    });

    // Initialize dark mode from localStorage or system preference
    const darkModeStored = localStorage.getItem('darkMode');
    if (darkModeStored !== null) {
      this.isDarkMode = darkModeStored === 'true';
    } else {
      // Use system preference
      this.isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this.updateDarkModeClass();

    // Reset and start tutorial unconditionally to show the tutorial window always, unless permanently disabled
    if (!this.tutorialService.isTutorialDisabledPermanently()) {
      this.tutorialService.resetTutorial();
      setTimeout(() => {
        this.tutorialService.startTutorial();
      }, 5000); // Show tutorial after 5 seconds delay
    }

    // Subscribe to modal service
    this.modalSubscription = this.modalService.modal$.subscribe(config => {
      this.modalConfig = config;
    });
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('darkMode', this.isDarkMode.toString());
    this.updateDarkModeClass();
  }

  updateDarkModeClass(): void {
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  onSearchExecuted(event: { query: string; filter: string }) {
    const query = event.query || '';
    const filter = event.filter || 'all';
    if (query.trim()) {
      this.router.navigate(['/research'], { queryParams: { q: query.trim(), filter } });
    } else {
      this.router.navigate(['/research'], { queryParams: { filter } });
    }
  }

  copyPhoneNumber(): void {
    const phoneNumber = '01094612729';
    navigator.clipboard.writeText(phoneNumber).then(() => {
      alert('تم نسخ الرقم');
    }).catch(() => {
      alert('فشل نسخ الرقم');
    });
  }

  ngOnDestroy(): void {
    if (this.modalSubscription) {
      this.modalSubscription.unsubscribe();
    }
  }

  closeModal(): void {
    this.modalConfig = null;
  }
}
