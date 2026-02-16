import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-subscription-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './subscription-settings.component.html',
    styles: [`
    :host {
      display: block;
    }
  `]
})
export class SubscriptionSettingsComponent implements OnInit {
    subscriptionSettings = {
        monthlyPrice: 50,
        yearlyPrice: 500
    };

    isLoading = false;
    isSaving = false;
    successMessage: string | null = null;
    errorMessage: string | null = null;

    constructor(private adminService: AdminService) {
        library.add(fas);
    }

    ngOnInit(): void {
        this.loadSettings();
    }

    loadSettings(): void {
        this.isLoading = true;
        this.adminService.getSystemSettings().subscribe({
            next: (settings) => {
                this.isLoading = false;
                if (settings && settings.subscription) {
                    this.subscriptionSettings = { ...settings.subscription };
                }
            },
            error: (err) => {
                this.isLoading = false;
                console.error('Error loading settings', err);
                this.errorMessage = 'فشل تحميل الإعدادات';
            }
        });
    }

    saveSettings(): void {
        this.isSaving = true;
        this.successMessage = null;
        this.errorMessage = null;

        const updateData = {
            subscription: this.subscriptionSettings
        };

        this.adminService.updateSystemSettings(updateData).subscribe({
            next: (res) => {
                this.isSaving = false;
                this.successMessage = 'تم حفظ الأسعار بنجاح';
                setTimeout(() => this.successMessage = null, 3000);
            },
            error: (err) => {
                this.isSaving = false;
                console.error('Error saving settings', err);
                this.errorMessage = 'فشل حفظ الإعدادات';
            }
        });
    }
}
