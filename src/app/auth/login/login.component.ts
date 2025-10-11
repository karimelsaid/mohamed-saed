import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { environment } from '../../../environments/environment';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';

import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, AfterViewInit {
  email: string = '';
  password: string = '';
  message: string = '';
  isSuccess: boolean = false;
  isAndroid = Capacitor.getPlatform() === 'android';
  private returnUrl: string = '/';

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
    private merchantAuthService: MerchantAuthService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // اقرأ returnUrl من الرابط
    this.route.queryParams.subscribe(params => {
      // إذا كان returnUrl هو صفحة تسجيل الدخول نفسها، وجه للصفحة الرئيسية
      this.returnUrl = params['returnUrl'] && !params['returnUrl'].includes('/login') ? params['returnUrl'] : '/';
    });

    if (this.isAndroid) {
      GoogleAuth.initialize({
        clientId: environment.androidGoogleClientId,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      });
    }
  }

  ngAfterViewInit() {
    if (!this.isAndroid) {
      this.loadGoogleScript();
    }
  }

  navigateToForgotPassword() {
    this.router.navigate(['/forgot-password']).then(success => {
      if (!success) {
        console.error('Navigation to forgot-password failed');
      }
    });
  }

  async googleSignIn() {
    if (this.isAndroid) {
      try {
        const result = await GoogleAuth.signIn();
        const idToken = result.authentication.idToken;
        this.authService.googleSignIn(idToken).subscribe({
          next: (user) => {
            this.message = '✅ تم تسجيل الدخول بنجاح! جارِ توجيهك...';
            this.router.navigateByUrl(this.returnUrl);
          },
          error: (error) => {
            if (error.status === 400 && error.error.message) {
              this.message = `❌ ${error.error.message}`;
            } else {
              this.message = '❌ فشل تسجيل الدخول باستخدام حساب Google. يرجى المحاولة مرة أخرى.';
            }
            console.error('Google sign-in error:', error);
          }
        });
      } catch (error) {
        this.message = '❌ فشل تسجيل الدخول باستخدام حساب Google. يرجى المحاولة مرة أخرى.';
        console.error('Google sign-in error:', error);
      }
    } else {
      // For web, the button click will trigger the web flow, but since we have the div, it's handled by Google script
    }
  }

  loadGoogleScript() {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => this.initializeGoogleSignIn();
    document.body.appendChild(script);
  }

  initializeGoogleSignIn() {
    // @ts-ignore
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: any) => this.handleGoogleCredentialResponse(response)
    });
    // @ts-ignore
    google.accounts.id.renderButton(
      document.getElementById('googleSignInDiv'),
      { theme: 'outline', size: 'large' }
    );
  }

  handleGoogleCredentialResponse(response: any) {
    const idToken = response.credential;
    this.authService.googleSignIn(idToken).subscribe({
      next: (user) => {
        this.message = '✅ تم تسجيل الدخول بنجاح! جارِ توجيهك...';
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (error) => {
        this.message = '❌ فشل تسجيل الدخول باستخدام حساب Google. يرجى المحاولة مرة أخرى.';
        console.error('Google sign-in error:', error);
      }
    });
  }

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

          if (response.user.role === 'merchant') {
            // For merchants, call the merchant login API to get token
            this.merchantAuthService.login(this.email, this.password).subscribe({
              next: (merchantResponse: any) => {
                // Set both regular auth service and merchant auth service
                const merchantUser = {
                  id: merchantResponse.merchant._id,
                  email: merchantResponse.merchant.email,
                  role: 'merchant',
                  username: merchantResponse.merchant.name,
                  phone: merchantResponse.merchant.phone
                };
                localStorage.setItem('user', JSON.stringify(merchantUser));
                this.authService.setLoginStatus(true);
                this.authService.setUser(merchantUser);

                this.message = '✅ تم تسجيل الدخول كتاجر بنجاح';
                this.isSuccess = true;
                // Redirect after successful login
                setTimeout(() => {
                  this.router.navigateByUrl(this.returnUrl);
                }, 1000);
              },
              error: (err: any) => {
                console.error('Merchant login error:', err);
                this.message = '❌ حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.';
                this.isSuccess = false;
              }
            });
          } else {
            localStorage.setItem('user', JSON.stringify(response.user));
            this.authService.setLoginStatus(true);
            this.authService.setUser(response.user);

            setTimeout(() => {
              // If returnUrl is the default, check for admin role, otherwise respect returnUrl
              if (this.returnUrl === '/' && response.user.role === 'admin') {
                this.router.navigate(['/ControlPanel']);
              } else {
                this.router.navigateByUrl(this.returnUrl);
              }
            }, 1000);
          }
        } else {
          this.message = '❌ حدث خطأ أثناء تسجيل الدخول';
          this.isSuccess = false;
        }
      },
      error: (err) => {
        console.error(err);
        this.message = err.error?.message || '❌ حدث خطأ أثناء تسجيل الدخول';
        this.isSuccess = false;
      }
    });
  }
}
