import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EbookService } from '../../services/ebook.service';
import { Ebook } from '../../models/ebook.model';
import { environment } from '../../../environments/environment';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ModalDialogComponent } from '../../shared/modal-dialog/modal-dialog.component';

@Component({
    selector: 'app-admin-ebooks',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule, ModalDialogComponent],
    templateUrl: './admin-ebooks.component.html',
    styleUrls: ['./admin-ebooks.component.css']
})
export class AdminEbooksComponent implements OnInit {
    ebooks: Ebook[] = [];
    isLoading = false;

    // Pagination
    currentPage = 1;
    totalPages = 1;
    totalItems = 0;
    itemsPerPage = 20;

    // Search & Filter
    searchTerm = '';

    // Modal State
    selectedEbook: Ebook | null = null;

    // Delete Modal
    showDeleteModal = false;
    deleteModalMessage = '';

    // Update File Modal
    showUpdateModal = false;
    selectedFile: File | null = null;
    isUpdating = false;

    private uploadsBaseUrl = environment.uploadsBaseUrl;

    constructor(private ebookService: EbookService) { }

    ngOnInit(): void {
        this.loadEbooks();
    }

    loadEbooks(page: number = 1): void {
        this.isLoading = true;
        this.currentPage = page;

        // We can filter by search term if provided
        const filters = {
            search: this.searchTerm,
            includeInvalid: true
        };

        this.ebookService.getEbooks(filters, this.currentPage, this.itemsPerPage).subscribe({
            next: (res) => {
                this.ebooks = res.data;
                this.totalPages = res.pages;
                this.totalItems = res.total;
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading ebooks', err);
                this.isLoading = false;
            }
        });
    }

    onSearch(): void {
        this.loadEbooks(1);
    }

    // --- DELETE FUNCTIONALITY ---
    confirmDelete(ebook: Ebook): void {
        this.selectedEbook = ebook;
        this.deleteModalMessage = `هل أنت متأكد من حذف كتاب "${ebook.title}"؟ هذا الإجراء لا يمكن التراجع عنه وسيتم حذف الملفات المرتبطة به.`;
        this.showDeleteModal = true;
    }

    onDeleteConfirmed(): void {
        if (!this.selectedEbook) return;

        this.isLoading = true;
        this.ebookService.deleteEbook(this.selectedEbook._id).subscribe({
            next: () => {
                this.isLoading = false;
                this.showDeleteModal = false;
                this.selectedEbook = null;
                // Reload current page
                this.loadEbooks(this.currentPage);
            },
            error: (err) => {
                console.error('Error deleting ebook', err);
                this.isLoading = false;
                this.showDeleteModal = false;
                alert('حدث خطأ أثناء الحذف');
            }
        });
    }

    onDeleteCancelled(): void {
        this.showDeleteModal = false;
        this.selectedEbook = null;
    }

    // --- UPDATE FILE FUNCTIONALITY ---
    openUpdateModal(ebook: Ebook): void {
        this.selectedEbook = ebook;
        this.selectedFile = null;
        this.showUpdateModal = true;
    }

    onFileSelected(event: any): void {
        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0];
            if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) {
                this.selectedFile = file;
            } else {
                alert('الرجاء اختيار ملف بصيغة EPUB فقط');
                event.target.value = ''; // Reset input
            }
        }
    }

    submitUpdate(): void {
        if (!this.selectedEbook || !this.selectedFile) return;

        this.isUpdating = true;
        const formData = new FormData();
        formData.append('epubFile', this.selectedFile);
        // We can also allow updating metadata here later if needed

        this.ebookService.updateEbook(this.selectedEbook._id, formData).subscribe({
            next: (res) => {
                this.isUpdating = false;
                this.showUpdateModal = false;
                this.selectedEbook = null;
                this.selectedFile = null;
                alert('تم تحديث ملف الكتاب بنجاح');
                this.loadEbooks(this.currentPage);
            },
            error: (err) => {
                console.error('Error updating ebook', err);
                this.isUpdating = false;
                alert('حدث خطأ أثناء تحديث الملف');
            }
        });
    }

    cancelUpdate(): void {
        this.showUpdateModal = false;
        this.selectedEbook = null;
        this.selectedFile = null;
    }

    // Helpers
    getCoverUrl(ebook: Ebook): string {
        if (!ebook.coverImage) return 'assets/images/book-placeholder.jpg';
        if (ebook.coverImage.startsWith('http')) return ebook.coverImage;

        // If it starts with 'uploads/', we need to see how uploadsBaseUrl is defined.
        // Assuming uploadsBaseUrl maps to the root domain + /uploads or similar.
        // If uploadsBaseUrl = '.../uploads/books', and coverImage = 'uploads/ebooks/...', we have a mismatch.
        // Let's assume we want to construct absolute URL relative to domain root if we don't have a better base.
        // Or if uploadsBaseUrl is strictly for 'uploads/books', we might need a generic base.

        // Fix: If ebook.coverImage is a relative path like 'uploads/ebooks/file.jpg', 
        // and we want to prevent double 'uploads' if uploadsBaseUrl includes it.

        // Better approach: Use apiBaseUrl's origin or just relative to root if serving static files correctly.
        // But for now, let's fix the duplication.

        // If coverImage is just a filename (old logic), append to uploadsBaseUrl
        if (!ebook.coverImage.includes('/')) {
            return `${this.uploadsBaseUrl}/${ebook.coverImage}`;
        }

        // If it is a relative path 'uploads/...'
        if (ebook.coverImage.startsWith('uploads/')) {
            // If uploadsBaseUrl ends with 'uploads/books', we might want to go up levels or just use window.location.origin
            // A safe bet if the backend serves 'uploads' statically:
            // return `${environment.apiBaseUrl.replace('/api', '')}/${ebook.coverImage}`;

            // Or simpler, if we know it's a relative path from server root:
            return `${environment.apiBaseUrl.replace('/api', '')}/${ebook.coverImage}`;
        }

        return `/${ebook.coverImage}`;
    }
}
