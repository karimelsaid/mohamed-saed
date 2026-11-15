import { Injectable, signal } from '@angular/core';

export type UiPageState =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'validation-error'
  | 'conflict'
  | 'unauthorized'
  | 'not-found'
  | 'unavailable';

export interface StateMessage {
  title: string;
  description: string;
  code?: string;
  actionLabel?: string;
}

@Injectable({
  providedIn: 'root'
})
export class StateService {
  readonly currentState = signal<UiPageState>('idle');
  readonly stateMessage = signal<StateMessage | null>(null);

  setLoading(message = 'جاري التحميل...'): void {
    this.currentState.set('loading');
    this.stateMessage.set({ title: message, description: '' });
  }

  setSuccess(): void {
    this.currentState.set('success');
    this.stateMessage.set(null);
  }

  setEmpty(title = 'لا توجد بيانات حالياً', description = 'لم يتم العثور على أي نتائج في الوقت الحالي.'): void {
    this.currentState.set('empty');
    this.stateMessage.set({ title, description });
  }

  setError(code: string, message: string, description = ''): void {
    let state: UiPageState = 'unavailable';
    if (code === 'VALIDATION_ERROR') state = 'validation-error';
    else if (code === 'CONFLICT' || code === 'INVALID_TRANSITION' || code === 'STALE_VERSION') state = 'conflict';
    else if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') state = 'unauthorized';
    else if (code === 'NOT_FOUND') state = 'not-found';

    this.currentState.set(state);
    this.stateMessage.set({
      title: message,
      description,
      code
    });
  }

  reset(): void {
    this.currentState.set('idle');
    this.stateMessage.set(null);
  }
}

