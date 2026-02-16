import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  element?: string; // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: () => void; // Optional action to perform when step is shown
}

export interface TutorialState {
  isActive: boolean;
  currentStep: number;
  steps: TutorialStep[];
  completed: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TutorialService {
  private readonly STORAGE_KEY = 'tutorial_completed';
  private readonly CURRENT_STEP_KEY = 'tutorial_current_step';

  private tutorialState = new BehaviorSubject<TutorialState>({
    isActive: false,
    currentStep: 0,
    steps: [],
    completed: false
  });

  public tutorialState$ = this.tutorialState.asObservable();

  constructor(private router: Router) {
    this.initializeTutorial();
  }

  private initializeTutorial(): void {
    const completed = localStorage.getItem(this.STORAGE_KEY) === 'true';
    const currentStep = parseInt(localStorage.getItem(this.CURRENT_STEP_KEY) || '0', 10);

    this.tutorialState.next({
      isActive: false, // Will be activated when user starts tutorial
      currentStep: currentStep,
      steps: this.getTutorialSteps(),
      completed: completed
    });
  }

  private getTutorialSteps(): TutorialStep[] {
    return [
      {
        id: 'books-sections',
        title: 'الكتب وأقسامها',
        description: 'تصفح آلاف الكتب الورقية في مختلف المجالات، وتعرف على التصنيفات المتاحة بسهولة.',
        element: '#category-books', // Target the specific Books category card
        position: 'center',
        action: () => {
          this.router.navigate(['/Home']).then(() => {
            // Scroll to category
            setTimeout(() => {
              const element = document.querySelector('#category-books');
              if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);
          });
        }
      },
      {
        id: 'other-products',
        title: 'المنتجات الأخرى',
        description: 'استكشف باقي الأقسام المتنوعة مثل الإلكترونيات والألعاب والمستلزمات المكتبية.',
        element: '#categories-grid', // Target the whole grid to show "other stuff" 
        position: 'center',
        action: () => {
          this.router.navigate(['/Home']).then(() => {
            setTimeout(() => {
              // Scroll to grid but maybe a bit offset to show variety
              const grid = document.querySelector('#categories-grid');
              if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
          });
        }
      },
      {
        id: 'digital-library',
        title: 'المكتبة الرقمية',
        description: 'اقرأ وحمل آلاف الكتب الإلكترونية، مع أدوات تفاعلية للبحث والتظليل والمفضلة.',
        element: 'app-library',
        position: 'center',
        action: () => {
          this.router.navigate(['/library']);
        }
      },
      {
        id: 'printing-services',
        title: 'خدمات الطباعة',
        description: 'اطبع كتبك الخاصة أو مذكراتك بجودة عالية وتوصيل سريع لباب منزلك.',
        element: 'app-print',
        position: 'center',
        action: () => {
          this.router.navigate(['/print']);
        }
      },
      {
        id: 'affiliate-program',
        title: 'الربح من الإحالات',
        description: 'اربح المال عن طريق دعوة أصدقائك لاستخدام الموقع، واحصل على عمولات مجزية.',
        element: 'app-referrals',
        position: 'center',
        action: () => {
          this.router.navigate(['/referrals']);
        }
      },
      {
        id: 'merchant-account',
        title: 'حساب التاجر',
        description: 'لبيع منتجاتك معنا، اضغط على "حساب تاجر" هنا لإنشاء حسابك الجديد.',
        element: '#merchant-toggle', // Target the specific toggle button
        position: 'center',
        action: () => {
          this.router.navigate(['/register']).then(() => {
            setTimeout(() => {
              // Ensure the toggle is visible
              const toggle = document.querySelector('#merchant-toggle');
              if (toggle) toggle.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);
          });
        }
      }
    ];
  }

  startTutorial(): void {
    const currentState = this.tutorialState.value;
    this.tutorialState.next({
      ...currentState,
      isActive: true,
      currentStep: 0
    });
    localStorage.setItem(this.CURRENT_STEP_KEY, '0');
  }

  nextStep(): void {
    const currentState = this.tutorialState.value;
    if (currentState.currentStep < currentState.steps.length - 1) {
      const nextStep = currentState.currentStep + 1;
      this.tutorialState.next({
        ...currentState,
        currentStep: nextStep
      });
      localStorage.setItem(this.CURRENT_STEP_KEY, nextStep.toString());

      // Execute step action if exists
      const step = currentState.steps[nextStep];
      if (step.action) {
        step.action();
      }
    } else {
      this.completeTutorial();
    }
  }

  previousStep(): void {
    const currentState = this.tutorialState.value;
    if (currentState.currentStep > 0) {
      const prevStep = currentState.currentStep - 1;
      this.tutorialState.next({
        ...currentState,
        currentStep: prevStep
      });
      localStorage.setItem(this.CURRENT_STEP_KEY, prevStep.toString());

      // Execute step action if exists
      const step = currentState.steps[prevStep];
      if (step.action) {
        step.action();
      }
    }
  }

  skipTutorial(): void {
    this.completeTutorial();
  }

  private completeTutorial(): void {
    const currentState = this.tutorialState.value;
    this.tutorialState.next({
      ...currentState,
      isActive: false,
      completed: true
    });
    localStorage.setItem(this.STORAGE_KEY, 'true');
    localStorage.removeItem(this.CURRENT_STEP_KEY);
  }

  resetTutorial(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.CURRENT_STEP_KEY);
    this.initializeTutorial();
  }

  disableTutorialPermanently(): void {
    localStorage.setItem('tutorial_disabled_permanently', 'true');
    this.completeTutorial();
  }

  isTutorialDisabledPermanently(): boolean {
    return localStorage.getItem('tutorial_disabled_permanently') === 'true';
  }

  getCurrentStep(): TutorialStep | null {
    const state = this.tutorialState.value;
    return state.steps[state.currentStep] || null;
  }

  isTutorialCompleted(): boolean {
    return localStorage.getItem(this.STORAGE_KEY) === 'true';
  }

  shouldShowTutorial(): boolean {
    return !this.isTutorialCompleted();
  }
}
