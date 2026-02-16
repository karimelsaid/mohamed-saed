import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ModalConfig {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  action?: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private modalSubject = new Subject<ModalConfig>();
  public modal$ = this.modalSubject.asObservable();

  openModal(config: ModalConfig): void {
    this.modalSubject.next(config);
  }

  showSuccess(message: string, title: string = 'نجح العملية'): void {
    this.openModal({
      title,
      message,
      type: 'success',
      confirmText: 'موافق',
      showCancel: false
    });
  }

  showError(message: string, title: string = 'خطأ'): void {
    this.openModal({
      title,
      message,
      type: 'error',
      confirmText: 'موافق',
      showCancel: false
    });
  }

  showInfo(title: string, message: string): void {
    this.openModal({
      title,
      message,
      type: 'info',
      confirmText: 'موافق',
      showCancel: false
    });
  }

  showWarning(title: string, message: string, action?: () => void): void {
    this.openModal({
      title,
      message,
      type: 'warning',
      confirmText: 'تأكيد',
      cancelText: 'إلغاء',
      showCancel: true,
      action
    });
  }
}
