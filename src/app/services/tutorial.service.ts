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
        id: 'welcome',
        title: 'مرحباً بك في كنوز!',
        description: 'سوف نأخذك في جولة سريعة للتعرف على أهم مميزات التطبيق',
        position: 'center',
        action: () => {
          this.router.navigate(['/Home']);
        }
      },
      {
        id: 'categories',
        title: 'فئات الكتب',
        description: 'تصفح مجموعة واسعة من فئات الكتب المتنوعة من الدينية إلى التعليمية',
        element: '.grid.grid-cols-2',
        position: 'bottom',
        action: () => {
          this.router.navigate(['/Home']);
        }
      },
  {
    id: 'search',
    title: 'البحث المتقدم',
    description: 'ابحث عن الكتب بسهولة باستخدام شريط البحث في الأعلى',
    element: '.tutorial-search',
    position: 'bottom',
    action: () => {
      this.router.navigate(['/Home']);
    }
  },
      {
        id: 'recent-books',
        title: 'الكتب الجديدة',
        description: 'اكتشف أحدث الكتب المضافة إلى المكتبة',
        element: '.tutorial-recent-books',
        position: 'bottom',
        action: () => {
          this.router.navigate(['/Home']);
        }
      },
      {
        id: 'cart-favorites',
        title: 'السلة والمفضلة',
        description: 'أضف الكتب إلى سلة التسوق أو قائمة المفضلة لشرائها لاحقاً',
        element: 'app-navbar',
        position: 'bottom',
        action: () => {
          this.router.navigate(['/Home']);
        }
      },
      {
        id: 'user-account',
        title: 'حسابك الشخصي',
        description: 'سجل دخولك أو أنشئ حساباً جديداً للوصول إلى جميع المميزات',
        element: 'app-navbar',
        position: 'bottom',
        action: () => {
          this.router.navigate(['/Home']);
        }
      },
      {
        id: 'print-services',
        title: 'خدمات الطباعة',
        description: 'اطلب طباعة كتبك الخاصة بجودة عالية وأسعار مناسبة',
        element: '.tutorial-create-project',
        position: 'bottom',
        action: () => {
          // Navigate to print route first
          this.router.navigate(['/print']).then(() => {
            // Then scroll to the create project element
            setTimeout(() => {
              const createProjectElement = document.querySelector('.tutorial-create-project');
              if (createProjectElement) {
                createProjectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 50); // Wait for navigation to complete
          });
        }
      },
      {
        id: 'get-started',
        title: 'ابدأ الآن!',
        description: 'الآن أنت جاهز لاستكشاف عالم الكتب. استمتع بتجربة التسوق!',
        position: 'center',
        action: () => {
          this.router.navigate(['/Home']);
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
