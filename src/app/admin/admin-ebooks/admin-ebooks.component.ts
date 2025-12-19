import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http'; // Imported HttpClient
import { EbookService } from '../../services/ebook.service';
import { Ebook } from '../../models/ebook.model';
import { environment } from '../../../environments/environment';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';


interface Product {
    products_id: string; // Using the ID field from schema
    product_name: string;
    product_category: string;
    product_description: string; // for author usually? No, author is separate field often
    author?: string;
    product_image?: string;
    linkedEbookId?: string; // The crucial link
    [key: string]: any;
}

@Component({
    selector: 'app-admin-ebooks',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './admin-ebooks.component.html',
    styleUrls: ['./admin-ebooks.component.css']
})
export class AdminEbooksComponent implements OnInit {
    products: Product[] = [];
    filteredProducts: Product[] = [];
    isLoading = false;

    // Pagination
    currentPage = 1;
    itemsPerPage = 10;
    totalPages = 1;

    // Search & Filter
    searchTerm = '';
    filterStatus: 'all' | 'available' | 'unavailable' = 'all';

    // Upload Modal State
    showUploadModal = false;
    selectedProduct: Product | null = null;
    selectedFile: File | null = null;

    isUploading = false;

    isDeleting = false;
    isDragging = false;

    private backendBaseUrl = environment.apiBaseUrl;
    uploadsBaseUrl = environment.uploadsBaseUrl;

    constructor(
        private ebookService: EbookService,
        private http: HttpClient
    ) { }

    ngOnInit(): void {
        this.loadProducts();
    }

    loadProducts(): void {
        this.isLoading = true;
        this.http.get<{ success: boolean; products: Product[] }>(`${this.backendBaseUrl}/admin/products`).subscribe({
            next: (response) => {
                if (response.success) {
                    const allProducts = response.products;
                    console.log('All Products:', allProducts);
                    console.log('Unique Categories:', [...new Set(allProducts.map(p => p.product_category))]);

                    // Filter only 'Books' or similar categories
                    this.products = allProducts.filter(p => this.isBookCategory(p.product_category));
                    this.applyFilters();
                }
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading products', err);
                this.isLoading = false;
            }
        });
    }

    // Helper logic copied/adapted from AdminDashboard
    isBookCategory(category: string): boolean {
        if (!category) return false;
        const lower = category.toLowerCase();

        // Known categories from EbookService + Arabic mappings + Generics
        const allowed = [
            'books', 'كتب', 'book',
            'business-marketing-finance', 'education-children', 'arts-crafts',
            'healthmedicinescience', 'islamic', 'novels-stories',
            'self-development-psychology', 'history-biographies', 'dictionaries-references',
            'روايات وقصص', 'كتب دينية', 'تطوير الذات وعلم النفس', 'قواميس ومراجع',
            'صحة وطب وعلوم', 'تاريخ وسير ذاتية', 'تربية وأطفال', 'فنون وحرف',
            'أعمال وتسويق ومالية', 'إسلامي'
        ];

        return allowed.includes(lower) ||
            lower.includes('رواية') ||
            lower.includes('كتب') ||
            lower.includes('قصص') ||
            lower.includes('book');
    }

    applyFilters(): void {
        let temp = this.products;

        if (this.searchTerm) {
            const lower = this.searchTerm.toLowerCase();
            temp = temp.filter(p =>
                (p.product_name && p.product_name.toLowerCase().includes(lower)) ||
                (p.author && p.author.toLowerCase().includes(lower))
            );
        }

        // Apply Status Filter
        if (this.filterStatus === 'available') {
            temp = temp.filter(p => !!p.linkedEbookId); // Has ebook
        } else if (this.filterStatus === 'unavailable') {
            temp = temp.filter(p => !p.linkedEbookId); // No ebook
        }

        this.totalPages = Math.ceil(temp.length / this.itemsPerPage);

        // Paginate
        const start = (this.currentPage - 1) * this.itemsPerPage;
        this.filteredProducts = temp.slice(start, start + this.itemsPerPage);
    }

    onSearch(): void {
        this.currentPage = 1;
        this.applyFilters();
    }

    onFilterChange(): void {
        this.currentPage = 1;
        this.applyFilters();
    }

    nextPage(): void {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.applyFilters();
        }
    }

    prevPage(): void {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.applyFilters();
        }
    }

    // --- UPLOAD / UPDATE FUNCTIONALITY ---

    openUploadModal(product: Product): void {
        this.selectedProduct = product;
        this.selectedFile = null;
        this.showUploadModal = true;
    }

    onFileSelected(event: any): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            this.handleFile(input.files[0]);
        }
    }

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = true;
    }

    onDragLeave(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;

        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    handleFile(file: File): void {
        if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) {
            this.selectedFile = file;
        } else {
            alert('الرجاء تحميل ملف بصيغة EPUB فقط');
        }
    }

    submitUpload(): void {
        if (!this.selectedProduct || !this.selectedFile) return;

        this.isUploading = true;
        this.ebookService.uploadEbookForProduct(this.selectedProduct.products_id, this.selectedFile).subscribe({
            next: (res) => {
                alert('تم رفع الكتاب الإلكتروني بنجاح! ✅');
                // Update local status
                if (this.selectedProduct) {
                    this.selectedProduct.linkedEbookId = res.linkedEbookId || 'new_id';
                }
                this.isUploading = false;
                this.showUploadModal = false;
                this.selectedProduct = null;
                this.selectedFile = null;
            },
            error: (err) => {
                console.error('Upload Error', err);
                alert('حدث خطأ أثناء الرفع. الرجاء المحاولة مرة أخرى.');
                this.isUploading = false;
            }
        });
    }

    cancelUpload(): void {
        this.showUploadModal = false;
        this.selectedProduct = null;
        this.selectedFile = null;
    }

    deleteEbook(product: Product): void {
        if (!product.linkedEbookId) return;

        if (confirm(`هل أنت متأكد من حذف النسخة الإلكترونية لكتاب "${product.product_name}" نهائياً؟ \nسيتم حذف ملف الكتاب والصورة المصغرة من الخادم.`)) {
            this.isDeleting = true;
            this.ebookService.deleteEbook(product.linkedEbookId).subscribe({
                next: () => {
                    alert('تم حذف الكتاب الإلكتروني بنجاح ✅');
                    product.linkedEbookId = undefined; // Unlink locally
                    this.isDeleting = false;
                },
                error: (err) => {
                    console.error('Delete Error', err);
                    alert('حدث خطأ أثناء الحذف.');
                    this.isDeleting = false;
                }
            });
        }
    }

    // Helpers
    getProductImage(product: Product): string {
        if (!product.product_image) return 'assets/images/book-placeholder.jpg';
        if (product.product_image.startsWith('http')) return product.product_image;
        return `${this.uploadsBaseUrl}/${product.product_image}`;
    }
}
