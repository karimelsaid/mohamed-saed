import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faArrowRight, faSignInAlt, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../../auth/auth.service';

@Component({
    selector: 'app-mushaf-login',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule, RouterLink],
    template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 rtl" dir="rtl">
        <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-lg border-t-4 border-emerald-600 relative">
            <!-- Back Button -->
            <button (click)="goBack()" class="absolute top-4 right-4 text-gray-400 hover:text-emerald-600 transition-colors" title="رجوع">
                 <fa-icon [icon]="faArrowRight" size="lg"></fa-icon>
            </button>

            <div class="mb-8 text-center pt-4">
                <!-- Mushaf Icon -->
                <img src="mushaf-wird.png" alt="المصحف" class="w-24 h-24 mx-auto mb-4 drop-shadow-md">
                <h2 class="text-3xl font-bold text-gray-900 font-kufi mb-2">تسجيل الدخول</h2>
                <p class="text-gray-600">أهلاً بك في رحلة القرآن</p>
            </div>

            <form class="mt-8 space-y-6" (ngSubmit)="onLogin()">
                <div class="rounded-md shadow-sm space-y-4">
                    <div>
                        <label for="email-address" class="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                        <input id="email-address" name="email" type="email" autocomplete="email" required
                            [(ngModel)]="email"
                            class="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 focus:z-10 sm:text-sm"
                            placeholder="example@gmail.com">
                    </div>
                    <div>
                        <label for="password" class="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
                        <input id="password" name="password" type="password" autocomplete="current-password" required
                            [(ngModel)]="password"
                            class="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 focus:z-10 sm:text-sm"
                            placeholder="••••••••">
                    </div>
                </div>

                <div class="flex items-center justify-between">
                    <div class="text-sm">
                        <a href="javascript:void(0)" class="font-medium text-emerald-600 hover:text-emerald-500">
                            نسيت كلمة المرور؟
                        </a>
                    </div>
                </div>

                <div>
                    <button type="submit" [disabled]="isLoading"
                        class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors shadow-md disabled:opacity-70 disabled:cursor-not-allowed">
                        <span class="absolute left-0 inset-y-0 flex items-center pl-3" *ngIf="isLoading">
                            <fa-icon [icon]="faSpinner" [class.fa-spin]="true"></fa-icon>
                        </span>
                        <span class="absolute left-0 inset-y-0 flex items-center pl-3" *ngIf="!isLoading">
                            <fa-icon [icon]="faSignInAlt"></fa-icon>
                        </span>
                        {{ isLoading ? 'جاري الدخول...' : 'تسجيل الدخول' }}
                    </button>
                    
                    <p class="mt-4 text-center text-sm text-gray-600">
                        ليس لديك حساب؟ 
                        <a routerLink="/register" class="font-medium text-emerald-600 hover:text-emerald-500">
                            إنشاء حساب جديد
                        </a>
                    </p>
                </div>

                <div *ngIf="message" class="p-3 rounded-lg text-sm text-center font-medium" 
                     [ngClass]="message.includes('نجح') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                    {{ message }}
                </div>
            </form>
        </div>
    </div>
    `
})
export class MushafLoginComponent {
    email = '';
    password = '';
    message = '';
    isLoading = false;
    faArrowRight = faArrowRight;
    faSignInAlt = faSignInAlt;
    faSpinner = faSpinner;

    constructor(
        private authService: AuthService,
        private router: Router,
        private location: Location
    ) { }

    goBack() {
        if (window.history.length > 1) {
            this.location.back();
        } else {
            this.router.navigate(['/']);
        }
    }

    onLogin() {
        if (!this.email || !this.password) {
            this.message = '❌ البريد الإلكتروني وكلمة المرور مطلوبان';
            return;
        }

        this.isLoading = true;
        this.message = '';

        this.authService.login(this.email, this.password).subscribe({
            next: (response: any) => {
                this.isLoading = false;
                this.message = '✅ تم تسجيل الدخول بنجاح! جاري التوجيه...';

                // Redirection already handled by AuthService tap ( setUser )
                // But we add a safety timeout here for UI transition
                setTimeout(() => {
                    const currentUrl = this.router.url;
                    if (currentUrl.includes('returnUrl=')) {
                        const returnUrl = currentUrl.split('returnUrl=')[1].split('&')[0];
                        this.router.navigateByUrl(decodeURIComponent(returnUrl));
                    } else {
                        this.router.navigate(['/']);
                    }
                }, 1000);
            },
            error: (err: any) => {
                this.isLoading = false;
                console.error('Login error:', err);
                this.message = err.error?.message || '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة';
            }
        });
    }
}
