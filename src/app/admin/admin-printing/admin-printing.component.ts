import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSave, faUndo, faPrint, faMoneyBillWave, faLayerGroup, faTrash, faCircle, faSync, faPlusCircle } from '@fortawesome/free-solid-svg-icons';
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
    paperTypes: [],
    printers: [],
    coverPrices: {
      none: 0,
      soft: 25.0,
      hard: 60.0,
      luxuryLeather: 100.0
    }
  };

  // Internal defaults for when DB is actually empty
  private defaultPaperTypes = [
    { name: 'A4', prices: { white: 0.30, yellow: 0.40, creamy: 0.50 } },
    { name: 'A5', prices: { white: 0.15, yellow: 0.20, creamy: 0.25 } },
    { name: 'B5', prices: { white: 0.20, yellow: 0.25, creamy: 0.35 } }
  ];

  private defaultPrinters = [
    {
      name: 'Default Printer',
      inkPriceColor: 1500,
      inkPriceBW: 500,
      pageYieldColor: 3000,
      pageYieldBW: 5000,
      inkLevels: { black: 100, cyan: 100, magenta: 100, yellow: 100 },
      lastUpdatedPages: 0
    }
  ];

  // Calculator States
  calcInput = {
    selectedPaper: 'A4',
    selectedPaperType: 'white',
    selectedPrinterIndex: 0,
    isColor: false,
    isDoubleSided: false,
    coverType: 'none', // 'none', 'soft', 'hard', 'luxuryLeather'
    pageCount: 1,
    profitMargin: 50 // %
  };

  calcResult: any = {
    paperCost: 0,
    inkCost: 0,
    coverSurcharge: 0,
    totalCost: 0,
    sellingPrice: 0,
    profitValue: 0,
    projectedInk: 100
  };

  isSaving = false;
  isLoading = true;

  // Icons
  faSave = faSave;
  faUndo = faUndo;
  faPrint = faPrint;
  faMoneyBillWave = faMoneyBillWave;
  faLayerGroup = faLayerGroup;
  faTrash = faTrash;
  faCircle = faCircle;
  faSync = faSync;
  faPlusCircle = faPlusCircle;

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
          const dbPrinting = settings.printing;

          // Migration: If paperTypes is empty but old paperPrices exists
          let pTypes = [];
          if ((!dbPrinting.paperTypes || dbPrinting.paperTypes.length === 0) && dbPrinting.paperPrices) {
            for (const name in dbPrinting.paperPrices) {
              pTypes.push({ name: name, prices: dbPrinting.paperPrices[name] });
            }
          } else {
            pTypes = dbPrinting.paperTypes || [];
          }

          // Ensure A5 is present if the list is being initialized or was migrated
          if (pTypes.length > 0 && !pTypes.some((t: any) => t.name === 'A5')) {
            pTypes.push({ name: 'A5', prices: { white: 0.15, yellow: 0.20, creamy: 0.25 } });
          }

          this.printingSettings.paperTypes = pTypes.length > 0 ? pTypes : [...this.defaultPaperTypes];

          // Migration for Printers: If printers is empty but old printColorPrices exists
          if ((!dbPrinting.printers || dbPrinting.printers.length === 0) && dbPrinting.printColorPrices) {
            this.printingSettings.printers = [{
              name: 'Default Printer',
              inkPriceColor: dbPrinting.printColorPrices.color || 0,
              inkPriceBW: dbPrinting.printColorPrices.blackAndWhite || 0,
              pageYieldColor: 100,
              pageYieldBW: 100,
              inkLevels: { black: 100, cyan: 100, magenta: 100, yellow: 100 },
              lastUpdatedPages: 0
            }];
          } else {
            this.printingSettings.printers = (dbPrinting.printers && dbPrinting.printers.length > 0)
              ? dbPrinting.printers
              : [...this.defaultPrinters];
          }

          this.printingSettings.coverPrices = dbPrinting.coverPrices || { soft: 25, hard: 60, luxuryLeather: 100 };
        } else {
          // No settings at all, use hard defaults
          this.printingSettings.paperTypes = [...this.defaultPaperTypes];
          this.printingSettings.printers = [...this.defaultPrinters];
        }
        this.isLoading = false;
        this.calculatePrintCost();
      },
      error: (err) => {
        console.error('Error loading printing settings:', err);
        // Fallback to defaults or show error
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

  // Management Methods
  addPaperType() {
    console.log('Adding paper type...');
    this.printingSettings.paperTypes = [
      ...this.printingSettings.paperTypes,
      {
        name: 'حجم جديد',
        prices: { white: 0, yellow: 0, creamy: 0 }
      }
    ];
    this.calculatePrintCost();
  }

  removePaperType(index: number) {
    console.log('Removing paper type at index:', index);
    this.printingSettings.paperTypes = this.printingSettings.paperTypes.filter((_: any, i: number) => i !== index);
    this.calculatePrintCost();
  }

  addPrinter() {
    console.log('Adding printer...');
    this.printingSettings.printers = [
      ...this.printingSettings.printers,
      {
        name: 'طابعة جديدة',
        inkPriceColor: 1200,
        inkPriceBW: 400,
        pageYieldColor: 3000,
        pageYieldBW: 5000,
        inkLevels: { black: 100, cyan: 100, magenta: 100, yellow: 100 },
        lastUpdatedPages: 0
      }
    ];
    this.calculatePrintCost();
  }

  removePrinter(index: number) {
    console.log('Removing printer at index:', index);
    this.printingSettings.printers = this.printingSettings.printers.filter((_: any, i: number) => i !== index);
    this.calculatePrintCost();
  }

  // Calculator Methods
  calculatePrintCost() {
    if (!this.printingSettings || !this.printingSettings.paperTypes) return;

    // 1. Paper Cost - Treating pageCount as Number of Sheets
    const paper = this.printingSettings.paperTypes.find((p: any) => p.name === this.calcInput.selectedPaper);
    const paperPrice = paper ? (paper.prices[this.calcInput.selectedPaperType] || 0) : 0;

    // In this model, pageCount = number of physical sheets
    this.calcResult.paperCost = paperPrice * this.calcInput.pageCount;

    // 2. Ink Cost - Number of printed faces
    // If double sided, we print twice on each sheet
    const printFaces = this.calcInput.isDoubleSided ? this.calcInput.pageCount * 2 : this.calcInput.pageCount;

    const printer = this.printingSettings.printers[this.calcInput.selectedPrinterIndex];
    if (printer) {
      const yieldValue = this.calcInput.isColor ? (printer.pageYieldColor || 1) : (printer.pageYieldBW || 1);
      const priceValue = this.calcInput.isColor ? (printer.inkPriceColor || 0) : (printer.inkPriceBW || 0);
      const costPerFace = priceValue / yieldValue;

      this.calcResult.inkCost = costPerFace * printFaces;
    } else {
      this.calcResult.inkCost = 0;
    }

    // 3. Cover Base Cost
    const coverPrice = this.printingSettings.coverPrices[this.calcInput.coverType] || 0;

    // 4. Totals
    this.calcResult.totalCost = this.calcResult.paperCost + this.calcResult.inkCost + coverPrice;

    // 5. Selling Price with Profit
    this.calcResult.profitValue = this.calcResult.totalCost * (this.calcInput.profitMargin / 100);
    this.calcResult.sellingPrice = this.calcResult.totalCost + this.calcResult.profitValue;

    // 5. Smart Projection
    if (printer) {
      const yieldValue = this.calcInput.isColor ? (printer.pageYieldColor || 1) : (printer.pageYieldBW || 1);
      const consumption = (printFaces / yieldValue) * 100;

      const currentLevel = this.calcInput.isColor ? printer.inkLevels.cyan : printer.inkLevels.black;
      this.calcResult.projectedInk = Math.max(0, currentLevel - consumption);
    }
  }

  getRemainingPages(printer: any, isColor: boolean): number {
    const yieldValue = isColor ? (printer.pageYieldColor || 0) : (printer.pageYieldBW || 0);
    const level = isColor ?
      Math.min(printer.inkLevels.cyan, printer.inkLevels.magenta, printer.inkLevels.yellow) :
      printer.inkLevels.black;
    return Math.floor((yieldValue * level) / 100);
  }

  syncCounter(printerIndex: number, newTotalPages: number) {
    const printer = this.printingSettings.printers[printerIndex];
    if (!printer || newTotalPages <= printer.lastUpdatedPages) return;

    const delta = newTotalPages - printer.lastUpdatedPages;
    console.log(`Syncing counter for ${printer.name}: ${delta} new pages.`);

    // Estimate consumption (simple equal split for CMY in color mode, or we could ask for coverage)
    // Assume 100% of pages are either color or BW based on printer default or 50/50
    // To be smart, we deduct proportionately. 
    const bwDeduction = (delta / (printer.pageYieldBW || 1)) * 100;
    const colorDeduction = (delta / (printer.pageYieldColor || 1)) * 100;

    printer.inkLevels.black = Math.max(0, printer.inkLevels.black - bwDeduction);
    printer.inkLevels.cyan = Math.max(0, printer.inkLevels.cyan - colorDeduction);
    printer.inkLevels.magenta = Math.max(0, printer.inkLevels.magenta - colorDeduction);
    printer.inkLevels.yellow = Math.max(0, printer.inkLevels.yellow - colorDeduction);

    printer.lastUpdatedPages = newTotalPages;
    this.calculatePrintCost();
  }

  refillInk(printerIndex: number, color: string) {
    const printer = this.printingSettings.printers[printerIndex];
    if (!printer) return;

    if (color === 'all') {
      printer.inkLevels = { black: 100, cyan: 100, magenta: 100, yellow: 100 };
    } else {
      printer.inkLevels[color] = 100;
    }
    this.calculatePrintCost();
  }

  resetSettings() {
    this.loadSettings();
  }

  trackByIndex(index: number, item: any) {
    return index;
  }
}

