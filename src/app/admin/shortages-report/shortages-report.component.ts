import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faChartBar, faCog, faFileDownload, faCheckCircle, faPlus, faTrash, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import { AdminApiService } from '../../services/admin-api.service';
import { DataService } from '../../services/data.service';
import { ModalService } from '../../services/modal.service';

@Component({
    selector: 'app-shortages-report',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './shortages-report.component.html',
    styleUrls: ['./shortages-report.component.css']
})
export class ShortagesReportComponent implements OnInit {
    settings: any = {
        threshold: 10,
        includeSuggestions: true,
        defaultOrderQuantity: 1,
        categories: []
    };

    manualQuantities: { [key: string]: number } = {};
    originalQuantities: { [key: string]: number } = {}; // To track changes
    availableCategories: string[] = [];
    isSaving: boolean = false;
    isDownloading: boolean = false;

    bookSearchTerm: string = '';
    bookSearchResults: any[] = [];
    allProducts: any[] = [];
    shortageItems: any[] = []; // Unified Preview List

    // Icons
    faChartBar = faChartBar;
    faCog = faCog;
    faFileDownload = faFileDownload;
    faCheckCircle = faCheckCircle;
    faPlus = faPlus;
    faTrash = faTrash;
    faSearch = faSearch;
    faTimes = faTimes;

    constructor(
        private adminApi: AdminApiService,
        private dataService: DataService,
        private modal: ModalService
    ) { }

    ngOnInit(): void {
        this.loadSettings();
        this.loadProducts();
    }

    loadSettings(): void {
        this.adminApi.getShortageSettings().subscribe({
            next: (res) => {
                if (res.success && res.settings) {
                    this.settings = {
                        ...res.settings,
                        defaultOrderQuantity: res.settings.defaultOrderQuantity || 1,
                        categories: res.settings.categories || []
                    };
                    this.manualQuantities = res.settings.orderQuantities ? { ...res.settings.orderQuantities } : {};
                    this.originalQuantities = { ...this.manualQuantities };
                    this.updateShortageItems();
                }
            }
        });
    }

    loadProducts(): void {
        this.dataService.getData().subscribe(data => {
            this.allProducts = data;

            // Extract unique categories
            const cats = new Set<string>();
            data.forEach((p: any) => {
                if (p.product_category) cats.add(p.product_category);
            });
            this.availableCategories = Array.from(cats).sort();

            this.updateShortageItems();
        });
    }

    toggleCategory(category: string): void {
        const idx = this.settings.categories.indexOf(category);
        if (idx >= 0) {
            this.settings.categories.splice(idx, 1);
        } else {
            this.settings.categories.push(category);
        }
        this.updateShortageItems();
    }

    updateShortageItems(): void {
        if (!this.allProducts.length) return;

        const manualIds = Object.keys(this.manualQuantities);
        const categories = this.settings.categories as string[];

        this.shortageItems = this.allProducts.filter(p => {
            const products_id = String(p.products_id).trim();
            const qty = parseInt(p.product_quantity, 10) || 0;
            const matchesThreshold = qty < this.settings.threshold;

            // Case-insensitive category match
            const pCat = (p.product_category || '').trim().toLowerCase();
            const matchesCategory = categories.length === 0 ||
                categories.some(c => c.trim().toLowerCase() === pCat);

            const isManual = manualIds.includes(products_id);

            // Attach source for UI labels
            p._isManual = isManual;
            p._isBelowThreshold = matchesThreshold && matchesCategory;

            return p._isBelowThreshold || isManual;
        });
    }

    searchBooks(): void {
        if (!this.bookSearchTerm.trim()) {
            this.bookSearchResults = [];
            return;
        }
        const term = this.bookSearchTerm.toLowerCase();
        this.bookSearchResults = this.allProducts.filter(p =>
            p.product_name.toLowerCase().includes(term) ||
            String(p.products_id).includes(term)
        ).slice(0, 20);
    }

    addToReport(product: any): void {
        const id = String(product.products_id).trim();
        if (!this.manualQuantities[id]) {
            this.manualQuantities[id] = this.settings.defaultOrderQuantity || 1;
        }
        this.bookSearchTerm = '';
        this.bookSearchResults = [];
        this.updateShortageItems();
    }

    removeProductFromReport(productId: string): void {
        const id = String(productId).trim();
        delete this.manualQuantities[id];
        this.updateShortageItems();
    }

    clearAllManual(): void {
        if (confirm('هل أنت متأكد من رغبتك في إفراغ القائمة اليدوية بالكامل؟')) {
            this.manualQuantities = {};
            this.updateShortageItems();
        }
    }

    hasChanges(): boolean {
        return JSON.stringify(this.manualQuantities) !== JSON.stringify(this.originalQuantities);
    }

    saveAllQuantities(): void {
        this.isSaving = true;
        this.adminApi.updateShortageSettings({
            orderQuantities: this.manualQuantities
        }).subscribe({
            next: () => {
                this.modal.showSuccess('تم حفظ جميع التعديلات بنجاح');
                this.originalQuantities = { ...this.manualQuantities };
                this.isSaving = false;
            },
            error: () => {
                this.modal.showError('حدث خطأ أثناء الحفظ');
                this.isSaving = false;
            }
        });
    }

    saveSettings(): void {
        this.isSaving = true;
        this.adminApi.updateShortageSettings(this.settings).subscribe({
            next: () => {
                this.modal.showSuccess('تم حفظ الإعدادات بنجاح');
                this.updateShortageItems();
                this.isSaving = false;
            },
            error: () => {
                this.modal.showError('حدث خطأ أثناء حفظ الإعدادات');
                this.isSaving = false;
            }
        });
    }

    downloadReport(): void {
        this.isDownloading = true;
        this.adminApi.downloadShortagesReport().subscribe({
            next: (blob: Blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Shortages_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                this.isDownloading = false;
                this.modal.showSuccess('تم تحميل التقرير بنجاح');
            },
            error: (err) => {
                console.error(err);
                this.modal.showError('حدث خطأ أثناء تحميل التقرير');
                this.isDownloading = false;
            }
        });
    }
}
