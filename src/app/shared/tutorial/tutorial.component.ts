import { Component, OnInit, OnDestroy, ElementRef, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TutorialService, TutorialStep } from '../../services/tutorial.service';
import { Subscription } from 'rxjs';
import { faChevronLeft, faChevronRight, faTimes, faPlay } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
  selector: 'app-tutorial',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  templateUrl: './tutorial.component.html',
  styleUrls: ['./tutorial.component.css']
})
export class TutorialComponent implements OnInit, OnDestroy {
  faChevronLeft = faChevronLeft;
  faChevronRight = faChevronRight;
  faTimes = faTimes;
  faPlay = faPlay;

  isVisible = false;
  currentStep: TutorialStep | null = null;
  currentStepIndex = 0;
  totalSteps = 0;
  highlightedElement: HTMLElement | null = null;
  pointerElement: HTMLElement | null = null;
  positionClass = '';

  private subscription: Subscription | null = null;

  constructor(
    private tutorialService: TutorialService,
    private elementRef: ElementRef,
    private renderer: Renderer2,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.subscription = this.tutorialService.tutorialState$.subscribe(state => {
      this.isVisible = state.isActive;
      this.currentStepIndex = state.currentStep;
      this.totalSteps = state.steps.length;
      this.currentStep = state.steps[state.currentStep] || null;

      if (this.isVisible && this.currentStep) {
        this.highlightElement();
        this.setPositionClass();
        this.scrollToElement();
      } else {
        this.removeHighlight();
        this.positionClass = '';
      }
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    this.removeHighlight();
  }

  private highlightElement(): void {
    this.removeHighlight();

    if (this.currentStep?.element) {
      // Try to find element immediately
      this.highlightedElement = document.querySelector(this.currentStep.element);

      if (this.highlightedElement) {
        this.applyHighlight();
      } else {
        // If not found, wait and try again (for navigation cases)
        setTimeout(() => {
          this.highlightedElement = document.querySelector(this.currentStep!.element!);
          if (this.highlightedElement) {
            this.applyHighlight();
            this.scrollToElement();
          }
        }, 1000); // Wait 1 second for navigation to complete
      }
    }
  }

  private applyHighlight(): void {
    if (this.highlightedElement) {
      this.renderer.addClass(this.highlightedElement, 'tutorial-highlight');
      this.renderer.setStyle(this.highlightedElement, 'position', 'relative');
      this.renderer.setStyle(this.highlightedElement, 'z-index', '1000');
    }
  }

  private removeHighlight(): void {
    if (this.highlightedElement) {
      this.renderer.removeClass(this.highlightedElement, 'tutorial-highlight');
      this.renderer.removeStyle(this.highlightedElement, 'position');
      this.renderer.removeStyle(this.highlightedElement, 'z-index');
      this.highlightedElement = null;
    }
  }

  private scrollToElement(): void {
    if (this.highlightedElement) {
      this.highlightedElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'center'
      });
    }
  }

  private setPositionClass(): void {
    if (!this.currentStep || !this.currentStep.position) {
      this.positionClass = '';
      return;
    }
    switch (this.currentStep.position) {
      case 'top':
        this.positionClass = 'top-0 bottom-auto -translate-y-0';
        break;
      case 'bottom':
        this.positionClass = 'bottom-0 top-auto -translate-y-0';
        break;
      case 'left':
        this.positionClass = 'left-0 right-auto -translate-x-0';
        break;
      case 'right':
        this.positionClass = 'right-0 left-auto -translate-x-0';
        break;
      case 'center':
      default:
        this.positionClass = 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
        break;
    }
  }

  nextStep(): void {
    // Clean up URL if leaving cart-favorites step
    const currentStep = this.tutorialService.getCurrentStep();
    if (currentStep && currentStep.id === 'cart-favorites') {
      this.router.navigate(['/research'], { queryParams: { filter: 'all' } });
    }
    this.tutorialService.nextStep();
  }

  previousStep(): void {
    this.tutorialService.previousStep();
  }

  skipTutorial(): void {
    // Clean up URL if skipping during cart-favorites step
    const currentStep = this.tutorialService.getCurrentStep();
    if (currentStep && currentStep.id === 'cart-favorites') {
      this.router.navigate(['/research'], { queryParams: { filter: 'all' } });
    }
    this.tutorialService.skipTutorial();
  }

  disableTutorialPermanently(): void {
    this.tutorialService.disableTutorialPermanently();
  }

  getProgressPercentage(): number {
    return this.totalSteps > 0 ? ((this.currentStepIndex + 1) / this.totalSteps) * 100 : 0;
  }

  getRoundedProgressPercentage(): number {
    return Math.round(this.getProgressPercentage());
  }

  isFirstStep(): boolean {
    return this.currentStepIndex === 0;
  }

  isLastStep(): boolean {
    return this.currentStepIndex === this.totalSteps - 1;
  }
}
