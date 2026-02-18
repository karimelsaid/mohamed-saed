import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faArrowRight, faUserPlus, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../../auth/auth.service';

@Component({
    selector: 'app-mushaf-register',
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
                <h2 class="text-3xl font-bold text-gray-900 font-kufi mb-2">إنشاء حساب جديد</h2>
                <p class="text-gray-600">انضم لمجتمع حفظة القرآن</p>
            </div>

            <form class="mt-8 space-y-6" (ngSubmit)="onRegister()">
                <div class="rounded-md shadow-sm space-y-4">
                    <!-- Name -->
                    <div>
                        <label for="username" class="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
                        <input id="username" name="username" type="text" required
                            [(ngModel)]="user.username"
                            class="appearance-none block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                            placeholder="الاسم الكامل">
                    </div>

                    <!-- Email -->
                    <div>
                        <label for="email-address" class="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                        <input id="email-address" name="email" type="email" autocomplete="email" required
                            [(ngModel)]="user.email"
                            class="appearance-none block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                            placeholder="example@gmail.com">
                    </div>

                    <!-- Phone -->
                    <div>
                        <label for="phone" class="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                        <input id="phone" name="phone" type="tel" autocomplete="tel" required
                            [(ngModel)]="user.phone"
                            class="appearance-none block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                            placeholder="01xxxxxxxxx">
                    </div>

                    <!-- Gender -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">الجنس</label>
                        <div class="flex gap-4">
                            <label class="flex-1 cursor-pointer">
                                <input type="radio" name="gender" value="male" [(ngModel)]="user.gender" class="sr-only peer">
                                <div class="p-3 text-center border rounded-lg peer-checked:bg-emerald-50 peer-checked:border-emerald-500 peer-checked:text-emerald-700 hover:bg-gray-50 transition-colors">
                                    ذكر
                                </div>
                            </label>
                            <label class="flex-1 cursor-pointer">
                                <input type="radio" name="gender" value="female" [(ngModel)]="user.gender" class="sr-only peer">
                                <div class="p-3 text-center border rounded-lg peer-checked:bg-emerald-50 peer-checked:border-emerald-500 peer-checked:text-emerald-700 hover:bg-gray-50 transition-colors">
                                    أنثى
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- Password -->
                    <div>
                        <label for="password" class="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
                        <input id="password" name="password" type="password" autocomplete="new-password" required
                            [(ngModel)]="user.password"
                            class="appearance-none block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                            placeholder="كلمة مرور قوية">
                    </div>
                </div>

                <div>
                    <button type="submit" [disabled]="isLoading"
                        class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors shadow-md disabled:opacity-70 disabled:cursor-not-allowed">
                        <span class="absolute left-0 inset-y-0 flex items-center pl-3" *ngIf="isLoading">
                            <fa-icon [icon]="faSpinner" [class.fa-spin]="true"></fa-icon>
                        </span>
                        <span class="absolute left-0 inset-y-0 flex items-center pl-3" *ngIf="!isLoading">
                            <fa-icon [icon]="faUserPlus"></fa-icon>
                        </span>
                        {{ isLoading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب' }}
                    </button>

                    <p class="mt-4 text-center text-sm text-gray-600">
                        لديك حساب بالفعل؟ 
                        <a routerLink="/login" class="font-medium text-emerald-600 hover:text-emerald-500">
                            تسجيل الدخول
                        </a>
                    </p>
                </div>

                <div *ngIf="message" class="p-3 rounded-lg text-sm text-center font-medium transition-all duration-300"
                     [class.opacity-0]="!message"
                     [ngClass]="message.includes('نجح') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                    {{ message }}
                </div>
            </form>
        </div>
    </div>
    `
})
export class MushafRegisterComponent {
    user = {
        username: '',
        email: '',
        phone: '',
        password: '',
        gender: ''
    };

    message = '';
    isLoading = false;
    faArrowRight = faArrowRight;
    faUserPlus = faUserPlus;
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

    onRegister() {
        if (!this.user.username || !this.user.email || !this.user.password || !this.user.phone || !this.user.gender) {
            this.message = '❌ جميع الحقول مطلوبة، بما في ذلك النوع';
            return;
        }

        this.isLoading = true;
        this.message = '';

        this.authService.createAccount(
            this.user.username,
            this.user.email,
            this.user.password,
            this.user.phone,
            '', // governorate
            '', // city
            '', // village
            this.user.gender
        ).subscribe({
            next: (response: any) => {
                this.message = '✅ تم إنشاء الحساب بنجاح! جاري التوجيه...';
                // Auto login might be needed if creating account doesn't auto login, 
                // but usually createAccount returns token or we redirect to login.
                // Based on auth service, createAccount returns token.
                if (response.user && response.user.token) {
                    const userWithToken = { ...response.user, token: response.user.token };
                    this.authService.setUser(userWithToken);
                }

                setTimeout(() => {
                    this.router.navigate(['/']);
                }, 1000);
            },
            error: (err: any) => {
                this.isLoading = false;
                console.error('Registration error:', err);
                this.message = err.error?.message || '❌ حدث خطأ أثناء إنشاء الحساب. تأكد من صحة البيانات.';
            }
        });
    }
}
