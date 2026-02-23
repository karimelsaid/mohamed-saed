import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSave, faUndo, faPrint, faMoneyBillWave, faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { ModalService } from '../../services/modal.service';

@Component({
  selector: 'app-admin-printing',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './admin-printing.component.html',
  styleUrls: ['./admin-printing.component.css']
})
export class AdminPrintingComponent implements OnInit {
  printingSettings: any = {
    paperPrices: {
      B5: { white: 0.20, yellow: 0.25, creamy: 0.35 },
      A4: { white: 0.30, yellow: 0.40, creamy: 0.50 },
      A5: { white: 0.15, yellow: 0.20, creamy: 0.25 }
    },
    coverPrices: {
      soft: 25.0,
      hard: 60.0,
      luxuryLeather: 100.0
    },
    printColorPrices: {
      blackAndWhite: 0.40,
      color: 0.90
    }
  };

  isSaving = false;
  isLoading = true;

  // Icons
  faSave = faSave;
  faUndo = faUndo;
  faPrint = faPrint;
  faMoneyBillWave = faMoneyBillWave;
  faLayerGroup = faLayerGroup;

  constructor(
    private adminService: AdminService,
    private modalService: ModalService
  ) { }

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    this.isLoading = true;
    this.adminService.getSystemSettings().subscribe({
      next: (settings) => {
        if (settings && settings.printing) {
          // Merge loaded settings with defaults to ensure new fields like A5 exist
          this.printingSettings = {
            ...this.printingSettings,
            ...settings.printing,
            paperPrices: {
              ...this.printingSettings.paperPrices,
              ...settings.printing.paperPrices
            },
            coverPrices: {
              ...this.printingSettings.coverPrices,
              ...settings.printing.coverPrices
            },
            printColorPrices: {
              ...this.printingSettings.printColorPrices,
              ...settings.printing.printColorPrices
            }
          };
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading printing settings:', err);
        this.modalService.showError('فشل تحميل إعدادات الطباعة', 'خطأ في تحميل الإعدادات');
        this.isLoading = false;
      }
    });
  }

  saveSettings() {
    this.isSaving = true;
    this.adminService.updateSystemSettings({ printing: this.printingSettings }).subscribe({
      next: () => {
        this.modalService.showSuccess('تم تحديث أسعار الطباعة بنجاح', 'تم الحفظ بنجاح');
        this.isSaving = false;
      },
      error: (err) => {
        console.error('Error saving printing settings:', err);
        this.modalService.showError('فشل حفظ إعدادات الطباعة', 'خطأ في الحفظ');
        this.isSaving = false;
      }
    });
  }

  resetSettings() {
    this.loadSettings();
  }
}

