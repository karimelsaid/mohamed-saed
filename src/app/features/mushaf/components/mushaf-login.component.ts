import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../auth/auth.service';
import { environment } from '../../../../environments/environment';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faEnvelope, faLock, faArrowRight } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-mushaf-login',
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
          <h2 class="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">تسجيل الدخول</h2>
          <p class="text-gray-500 dark:text-gray-400 text-sm">سجل دخولك للوصول إلى المجتمع والحلقات</p>
        </div>

        <!-- Card -->
        <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-emerald-100 dark:border-gray-700 p-8">

          <!-- Message -->
          <div *ngIf="message" class="mb-6 p-4 rounded-xl text-center text-sm font-bold"
            [ngClass]="isSuccess ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'">
            {{ message }}
          </div>

          <form (submit)="onLogin(); $event.preventDefault()" class="space-y-5">
            <!-- Email -->
            <div class="relative">
              <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-400">
                <fa-icon [icon]="faEnvelope"></fa-icon>
              </div>
              <input type="email" [(ngModel)]="email" name="email" required placeholder="البريد الإلكتروني"
                class="w-full pr-11 pl-4 py-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none dark:text-white">
            </div>

            <!-- Password -->
            <div class="relative">
              <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-400">
                <fa-icon [icon]="faLock"></fa-icon>
              </div>
              <input type="password" [(ngModel)]="password" name="password" required placeholder="كلمة المرور"
                class="w-full pr-11 pl-4 py-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none dark:text-white">
            </div>

            <button type="submit"
              class="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/30 transition-all transform hover:-translate-y-0.5">
              تسجيل الدخول
            </button>
          </form>

          <!-- Footer -->
          <div class="mt-6 text-center border-t border-gray-100 dark:border-gray-700 pt-6">
            <p class="text-gray-600 dark:text-gray-400 text-sm">
              ليس لديك حساب؟
              <a (click)="navigateToRegister()" class="text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer">إنشاء حساب</a>
            </p>
          </div>
        </div>
      </div>
    </div>
    `
})
export class MushafLoginComponent implements OnInit {
    faEnvelope = faEnvelope;
    faLock = faLock;
    faArrowRight = faArrowRight;

    email = '';
    password = '';
    message = '';
    isSuccess = false;

    constructor(
        private router: Router,
        private http: HttpClient,
        private authService: AuthService,
        private location: Location
    ) { }

    ngOnInit() { }

    onLogin() {
        if (!this.email || !this.password) {
            this.message = '❌ من فضلك أدخل البريد الإلكتروني وكلمة المرور';
            this.isSuccess = false;
            return;
        }

        this.http.post<any>(`${environment.apiBaseUrl}/users/login`, {
            email: this.email,
            password: this.password
        }).subscribe({
            next: (response) => {
                if (response && response.user) {
                    this.message = '✅ تم تسجيل الدخول بنجاح';
                    this.isSuccess = true;

                    // Normalize ID
                    if (!response.user.id && response.user._id) {
                        response.user.id = response.user._id;
                    }
                    const userWithToken = { ...response.user };
                    if (response.token) {
                        userWithToken.token = response.token;
                    }
                    this.authService.setUser(userWithToken);

                    setTimeout(() => {
                        this.router.navigate(['/']);
                    }, 800);
                }
            },
            error: (err) => {
                console.error(err);
                this.message = err.error?.message || '❌ حدث خطأ أثناء تسجيل الدخول';
                this.isSuccess = false;
            }
        });
    }

    navigateToRegister() {
        this.router.navigate(['/register']);
    }

    goBack() {
        this.location.back();
    }
}
