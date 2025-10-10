// Angular Core
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

// RxJS
import { take } from 'rxjs/operators';

// App-specific
import { AuthService } from '../auth.service';
import { User } from '../user.model';
import { environment } from '../../../environments/environment';
import governoratesData from '../../../../public/json/egypt-governorates.json';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit {
  profileForm: FormGroup;
  isLoading = true;
  isSubmitting = false;
  user: User | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  isEditingAddress = false;
  governorates: any[] = governoratesData.governorates;
  cities: string[] = [];
  phoneValid = false;
  phoneTouched = false;
  locationValid = false;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {
    this.profileForm = this.fb.group({
      username: ['', Validators.required],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^(010|011|012|015)[0-9]{8}$/)]],
      governorate: [''],
      city: [''],
      village: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.authService.user$.pipe(take(1)).subscribe(user => {
      if (user && user.id) {
        this.user = user;
        this.loadUserProfile(user.id);
      } else {
        this.router.navigate(['/login']);
      }
    });

    this.profileForm.valueChanges.subscribe(() => {
      this.validatePhone();
      this.validateLocation();
    });
  }

  loadUserProfile(userId: string): void {
    this.http.get<any>(`${environment.apiBaseUrl}/users/profile/${userId}`).pipe(take(1)).subscribe({
      next: (data) => {
        this.profileForm.patchValue(data);
        this.isLoading = false;
        this.profileForm.disable(); // ابدأ والفورم معطل
        if (this.profileForm.get('governorate')?.value) {
          // تأكد من أن قيمة المحافظة قد تم تعيينها قبل محاولة تحميل المدن
          this.onGovernorateChange(false); // تحميل المدن بدون إعادة تعيين المدينة
        }
        this.validatePhone();
      },
      error: (err) => {
        this.errorMessage = 'حدث خطأ أثناء تحميل بيانات الملف الشخصي.';
        this.isLoading = false;
        console.error('Error loading user profile:', err);
      }
    });
  }

  onGovernorateChange(resetCity = true) {
    const selectedGovernorate = this.governorates.find(g => g.governorate_name === this.profileForm.get('governorate')?.value);
    this.cities = selectedGovernorate ? selectedGovernorate.cities : [];
    if (resetCity) this.profileForm.get('city')?.setValue('');
    this.validateLocation();
  }

  validatePhone() {
    this.phoneTouched = true;
    const phoneControl = this.profileForm.get('phone');
    this.phoneValid = phoneControl?.valid ?? false;
  }

  validateLocation() {
    const governorate = this.profileForm.get('governorate')?.value;
    const city = this.profileForm.get('city')?.value;
    this.locationValid = !!governorate && !!city;
  }

  toggleEdit(isEditing: boolean): void {
    this.isEditingAddress = isEditing;
    if (isEditing) {
      // Enable all controls except email
      Object.keys(this.profileForm.controls).forEach(controlName => {
        if (controlName !== 'email') {
          this.profileForm.get(controlName)?.enable();
        }
      });
      this.profileForm.get('email')?.disable(); // البريد الإلكتروني يبقى للقراءة فقط
      this.phoneTouched = false;
      this.validatePhone();
      this.validateLocation();
    } else {
      this.profileForm.disable();
      this.successMessage = null;
      this.errorMessage = null;
      // إعادة تحميل البيانات الأصلية عند الإلغاء
      if (this.user?.id) {
        this.loadUserProfile(this.user.id);
      }
    }
  }

  onSubmit(): void {
    if (this.profileForm.invalid || !this.user) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;
    this.successMessage = null;

    const updatedData = this.profileForm.getRawValue();

    this.http.put(`${environment.apiBaseUrl}/users/update-profile/${this.user.id}`, updatedData).subscribe({
      next: (response: any) => {
        this.successMessage = response.message || 'تم تحديث بياناتك بنجاح.';
        // تحديث بيانات المستخدم في AuthService إذا لزم الأمر
        const updatedUser = { ...this.user, ...updatedData };
        this.authService.setUser(updatedUser as User);
        this.isSubmitting = false;
        this.isEditingAddress = false;
        this.profileForm.disable();
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'فشل تحديث البيانات. يرجى المحاولة مرة أخرى.';
        this.isSubmitting = false;
        console.error('Error updating user profile:', err);
      }
    });
  }
}