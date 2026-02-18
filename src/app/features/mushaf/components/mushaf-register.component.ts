import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faUser, faEnvelope, faLock, faPhone, faArrowRight, faCheckCircle, faMars, faVenus } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-mushaf-register',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    template: `
    <div class="min-h-screen bg-gradient-to-b from-emerald-50 to-white dark:from-gray-900 dark:to-gray-800 pt-8 pb-12 px-4 rtl" dir="rtl">
      <div class="max-w-md mx-auto relative z-10">

        <!-- Back Button -->
        <button (click)="goBack()"
          class="mb-6 flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-emerald-600 transition-colors group">
          <fa-icon [icon]="faArrowRight" class="group-hover:translate-x-1 transition-transform"></fa-icon>
          <span class="font-medium">رجوع للمصحف</span>
        </button>

        <!-- Header -->
        <div class="text-center mb-8">
          <div class="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
            <span class="text-3xl text-white">📖</span>
          </div>
          <h2 class="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">إنشاء حساب جديد</h2>
          <p class="text-gray-500 dark:text-gray-400 text-sm">انضم لمجتمع مصحف وِرد</p>
        </div>

        <!-- Card -->
        <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-emerald-100 dark:border-gray-700 p-8">

          <!-- Message -->
          <div *ngIf="message" class="mb-6 p-4 rounded-xl text-center text-sm font-bold"
            [ngClass]="message.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'">
            {{ message }}
          </div>

          <form (ngSubmit)="onRegister()" class="space-y-5">

            <!-- Name -->
            <div class="relative">
              <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-400">
                <fa-icon [icon]="faUser"></fa-icon>
              </div>
              <input type="text" [(ngModel)]="user.username" name="username" required placeholder="الاسم الكامل"
                class="w-full pr-11 pl-4 py-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none dark:text-white">
            </div>

            <!-- Email -->
            <div class="relative">
              <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-400">
                <fa-icon [icon]="faEnvelope"></fa-icon>
              </div>
              <input type="email" [(ngModel)]="user.email" name="email" required placeholder="البريد الإلكتروني"
                class="w-full pr-11 pl-4 py-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none dark:text-white">
            </div>

            <!-- Phone -->
            <div class="relative">
              <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-400">
                <fa-icon [icon]="faPhone"></fa-icon>
              </div>
              <input type="tel" [(ngModel)]="user.phone" name="phone" required placeholder="رقم الهاتف (01xxxxxxxxx)"
                class="w-full pr-11 pl-4 py-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none dark:text-white">
            </div>

            <!-- Gender Selection -->
            <div class="space-y-2">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">تحديد الجنس (إلزامي للخصوصية في الحلقات)</label>
              <div class="grid grid-cols-2 gap-4">
                <button type="button" (click)="user.gender = 'male'"
                  [ngClass]="user.gender === 'male' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'"
                  class="flex items-center justify-center gap-2 py-3 px-4 rounded-xl transition-all duration-200 font-bold">
                  <fa-icon [icon]="faMars" class="text-xl"></fa-icon>
                  <span>ذكر</span>
                </button>
                <button type="button" (click)="user.gender = 'female'"
                  [ngClass]="user.gender === 'female' ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/30' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'"
                  class="flex items-center justify-center gap-2 py-3 px-4 rounded-xl transition-all duration-200 font-bold">
                  <fa-icon [icon]="faVenus" class="text-xl"></fa-icon>
                  <span>أنثى</span>
                </button>
              </div>
            </div>

            <!-- Password -->
            <div class="relative">
              <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-400">
                <fa-icon [icon]="faLock"></fa-icon>
              </div>
              <input type="password" [(ngModel)]="user.password" name="password" required minlength="8" placeholder="كلمة المرور (8 أحرف على الأقل)"
                class="w-full pr-11 pl-4 py-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none dark:text-white">
            </div>

            <!-- Confirm Password -->
            <div class="relative">
              <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-400">
                <fa-icon [icon]="faCheckCircle"></fa-icon>
              </div>
              <input type="password" [(ngModel)]="confirmPassword" name="confirmPassword" required placeholder="تأكيد كلمة المرور"
                class="w-full pr-11 pl-4 py-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none dark:text-white">
            </div>

            <p *ngIf="user.password && confirmPassword && user.password !== confirmPassword" class="text-xs text-red-500">كلمتا المرور غير متطابقتين.</p>

            <button type="submit" [disabled]="!isFormValid"
              class="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/30 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
              إنشاء حساب
            </button>
          </form>

          <!-- Footer -->
          <div class="mt-6 text-center border-t border-gray-100 dark:border-gray-700 pt-6">
            <p class="text-gray-600 dark:text-gray-400 text-sm">
              لديك حساب بالفعل؟
              <a (click)="navigateToLogin()" class="text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer">سجل دخولك</a>
            </p>
          </div>
        </div>
      </div>
    </div>
    `
})
export class MushafRegisterComponent {
    faUser = faUser;
    faEnvelope = faEnvelope;
    faLock = faLock;
    faPhone = faPhone;
    faArrowRight = faArrowRight;
    faCheckCircle = faCheckCircle;
    faMars = faMars;
    faVenus = faVenus;

    user = {
        username: '',
        email: '',
        phone: '',
        password: '',
        gender: ''
    };
    confirmPassword = '';
    message = '';

    get isFormValid(): boolean {
        return !!(this.user.username && this.user.email && this.user.phone &&
            this.user.password && this.user.password.length >= 8 &&
            this.user.gender && this.user.password === this.confirmPassword);
    }

    constructor(
        private authService: AuthService,
        private router: Router,
        private location: Location
    ) { }

    onRegister() {
        if (!this.isFormValid) {
            this.message = '❌ يرجى ملء جميع الحقول بشكل صحيح';
            return;
        }

        this.authService.createAccount(
            this.user.username,
            this.user.email,
            this.user.password,
            this.user.phone,
            '',  // governorate - not needed for Mushaf
            '',  // city - not needed for Mushaf
            '',  // village - not needed for Mushaf
            this.user.gender
        ).subscribe({
            next: (response: any) => {
                this.message = '✅ تم إنشاء الحساب بنجاح! جاري التوجيه...';
                setTimeout(() => {
                    this.router.navigate(['/']);
                }, 1000);
            },
            error: (err: any) => {
                console.error('Registration error:', err);
                this.message = err.error?.message || '❌ حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة لاحقًا.';
            }
        });
    }

    navigateToLogin() {
        this.router.navigate(['/login']);
    }

    goBack() {
        this.location.back();
    }
}
