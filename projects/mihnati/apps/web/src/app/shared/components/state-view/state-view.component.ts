import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiPageState, StateMessage } from '../../../core/services/state.service';

@Component({
  selector: 'app-state-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="state-container" [attr.data-state]="state()">
      @switch (state()) {
        @case ('loading') {
          <div class="state-box loading">
            <div class="spinner"></div>
            <h3>{{ message()?.title || 'جاري التحميل...' }}</h3>
          </div>
        }
        @case ('empty') {
          <div class="state-box empty">
            <span class="state-icon">📭</span>
            <h3>{{ message()?.title || 'لا توجد بيانات' }}</h3>
            <p>{{ message()?.description }}</p>
          </div>
        }
        @case ('validation-error') {
          <div class="state-box error">
            <span class="state-icon">⚠️</span>
            <h3>{{ message()?.title || 'خطأ في صحة البيانات' }}</h3>
            <p>{{ message()?.description }}</p>
            @if (message()?.code) { <span class="badge">كود الخطأ: {{ message()?.code }}</span> }
          </div>
        }
        @case ('conflict') {
          <div class="state-box conflict">
            <span class="state-icon">⚡</span>
            <h3>{{ message()?.title || 'تعارض في العملية' }}</h3>
            <p>{{ message()?.description }}</p>
          </div>
        }
        @case ('unauthorized') {
          <div class="state-box unauthorized">
            <span class="state-icon">🔒</span>
            <h3>{{ message()?.title || 'غير مصرح بالدخول' }}</h3>
            <p>{{ message()?.description }}</p>
          </div>
        }
        @case ('not-found') {
          <div class="state-box not-found">
            <span class="state-icon">🔍</span>
            <h3>{{ message()?.title || 'العنصر غير موجود' }}</h3>
            <p>{{ message()?.description }}</p>
          </div>
        }
        @case ('unavailable') {
          <div class="state-box unavailable">
            <span class="state-icon">📡</span>
            <h3>{{ message()?.title || 'الخدمة غير متوفرة حالياً' }}</h3>
            <p>{{ message()?.description }}</p>
          </div>
        }
        @case ('success') {
          <div class="state-box success">
            <span class="state-icon">✅</span>
            <h3>{{ message()?.title || 'تمت العملية بنجاح' }}</h3>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .state-container {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem;
      min-height: 200px;
    }
    .state-box {
      text-align: center;
      padding: 2rem;
      border-radius: 8px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      max-width: 480px;
      width: 100%;
    }
    .state-icon {
      font-size: 2.5rem;
      display: block;
      margin-bottom: 0.5rem;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }
    .badge {
      display: inline-block;
      margin-top: 0.5rem;
      padding: 0.25rem 0.5rem;
      background: #fee2e2;
      color: #991b1b;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class StateViewComponent {
  state = input.required<UiPageState>();
  message = input<StateMessage | null>(null);
}

