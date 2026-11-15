import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-page.component.html',
  styleUrls: ['./auth-page.component.css']
})
export class AuthPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  isRegisterMode = signal<boolean>(false);

  phone = '';
  password = '';
  name = '';
  selectedRole: 'customer' | 'professional' | 'merchant' = 'customer';

  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['tab'] === 'register') {
        this.isRegisterMode.set(true);
      }
      if (['customer', 'professional', 'merchant'].includes(params['role'])) {
        this.selectedRole = params['role'];
      }
    });
  }

  toggleMode(): void {
    this.isRegisterMode.update((v) => !v);
    this.errorMessage.set(null);
  }

  selectRole(role: 'customer' | 'professional' | 'merchant'): void {
    this.selectedRole = role;
  }

  submit(): void {
    this.errorMessage.set(null);

    if (!this.phone || !this.password) {
      this.errorMessage.set('يرجى إدخال رقم الهاتف وكلمة المرور');
      return;
    }

    this.isLoading.set(true);

    if (this.isRegisterMode()) {
      if (!this.name) {
        this.errorMessage.set('يرجى إدخال الاسم كاملاً');
        this.isLoading.set(false);
        return;
      }

      this.authService.register(this.phone, this.password, this.name, this.selectedRole).subscribe({
        next: () => {
          this.isLoading.set(false);
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(err.error?.message || 'فشل في إنشاء الحساب');
        }
      });
    } else {
      this.authService.login(this.phone, this.password).subscribe({
        next: () => {
          this.isLoading.set(false);
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(err.error?.message || 'بيانات الدخول غير صحيحة');
        }
      });
    }
  }
}
