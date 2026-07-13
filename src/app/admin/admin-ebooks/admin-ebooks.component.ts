import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { EbookService } from '../../services/ebook.service';
import { Ebook } from '../../models/ebook.model';
import { environment } from '../../../environments/environment';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

interface Product {
    products_id: string;
    product_name: string;
    product_category: string;
    product_description: string;
    author?: string;
    product_image?: string;
    linkedEbookId?: string;
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
    // Tab State
    activeTab: 'ebooks' | 'products' = 'ebooks';

    // Direct Ebooks State
    ebooks: Ebook[] = [];
    filteredEbooks: Ebook[] = [];
    totalEbooks = 0;

    // Products State
    products: Product[] = [];
    filteredProducts: Product[] = [];

    // General State
    isLoading = false;
    currentPage = 1;
    itemsPerPage = 10;
    totalPages = 1;

    // Search & Filter
    searchTerm = '';
    filterStatus: 'all' | 'available' | 'unavailable' = 'all';

    // Upload EPUB Modal State
    showUploadModal = false;
    selectedProduct: Product | null = null;
    selectedFile: File | null = null;
    selectedCover: File | null = null;
    isUploading = false;
    isDeleting = false;
    isReindexing = false;
    isDragging = false;
    dragType: 'epub' | 'cover' = 'epub';

    // Edit Ebook Modal State
    showEditModal = false;
    editingEbook: Ebook | null = null;
    editingEbookData = {
        _id: '',
        title: '',
        author: '',
        category: 'Novels-stories',
        description: '',
        price: 0,
        availableForSubscription: true,
        status: 'active' as 'active' | 'inactive' | 'pending',
        relatedProductId: '',
        publisher: '',
        pages: 0,
        publishYear: 0,
        isbn: ''
    };

    // Add New Product Modal State
    showAddProductModal = false;
    newProduct = {
        name: '',
        category: 'Novels-stories',
        author: '',
        price: 0,
        description: ''
    };
    isAddingProduct = false;

    // Duplicate detection state
    duplicateMatches: { _id: string; title: string; author: string; coverImage: string }[] = [];
    isDuplicateCheckLoading = false;
    duplicateOverridden = false; // user chose to proceed despite duplicates
    private duplicateCheckTimeout: any = null;

    // Extracted EPUB cover preview (data URL or object URL)
    extractedCoverPreviewUrl: string | null = null;
    isExtractingCover = false;

    // Category mappings for dropdown
    availableCategories = [
        { value: 'Business-Marketing-Finance', label: 'مال وأعمال' },
        { value: 'Education-children', label: 'تعليم وأطفال' },
        { value: 'Arts-crafts', label: 'فنون وحرف' },
        { value: 'HealthMedicineScience', label: 'صحة وعلوم' },
        { value: 'Islamic', label: 'كتب دينية' },
        { value: 'Novels-stories', label: 'روايات وقصص' },
        { value: 'Self-development-psychology', label: 'تطوير الذات وعلم النفس' },
        { value: 'History-Biographies', label: 'تاريخ وسير' },
        { value: 'Dictionaries-References', label: 'قواميس ومراجع' }
    ];

    private backendBaseUrl = environment.apiBaseUrl;
    uploadsBaseUrl = environment.uploadsBaseUrl;

    constructor(
        private ebookService: EbookService,
        private http: HttpClient
    ) { }

    ngOnInit(): void {
        this.loadEbooks();
    }

    // --- TAB SWITCHER ---
    switchTab(tab: 'ebooks' | 'products'): void {
        this.activeTab = tab;
        this.currentPage = 1;
        this.searchTerm = '';
        this.filterStatus = 'all';
        if (tab === 'ebooks') {
            this.loadEbooks();
        } else {
            this.loadProducts();
        }
    }

    // --- DIRECT EBOOKS MANAGEMENT ---
    loadEbooks(): void {
        this.isLoading = true;
        const filters = { search: this.searchTerm };
        this.ebookService.getEbooks(filters, this.currentPage, this.itemsPerPage).subscribe({
            next: (response) => {
                if (response.success) {
                    this.ebooks = response.data;
                    this.totalEbooks = response.total;
                    this.totalPages = response.pages || Math.ceil(response.total / this.itemsPerPage);
                    this.filteredEbooks = response.data;
                }
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading ebooks', err);
                this.isLoading = false;
            }
        });
    }

    // --- PRODUCTS/OLD MANAGEMENT ---
    loadProducts(): void {
        this.isLoading = true;
        this.http.get<{ success: boolean; products: Product[] }>(`${this.backendBaseUrl}/admin/products`).subscribe({
            next: (response) => {
                if (response.success) {
                    const allProducts = response.products;
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

    isBookCategory(category: string): boolean {
        if (!category) return false;
        const lower = category.toLowerCase();
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

        if (this.filterStatus === 'available') {
            temp = temp.filter(p => !!p.linkedEbookId);
        } else if (this.filterStatus === 'unavailable') {
            temp = temp.filter(p => !p.linkedEbookId);
        }

        this.totalPages = Math.ceil(temp.length / this.itemsPerPage);
        const start = (this.currentPage - 1) * this.itemsPerPage;
        this.filteredProducts = temp.slice(start, start + this.itemsPerPage);
    }

    onSearch(): void {
        this.currentPage = 1;
        if (this.activeTab === 'ebooks') {
            this.loadEbooks();
        } else {
            this.applyFilters();
        }
    }

    onFilterChange(): void {
        this.currentPage = 1;
        if (this.activeTab === 'ebooks') {
            this.loadEbooks();
        } else {
            this.applyFilters();
        }
    }

    nextPage(): void {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            if (this.activeTab === 'ebooks') {
                this.loadEbooks();
            } else {
                this.applyFilters();
            }
        }
    }

    prevPage(): void {
        if (this.currentPage > 1) {
            this.currentPage--;
            if (this.activeTab === 'ebooks') {
                this.loadEbooks();
            } else {
                this.applyFilters();
            }
        }
    }

    // --- DIRECT EBOOK EDIT MODAL FLOW ---
    openEditModal(ebook: Ebook): void {
        this.editingEbook = ebook;
        this.selectedFile = null;
        this.selectedCover = null;
        
        this.editingEbookData = {
            _id: ebook._id,
            title: ebook.title,
            author: ebook.author,
            category: ebook.category || 'Novels-stories',
            description: ebook.description || '',
            price: ebook.price || 0,
            availableForSubscription: ebook.availableForSubscription !== false,
            status: ebook.status || 'active',
            relatedProductId: ebook.relatedProductId || '',
            publisher: ebook.publisher || '',
            pages: ebook.pages || 0,
            publishYear: ebook.publishYear || 0,
            isbn: ebook.isbn || ''
        };
        this.showEditModal = true;
    }

    closeEditModal(): void {
        this.showEditModal = false;
        this.editingEbook = null;
        this.selectedFile = null;
        this.selectedCover = null;
    }

    submitEditEbook(): void {
        if (!this.editingEbookData.title || !this.editingEbookData.author) {
            alert('الرجاء إدخال اسم الكتاب والمؤلف');
            return;
        }

        this.isLoading = true;
        const formData = new FormData();
        formData.append('title', this.editingEbookData.title);
        formData.append('author', this.editingEbookData.author);
        formData.append('category', this.editingEbookData.category);
        formData.append('description', this.editingEbookData.description);
        formData.append('price', this.editingEbookData.price.toString());
        formData.append('availableForSubscription', this.editingEbookData.availableForSubscription.toString());
        formData.append('status', this.editingEbookData.status);
        
        if (this.editingEbookData.relatedProductId) {
            formData.append('relatedProductId', this.editingEbookData.relatedProductId);
        }
        if (this.editingEbookData.publisher) {
            formData.append('publisher', this.editingEbookData.publisher);
        }
        if (this.editingEbookData.pages) {
            formData.append('pages', this.editingEbookData.pages.toString());
        }
        if (this.editingEbookData.publishYear) {
            formData.append('publishYear', this.editingEbookData.publishYear.toString());
        }
        if (this.editingEbookData.isbn) {
            formData.append('isbn', this.editingEbookData.isbn);
        }

        if (this.selectedFile) {
            formData.append('epubFile', this.selectedFile);
        }
        if (this.selectedCover) {
            formData.append('coverImage', this.selectedCover);
        }

        this.ebookService.updateEbook(this.editingEbookData._id, formData).subscribe({
            next: (res) => {
                alert('تم تحديث بيانات الكتاب الإلكتروني بنجاح! ✅');
                this.closeEditModal();
                this.loadEbooks();
            },
            error: (err) => {
                console.error('Update Ebook Error:', err);
                const errMsg = err.error?.message || 'حدث خطأ أثناء تحديث بيانات الكتاب.';
                alert('خطأ: ' + errMsg);
                this.isLoading = false;
            }
        });
    }

    deleteDirectEbook(ebook: Ebook): void {
        if (confirm(`هل أنت متأكد من حذف الكتاب الإلكتروني "${ebook.title}" نهائياً؟ \nسيتم حذف ملف الكتاب، الغلاف، وكافة بيانات القراءة والمتابعة المرتبطة به.`)) {
            this.isLoading = true;
            this.ebookService.deleteEbook(ebook._id).subscribe({
                next: () => {
                    alert('تم حذف الكتاب الإلكتروني بنجاح ✅');
                    this.loadEbooks();
                },
                error: (err) => {
                    console.error('Delete Error', err);
                    alert('حدث خطأ أثناء الحذف.');
                    this.isLoading = false;
                }
            });
        }
    }

    reindexPageCounts(): void {
        if (confirm('هل ترغب في إعادة حساب عدد صفحات جميع الكتب القديمة التي ليس لها صفحات؟\nقد تستغرق هذه العملية بعض الوقت اعتماداً على حجم الكتب.')) {
            this.isReindexing = true;
            this.ebookService.reindexPageCounts().subscribe({
                next: (res) => {
                    this.isReindexing = false;
                    if (res.success) {
                        alert(`تمت العملية بنجاح! 🎉\nإجمالي الكتب التي تم فحصها: ${res.total}\nتم تحديث: ${res.updated}\nفشل: ${res.failed}`);
                        this.loadEbooks();
                    } else {
                        alert('حدث خطأ أثناء إعادة الفهرسة: ' + res.message);
                    }
                },
                error: (err) => {
                    this.isReindexing = false;
                    console.error('Error reindexing page counts:', err);
                    alert('خطأ: ' + (err.error?.message || 'فشل الاتصال بالخادم.'));
                }
            });
        }
    }

    // --- UPLOAD / UPDATE FUNCTIONALITY (Products tab) ---
    openUploadModal(product: Product): void {
        this.selectedProduct = product;
        this.selectedFile = null;
        this.selectedCover = null;
        this.showUploadModal = true;
    }

    onFileSelected(event: any, type: 'epub' | 'cover'): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            this.handleFile(input.files[0], type);
        }
    }

    onDragOver(event: DragEvent, type: 'epub' | 'cover'): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = true;
        this.dragType = type;
    }

    onDragLeave(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;
    }

    onDrop(event: DragEvent, type: 'epub' | 'cover'): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;

        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            this.handleFile(files[0], type);
        }
    }

    sanitizeFileName(fileName: string): string {
        // Remove extension
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");

        // Replace underscores with spaces
        let sanitized = nameWithoutExt.replace(/_/g, ' ');

        // Remove any non-text characters (keep Arabic letters, English letters, numbers, and spaces)
        sanitized = sanitized.replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z0-9\s]/g, '');

        // Replace multiple spaces with single space
        sanitized = sanitized.replace(/\s+/g, ' ');

        // Trim from start and end
        return sanitized.trim();
    }

    parseEbookFileName(fileName: string): { bookName: string; author: string; description: string } {
        // First sanitize the filename
        const sanitizedFileName = this.sanitizeFileName(fileName);

        // Split by '--'
        const parts = sanitizedFileName.split('--').map(p => p.trim());

        let bookName = '';
        let author = '';
        let description = '';

        if (parts.length > 0) {
            // First part has the book name and potentially its description/sub-title
            const firstPart = parts[0];
            // Split by Arabic semicolon '؛' or English semicolon ';'
            const subParts = firstPart.split(/[؛;]/).map(sp => sp.trim());
            bookName = subParts[0] || '';

            if (subParts.length > 1) {
                description = subParts.slice(1).join('؛ ').trim();
            }
        }

        if (parts.length > 1) {
            author = parts[1] || '';
        }

        // If there's no description, fallback to author name or book name
        if (!description) {
            description = author || bookName;
        }

        return {
            bookName,
            author,
            description
        };
    }

    handleFile(file: File, type: 'epub' | 'cover'): void {
        if (type === 'epub') {
            if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) {
                this.selectedFile = file;
                
                // Automatically extract details when adding a new digital product
                if (this.showAddProductModal) {
                    const parsed = this.parseEbookFileName(file.name);
                    if (parsed.bookName) {
                        this.newProduct.name = parsed.bookName;
                    }
                    if (parsed.author) {
                        this.newProduct.author = parsed.author;
                    }
                    if (parsed.description) {
                        this.newProduct.description = parsed.description;
                    }
                    // Reset duplicate state and trigger check
                    this.duplicateOverridden = false;
                    this.duplicateMatches = [];
                    this.triggerDuplicateCheck();

                    // Extract cover preview from EPUB using epubjs
                    this.extractCoverPreviewFromEpub(file);
                }
            } else {
                alert('الرجاء تحميل ملف بصيغة EPUB فقط');
            }
        } else {
            if (file.type.startsWith('image/')) {
                this.selectedCover = file;
                // Override extracted preview with the manually selected cover
                if (this.extractedCoverPreviewUrl) {
                    URL.revokeObjectURL(this.extractedCoverPreviewUrl);
                    this.extractedCoverPreviewUrl = null;
                }
            } else {
                alert('الرجاء تحميل صورة صحيحة');
            }
        }
    }

    /** Extract the cover image from the EPUB file using epubjs and set a preview URL */
    private async extractCoverPreviewFromEpub(file: File): Promise<void> {
        this.isExtractingCover = true;
        this.extractedCoverPreviewUrl = null;
        try {
            // Dynamically import epubjs to keep initial bundle small
            const ePub = (await import('epubjs')).default;
            const arrayBuffer = await file.arrayBuffer();
            const book = ePub(arrayBuffer as any);
            await book.ready;

            // Try to get cover URL from epub metadata
            const coverUrl: string | null = await book.coverUrl();
            if (coverUrl) {
                this.extractedCoverPreviewUrl = coverUrl;
            }
            book.destroy();
        } catch (err) {
            console.warn('⚠️ Could not extract cover preview from EPUB:', err);
            this.extractedCoverPreviewUrl = null;
        } finally {
            this.isExtractingCover = false;
        }
    }

    /** Debounced duplicate check triggered when name changes or EPUB is selected */
    onProductNameChange(): void {
        this.duplicateOverridden = false;
        this.duplicateMatches = [];
        clearTimeout(this.duplicateCheckTimeout);
        this.duplicateCheckTimeout = setTimeout(() => {
            this.triggerDuplicateCheck();
        }, 600);
    }

    private triggerDuplicateCheck(): void {
        const query = (this.newProduct.name || '').trim();
        if (!query || query.length < 3) {
            this.duplicateMatches = [];
            return;
        }
        this.isDuplicateCheckLoading = true;

        // The server already does fuzzy/text search — trust its results directly.
        // Do NOT apply extra client-side filtering that could silently drop valid matches.
        this.ebookService.getEbooks({ search: query }, 1, 8).subscribe({
            next: (res) => {
                this.isDuplicateCheckLoading = false;
                if (res.success && res.data && res.data.length > 0) {
                    this.duplicateMatches = res.data.map((e: any) => ({
                        _id: e._id,
                        title: e.title,
                        author: e.author,
                        coverImage: e.coverImage
                    }));
                } else {
                    this.duplicateMatches = [];
                }
            },
            error: () => {
                this.isDuplicateCheckLoading = false;
                this.duplicateMatches = [];
            }
        });
    }

    submitUpload(): void {
        if (!this.selectedProduct || !this.selectedFile) return;

        this.isUploading = true;
        this.ebookService.uploadEbookForProduct(
            this.selectedProduct.products_id, 
            this.selectedFile,
            this.selectedCover || undefined
        ).subscribe({
            next: (res) => {
                alert('تم رفع الكتاب الإلكتروني بنجاح! ✅');
                if (this.selectedProduct) {
                    this.selectedProduct.linkedEbookId = res.linkedEbookId || 'new_id';
                }
                this.isUploading = false;
                this.showUploadModal = false;
                this.selectedProduct = null;
                this.selectedFile = null;
                this.selectedCover = null;
            },
            error: (err) => {
                console.error('Upload Error', err);
                alert('حدث خطأ أثناء الرفع. الرجاء المحاولة مرة أخرى.');
                this.isUploading = false;
            }
        });
    }

    async submitNewProduct() {
        if (!this.newProduct.name || !this.selectedFile) {
            alert('الرجاء إدخال اسم الكتاب ورفع ملف EPUB');
            return;
        }

        this.isAddingProduct = true;
        try {
            const formData = new FormData();
            formData.append('product_name', this.newProduct.name);
            formData.append('product_category', this.newProduct.category);
            formData.append('author', this.newProduct.author);
            formData.append('product_price', this.newProduct.price.toString());
            formData.append('product_description', this.newProduct.description);
            formData.append('epub', this.selectedFile);

            if (this.selectedCover) {
                formData.append('coverImage', this.selectedCover);
                
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve) => {
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(this.selectedCover!);
                });
                const base64Image = await base64Promise;
                formData.append('images[]', base64Image); 
            }

            this.http.post<{ success: boolean; product: Product; message: string }>(
                `${this.backendBaseUrl}/admin/create-digital-book`, 
                formData
            ).subscribe({
                next: (res) => {
                    if (res.success) {
                        alert('تم إضافة الكتاب والمنتج الرقمي بنجاح! ✅');
                        this.showAddProductModal = false;
                        this.resetNewProduct();
                        this.selectedFile = null;
                        this.selectedCover = null;
                        this.loadProducts();
                    } else {
                        alert('خطأ: ' + (res.message || 'فشل في إنشاء الكتاب'));
                    }
                    this.isAddingProduct = false;
                },
                error: (err) => {
                    console.error('Create Digital Product Error', err);
                    const errorMsg = err.error?.message || 'حدث خطأ أثناء الإضافة. الرجاء التأكد من تعبئة كافة البيانات الأساسية ورفع الملفات.';
                    alert('خطأ: ' + errorMsg);
                    this.isAddingProduct = false;
                }
            });
        } catch (error) {
            console.error('Error in submitNewProduct:', error);
            this.isAddingProduct = false;
        }
    }

    cancelUpload(): void {
        this.showUploadModal = false;
        this.selectedProduct = null;
        this.selectedFile = null;
        this.selectedCover = null;
    }

    deleteEbook(product: Product): void {
        if (!product.linkedEbookId) return;

        if (confirm(`هل أنت متأكد من حذف النسخة الإلكترونية لكتاب "${product.product_name}" نهائياً؟ \nسيتم حذف ملف الكتاب والصورة المصغرة من الخادم.`)) {
            this.isDeleting = true;
            this.ebookService.deleteEbook(product.linkedEbookId).subscribe({
                next: () => {
                    alert('تم حذف الكتاب الإلكتروني بنجاح ✅');
                    product.linkedEbookId = undefined;
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

    openAddProductModal(): void {
        this.resetNewProduct();
        this.selectedFile = null;
        this.selectedCover = null;
        this.duplicateMatches = [];
        this.duplicateOverridden = false;
        this.isDuplicateCheckLoading = false;
        this.extractedCoverPreviewUrl = null;
        this.isExtractingCover = false;
        this.showAddProductModal = true;
    }

    resetNewProduct(): void {
        this.newProduct = {
            name: '',
            category: 'Novels-stories',
            author: '',
            price: 0,
            description: ''
        };
        this.duplicateMatches = [];
        this.duplicateOverridden = false;
        if (this.extractedCoverPreviewUrl) {
            URL.revokeObjectURL(this.extractedCoverPreviewUrl);
            this.extractedCoverPreviewUrl = null;
        }
    }

    getProductImage(product: Product): string {
        if (!product.product_image) return 'assets/image/book-placeholder.jpg';
        if (product.product_image.startsWith('http') || product.product_image.startsWith('data:')) return product.product_image;
        return `${this.uploadsBaseUrl}/${product.product_image}`;
    }

    // Direct Ebooks helper
    getCategoryDisplayName(category: string): string {
        return this.ebookService.getCategoryDisplayName(category);
    }
}
