import { Component, OnInit, ViewEncapsulation, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
    faCartPlus, faSearch, faPlus, faTimes, faCheckCircle,
    faExclamationTriangle, faPercent, faTag, faPrint,
    faUser, faPhone, faBoxes, faReceipt, faShoppingCart,
    faTrash, faMinus
} from '@fortawesome/free-solid-svg-icons';
import { DataService } from '../../services/data.service';
import { AdminApiService } from '../../services/admin-api.service';
import { ModalService } from '../../services/modal.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface SaleItem {
    products_id: string;
    product_name: string;
    product_quantity: number;
    image_path?: string;
    product_price: number;
    quantity: number;
    channel: 'Amazon' | 'Store';
}

@Component({
    selector: 'app-sales-registration',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './sales-registration.component.html',
    styleUrls: ['./sales-registration.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class SalesRegistrationComponent implements OnInit {
    searchTerm: string = '';
    allProducts: any[] = [];
    searchResults: any[] = [];
    sessionItems: SaleItem[] = [];
    isSubmitting: boolean = false;
    backendBaseUrl: string = environment.apiBaseUrl;

    /** For mobile: show cart tab or search tab */
    activeTab: 'search' | 'cart' = 'search';

    // Customer Information
    customerName: string = '';
    customerPhone: string = '';
    invoiceDate: string = new Date().toLocaleDateString('ar-EG');
    invoiceNumber: string = '';

    // Discount
    discountType: 'percentage' | 'fixed' = 'percentage';
    discountValue: number = 0;

    // Auth error state
    authError: boolean = false;

    // Icons
    faCartPlus = faCartPlus;
    faSearch = faSearch;
    faPlus = faPlus;
    faTimes = faTimes;
    faMinus = faMinus;
    faCheckCircle = faCheckCircle;
    faExclamationTriangle = faExclamationTriangle;
    faPercent = faPercent;
    faTag = faTag;
    faPrint = faPrint;
    faUser = faUser;
    faPhone = faPhone;
    faBoxes = faBoxes;
    faReceipt = faReceipt;
    faShoppingCart = faShoppingCart;
    faTrash = faTrash;

    constructor(
        private dataService: DataService,
        private adminApi: AdminApiService,
        private modal: ModalService,
        private http: HttpClient
    ) { }

    ngOnInit(): void {
        this.checkAuth();
        this.loadProducts();
        this.generateInvoiceNumber();
    }

    /** Verify that a valid admin token exists before proceeding */
    checkAuth(): void {
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) { this.authError = true; return; }
            const user = JSON.parse(userStr);
            if (!user?.token || (user.role !== 'admin' && user.role !== 'staff')) {
                this.authError = true;
            } else {
                this.authError = false;
            }
        } catch {
            this.authError = true;
        }
    }

    /** Get admin token safely */
    private getToken(): string | null {
        try {
            const user = JSON.parse(localStorage.getItem('user') || 'null');
            return user?.token || null;
        } catch {
            return null;
        }
    }

    generateInvoiceNumber(): void {
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        this.invoiceNumber = `INV-${datePart}-${randomPart}`;
    }

    loadProducts(): void {
        this.dataService.getData().subscribe(data => {
            this.allProducts = data;
        });
    }

    normalizeArabic(text: string): string {
        if (!text) return '';
        return String(text)
            .replace(/[أإآا]/g, 'ا')
            .replace(/[ةه]/g, 'ه')
            .replace(/[يى]/g, 'ي')
            .replace(/[ؤ]/g, 'و')
            .replace(/[ئ]/g, 'ي')
            .replace(/[\u064B-\u065F]/g, '')
            .toLowerCase()
            .trim();
    }

    searchProducts(): void {
        if (!this.searchTerm || !this.searchTerm.trim()) {
            this.searchResults = [];
            return;
        }
        const term = this.normalizeArabic(this.searchTerm);
        this.searchResults = this.allProducts.filter(p => {
            if (!p) return false;
            const name = this.normalizeArabic(p.product_name || '');
            const id = this.normalizeArabic(String(p.products_id || ''));
            const barcode = this.normalizeArabic(String(p.barcode || ''));
            const author = this.normalizeArabic(p.author || '');
            const category = this.normalizeArabic(p.product_category || '');
            return name.includes(term) || id.includes(term) || barcode.includes(term) ||
                   author.includes(term) || category.includes(term);
        }).slice(0, 50);
    }

    addItem(product: any): void {
        const existing = this.sessionItems.find(item => item.products_id === product.products_id);
        if (existing) {
            existing.quantity++;
        } else {
            this.sessionItems.push({
                products_id: product.products_id,
                product_name: product.product_name,
                product_quantity: product.product_quantity,
                image_path: product.image_path,
                product_price: product.product_price || 0,
                quantity: 1,
                channel: 'Store'
            });
        }
        this.searchTerm = '';
        this.searchResults = [];
        // Switch to cart tab on mobile after adding item
        this.activeTab = 'cart';
    }

    updateQty(index: number, delta: number): void {
        const item = this.sessionItems[index];
        const newQty = item.quantity + delta;
        if (newQty >= 0) item.quantity = newQty;
        if (newQty === 0) this.sessionItems.splice(index, 1);
    }

    removeItem(index: number): void {
        this.sessionItems.splice(index, 1);
    }

    getSubtotal(): number {
        return this.sessionItems.reduce((sum, item) => sum + (item.product_price * item.quantity), 0);
    }

    getDiscountAmount(): number {
        const subtotal = this.getSubtotal();
        if (!this.discountValue || this.discountValue <= 0) return 0;
        if (this.discountType === 'percentage') {
            return Math.min(subtotal, subtotal * (this.discountValue / 100));
        }
        return Math.min(subtotal, this.discountValue);
    }

    getGrandTotal(): number {
        return Math.max(0, this.getSubtotal() - this.getDiscountAmount());
    }

    get cartCount(): number {
        return this.sessionItems.reduce((sum, item) => sum + item.quantity, 0);
    }

    printInvoice(): void {
        if (this.sessionItems.length === 0) return;
        this.invoiceDate = new Date().toLocaleString('ar-EG');
        setTimeout(() => { window.print(); }, 300);
    }

    getImageUrl(product: any): string {
        if (!product) return '';
        const base = environment.apiBaseUrl.replace('/api', '');
        if (product.image_path) {
            const path = product.image_path.startsWith('/') ? product.image_path : '/' + product.image_path;
            return base + path;
        }
        if (product.products_id) {
            return `${base}/uploads/books/admin__karim_mohamed__/${product.products_id}/${product.products_id}.webp`;
        }
        return '';
    }

    submitSession(): void {
        if (this.sessionItems.length === 0) return;

        const token = this.getToken();
        if (!token) {
            this.authError = true;
            this.modal.showError('جلسة الأدمن منتهية. يرجى تسجيل الخروج وإعادة الدخول.');
            return;
        }

        this.isSubmitting = true;
        const soldItems = this.sessionItems.map(item => ({
            products_id: item.products_id,
            product_name: item.product_name,
            quantity: item.quantity,
            price: item.product_price,
            total: item.product_price * item.quantity
        }));

        const saleData = {
            soldItems,
            customerName: this.customerName,
            customerPhone: this.customerPhone,
            totalAmount: this.getGrandTotal(),
            invoiceNumber: this.invoiceNumber,
            discountType: this.discountValue > 0 ? this.discountType : null,
            discountValue: this.discountValue,
            discountAmount: this.getDiscountAmount()
        };

        // Use HttpClient directly with explicit Authorization header to bypass interceptor issues
        const baseUrl = environment.apiBaseUrl.endsWith('/api')
            ? environment.apiBaseUrl
            : environment.apiBaseUrl + '/api';
        const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });

        this.http.post(`${baseUrl}/admin/register-sale`, saleData, { headers }).subscribe({
            next: () => {
                this.modal.showSuccess('تم تسجيل المبيعات وتحديث المخزون بنجاح');
                this.sessionItems = [];
                this.customerName = '';
                this.customerPhone = '';
                this.discountType = 'percentage';
                this.discountValue = 0;
                this.generateInvoiceNumber();
                this.loadProducts();
                this.isSubmitting = false;
                this.activeTab = 'search';
            },
            error: (err) => {
                this.isSubmitting = false;
                if (err.status === 401 || err.status === 403) {
                    this.authError = true;
                    this.modal.showError('انتهت الجلسة أو لا تملك صلاحية الأدمن. يرجى تسجيل الخروج وإعادة الدخول.');
                } else {
                    this.modal.showError('حدث خطأ أثناء تسجيل المبيعات');
                }
            }
        });
    }
}
