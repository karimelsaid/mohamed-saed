import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgIf } from '@angular/common';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, NgIf]
})
export class ResetPasswordComponent {
  newPassword: string = '';
  confirmPassword: string = '';
  message: string = '';
  error: string = '';
  email: string = '';

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
    });
  }

  onSubmit() {
    this.message = '';
    this.error = '';

    if (!this.newPassword || !this.confirmPassword) {
      this.error = 'يرجى ملء جميع الحقول';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'كلمتا المرور غير متطابقتين';
      return;
    }

    // Call backend API to update password
    this.http.put<any>(`${environment.apiBaseUrl}/users/reset-password`, {
      email: this.email,
      newPassword: this.newPassword
    }).subscribe({
      next: (res) => {
        this.message = 'تم تحديث كلمة المرور بنجاح';
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 3000);
      },
      error: (err) => {
        this.error = 'حدث خطأ أثناء تحديث كلمة المرور';
      }
    });
  }
}
