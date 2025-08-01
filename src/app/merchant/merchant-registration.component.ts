import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-merchant-registration',
  standalone: true,
  imports: [FormsModule,CommonModule, NgClass],
  templateUrl: './merchant-registration.component.html',
  styleUrls: ['./merchant-registration.component.css']
})
export class MerchantRegistrationComponent {
  name: string = '';
  email: string = '';
  selectedFile: File | null = null;
  imageError: string | null = null;
  uploading: boolean = false;
  uploadSuccess: boolean = false;
  uploadError: string | null = null;

  readonly MAX_IMAGE_SIZE_BYTES = 1024 * 1024; // 1 MB

  constructor(private http: HttpClient) {}

  onFileSelected(event: Event): void {
    this.imageError = null;
    const input = event.target as HTMLInputElement | null;
    if (input && input.files && input.files.length > 0) {
      const file = input.files[0];
      const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
      if (!validImageTypes.includes(file.type)) {
        this.imageError = 'يرجى تحميل ملف صورة صالح (JPEG, PNG, GIF, WEBP, BMP, SVG).';
        this.selectedFile = null;
      } else if (file.size > this.MAX_IMAGE_SIZE_BYTES) {
        this.imageError = `حجم الصورة أكبر من 1 ميجابايت. يرجى تحميل صورة أصغر.`;
        this.selectedFile = null;
      } else {
        this.selectedFile = file;
      }
    } else {
      this.selectedFile = null;
    }
  }

  submitRegistration(): void {
    this.uploadError = null;
    if (!this.name || !this.email) {
      alert('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }
    if (!this.selectedFile) {
      alert('يرجى اختيار صورة الشعار.');
      return;
    }

    const formData = new FormData();
    formData.append('name', this.name);
    formData.append('email', this.email);
    formData.append('logo', this.selectedFile);

    this.uploading = true;
    this.uploadSuccess = false;

    this.http.post(`${environment.apiBaseUrl}/merchant/register`, formData).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.uploadSuccess = true;
          alert('تم تسجيل التاجر بنجاح. في انتظار موافقة الأدمن.');
          this.name = '';
          this.email = '';
          this.selectedFile = null;
        } else {
          this.uploadError = response.message || 'حدث خطأ أثناء التسجيل.';
          alert(this.uploadError);
        }
        this.uploading = false;
      },
      error: (error) => {
        this.uploadError = 'حدث خطأ أثناء التسجيل.';
        alert(this.uploadError);
        this.uploading = false;
      }
    });
  }
}
