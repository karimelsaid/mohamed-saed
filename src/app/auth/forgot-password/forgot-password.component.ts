import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import emailjs from 'emailjs-com';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgIf } from '@angular/common';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, NgIf]
})
export class ForgotPasswordComponent {
  email: string = '';
  message: string = '';
  error: string = '';
  isSuccess: boolean = false;

  constructor(private http: HttpClient) {}

  onSubmit() {
    this.message = '';
    this.error = '';

    if (!this.email) {
      this.error = 'يرجى إدخال البريد الإلكتروني';
      this.isSuccess = false;
      return;
    }

    // Check if email exists in backend
    this.http.post<any>(`${environment.apiBaseUrl}/users/check-email`, { email: this.email }).subscribe({
      next: (res) => {
        if (res.exists) {
          this.sendResetEmail();
        } else {
          this.error = 'البريد الإلكتروني غير موجود في النظام';
          this.isSuccess = false;
        }
      },
      error: (err) => {
        this.error = 'حدث خطأ أثناء التحقق من البريد الإلكتروني';
        this.isSuccess = false;
      }
    });
  }

  sendResetEmail() {
    const resetLink = `https://kenouz.org/reset-password?email=${encodeURIComponent(this.email)}`;
    const templateParams = {
      email: this.email,
      link: resetLink
    };

    emailjs.send('service_nhof3cj', 'template_3ackqv4', templateParams, 'qyLLy4bgg7V7FupFo')
      .then(() => {
        this.message = 'تم إرسال رسالة إعادة تعيين كلمة المرور إلى بريدك الإلكتروني';
        this.isSuccess = true;
      })
      .catch(() => {
        this.error = 'حدث خطأ أثناء إرسال البريد الإلكتروني';
        this.isSuccess = false;
      });
  }
}
