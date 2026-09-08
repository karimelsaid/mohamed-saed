import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faChartBar, faCog, faFileDownload, faCheckCircle, faPlus, faTrash, faSearch, faTimes, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { AdminApiService } from '../../services/admin-api.service';
import { DataService } from '../../services/data.service';
import { ModalService } from '../../services/modal.service';

@Component({
    selector: 'app-shortages-report',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './shortages-report.component.html',
    styleUrls: ['./shortages-report.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
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
    isLoading: boolean = true;

    bookSearchTerm: string = '';
    bookSearchResults: any[] = [];
    allProducts: any[] = [];
    shortageItems: any[] = []; // Unified Preview List

    // Pagination
    currentPage: number = 1;
    pageSize: number = 50;
    pagedItems: any[] = [];

    // Tracked dirty flag instead of JSON.stringify on every change detection
    _hasChanges: boolean = false;

    // Icons
    faChartBar = faChartBar;
    faCog = faCog;
    faFileDownload = faFileDownload;
    faCheckCircle = faCheckCircle;
    faPlus = faPlus;
    faTrash = faTrash;
    faSearch = faSearch;
    faTimes = faTimes;
    faChevronLeft = faChevronLeft;
    faChevronRight = faChevronRight;

    constructor(
        private adminApi: AdminApiService,
        private dataService: DataService,
        private modal: ModalService,
        private cdr: ChangeDetectorRef
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
                    this._hasChanges = false;
                    this.updateShortageItems();
                    this.cdr.markForCheck();
                }
            }
        });
    }

    loadProducts(): void {
        this.isLoading = true;
        this.cdr.markForCheck();

        this.dataService.getData().subscribe(data => {
            this.allProducts = data;

            // Extract unique categories
            const cats = new Set<string>();
            data.forEach((p: any) => {
                if (p.product_category) cats.add(p.product_category);
            });
            this.availableCategories = Array.from(cats).sort();

            this.isLoading = false;
            this.updateShortageItems();
            this.cdr.markForCheck();
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

        const manualIdsSet = new Set(Object.keys(this.manualQuantities));
        const categories = this.settings.categories as string[];
        const lowerCategories = categories.map(c => c.trim().toLowerCase());

        this.shortageItems = this.allProducts.filter(p => {
            const products_id = String(p.products_id).trim();
            const qty = parseInt(p.product_quantity, 10) || 0;
            const matchesThreshold = qty < this.settings.threshold;

            // Case-insensitive category match
            const pCat = (p.product_category || '').trim().toLowerCase();
            const matchesCategory = lowerCategories.length === 0 ||
                lowerCategories.includes(pCat);

            const isManual = manualIdsSet.has(products_id);

            // Attach source for UI labels
            p._isManual = isManual;
            p._isBelowThreshold = matchesThreshold && matchesCategory;

            return p._isBelowThreshold || isManual;
        });

        // Reset to page 1 when the list changes
        this.currentPage = 1;
        this.updatePagedItems();
    }

    updatePagedItems(): void {
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        this.pagedItems = this.shortageItems.slice(start, end);
    }

    get totalPages(): number {
        return Math.ceil(this.shortageItems.length / this.pageSize) || 1;
    }

    goToPage(page: number): void {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.updatePagedItems();
    }

    get visiblePages(): number[] {
        const total = this.totalPages;
        const current = this.currentPage;
        const pages: number[] = [];

        // Show at most 5 page buttons centered around current
        let start = Math.max(1, current - 2);
        let end = Math.min(total, start + 4);
        start = Math.max(1, end - 4);

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    }

    trackByProductId(index: number, item: any): string {
        return item.products_id;
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
        this.markDirty();
        this.updateShortageItems();
    }

    removeProductFromReport(productId: string): void {
        const id = String(productId).trim();
        delete this.manualQuantities[id];
        this.markDirty();
        this.updateShortageItems();
    }

    clearAllManual(): void {
        if (confirm('هل أنت متأكد من رغبتك في إفراغ القائمة اليدوية بالكامل؟')) {
            this.manualQuantities = {};
            this.markDirty();
            this.updateShortageItems();
        }
    }

    /** Marks quantities as changed — called explicitly instead of running JSON.stringify every cycle */
    markDirty(): void {
        this._hasChanges = true;
    }

    onQuantityChange(): void {
        this._hasChanges = true;
    }

    isRowChanged(productId: string): boolean {
        return this.manualQuantities[productId] !== this.originalQuantities[productId];
    }

    saveAllQuantities(): void {
        this.isSaving = true;
        this.adminApi.updateShortageSettings({
            orderQuantities: this.manualQuantities
        }).subscribe({
            next: () => {
                this.modal.showSuccess('تم حفظ جميع التعديلات بنجاح');
                this.originalQuantities = { ...this.manualQuantities };
                this._hasChanges = false;
                this.isSaving = false;
                this.cdr.markForCheck();
            },
            error: () => {
                this.modal.showError('حدث خطأ أثناء الحفظ');
                this.isSaving = false;
                this.cdr.markForCheck();
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
                this.cdr.markForCheck();
            },
            error: () => {
                this.modal.showError('حدث خطأ أثناء حفظ الإعدادات');
                this.isSaving = false;
                this.cdr.markForCheck();
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
                this.cdr.markForCheck();
            },
            error: (err) => {
                console.error(err);
                this.modal.showError('حدث خطأ أثناء تحميل التقرير');
                this.isDownloading = false;
                this.cdr.markForCheck();
            }
        });
    }
}
