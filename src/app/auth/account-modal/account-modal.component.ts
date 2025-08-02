import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faUserCircle, faEnvelope, faPhoneAlt, faSignOutAlt, faSignInAlt, faUserPlus, faClipboardList } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../auth.service';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-account-modal',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  templateUrl: './account-modal.component.html',
  styleUrls: ['./account-modal.component.css']
})
export class AccountModalComponent implements OnInit {
  @Output() modalClosed = new EventEmitter<void>();

  faUserCircle = faUserCircle;
  faEnvelope = faEnvelope;
  faPhoneAlt = faPhoneAlt;
  faSignOutAlt = faSignOutAlt;
  faSignInAlt = faSignInAlt;
  faUserPlus = faUserPlus;
  faClipboardList = faClipboardList;

  show = false;
  isLoggedIn: boolean = false;

  user: any = {
    username: '',
    email: '',
    phone: ''
  };

  constructor(private router: Router, private authService: AuthService, private cdRef: ChangeDetectorRef) { }

  ngOnInit() {
    // اسمع لتحديثات تسجيل الدخول
    this.authService.isLoggedIn$.subscribe(status => {
      this.isLoggedIn = status;
    });

    // اسمع لتحديث بيانات المستخدم
    this.authService.user$.subscribe(user => {
      if (user) {
        this.user = user;
      }
    });
  }

  loadUserData(userId: string) {
    if (!userId) {
      this.authService.clearFavoritesAndCart(); // أو أي إجراء مناسب
      return;
    }

    this.authService.loadUserData(userId);
  }

  openModal() {
    this.show = true;
  }

  closeModal() {
    this.show = false;
    this.modalClosed.emit();
  }

  goToLogin() {
    this.closeModal();
    this.router.navigate(['/login']);
  }

  goToRegister() {
    this.closeModal();
    this.router.navigate(['/register']);
  }

  logout() {
    this.authService.logout();
    this.closeModal();
    this.router.navigate(['/']);
  }

  setUserData(userData: { username: string; email: string; phone: string }) {
    localStorage.setItem('user', JSON.stringify(userData));
    this.user = userData;
    this.isLoggedIn = true;
    this.authService.setLoginStatus(true); // تحديث حالة تسجيل الدخول عند إضافة بيانات المستخدم
  }
}
