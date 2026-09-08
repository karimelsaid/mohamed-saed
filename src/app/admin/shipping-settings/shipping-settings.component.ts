import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-shipping-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shipping-settings.component.html',
  styleUrls: ['./shipping-settings.component.css']
})
export class ShippingSettingsComponent implements OnInit {
  settings: any = {
    activeCarrier: 'none',
    bosta: { apiKey: '', isTestMode: true },
    aramex: { 
      userName: '', 
      password: '', 
      accountNumber: '', 
      accountPin: '', 
      accountEntity: '', 
      accountCountryCode: '', 
      isTestMode: true 
    },
    mylerz: { username: '', password: '', isTestMode: true },
    jnt: { customerCode: '', apiAccount: '', apiPassword: '', isTestMode: true },
    shipblu: { apiKey: '', isTestMode: true },
    sprint: { apiKey: '', isTestMode: true }
  };
  loading = false;
  message = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings() {
    this.loading = true;
    this.http.get(`${environment.apiBaseUrl}/shipping-settings`).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.settings = res.data;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
      }
    });
  }

  saveSettings() {
    this.loading = true;
    this.http.post(`${environment.apiBaseUrl}/shipping-settings`, this.settings).subscribe({
      next: (res: any) => {
        this.message = 'تم حفظ الإعدادات بنجاح';
        setTimeout(() => this.message = '', 3000);
        this.loading = false;
      },
      error: (err) => {
        this.message = 'فشل حفظ الإعدادات';
        this.loading = false;
      }
    });
  }
}
