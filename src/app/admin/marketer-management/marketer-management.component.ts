import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faUsers, faUserPlus, faPercentage, faTrophy, faTasks, faCheck, faTimes, faEdit, faClipboardList, faEnvelopeOpenText, faUserClock } from '@fortawesome/free-solid-svg-icons';
import { AdminService } from '../../services/admin.service';
import { MarketerService } from '../../services/marketer.service';

@Component({
  selector: 'app-marketer-management',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './marketer-management.component.html',
  styleUrls: ['./marketer-management.component.css']
})
export class MarketerManagementComponent implements OnInit {
  faUsers = faUsers;
  faUserPlus = faUserPlus;
  faPercentage = faPercentage;
  faTrophy = faTrophy;
  faTasks = faTasks;
  faCheck = faCheck;
  faTimes = faTimes;
  faEdit = faEdit;
  faClipboardList = faClipboardList;
  faEnvelopeOpenText = faEnvelopeOpenText;
  faUserClock = faUserClock;

  marketers: any[] = [];
  pendingApplications: any[] = [];
  loading = true;
  loadingApps = false;
  activeTab: 'list' | 'pending' | 'global_prizes' = 'list';
  
  selectedMarketer: any = null;
  newTask: any = { title: '', description: '', target: 0, reward: 0, deadline: '', targetId: '', targetType: 'book' };
  
  // Global Prizes
  globalPrizes: any[] = [];
  globalPrizeForm = { title: '', value: '', minLevel: 1 };

  // Book Search for Tasks
  bookSearchQuery = '';
  bookResults: any[] = [];
  selectedBook: any = null;

  showAddModal = false;
  promoteEmail = '';
  isPromoting = false;

  newPrize: any = { title: '', value: '' };

  constructor(
    private adminService: AdminService,
    private marketerService: MarketerService
  ) {}

  searchBooks(query: string) {
    if (!query || query.length < 2) {
      this.bookResults = [];
      return;
    }
    this.marketerService.searchProducts(query).subscribe({
      next: (res: any) => {
        this.bookResults = res.products || [];
      }
    });
  }

  selectBook(book: any) {
    this.selectedBook = book;
    this.newTask.targetId = book.barcode;
    this.newTask.targetType = 'book';
    this.bookSearchQuery = book.product_name;
    this.bookResults = [];
  }

  ngOnInit(): void {
    this.loadMarketers();
    this.loadApplications();
    this.loadGlobalPrizes();
  }

  loadGlobalPrizes() {
    this.adminService.getGlobalPrizes().subscribe({
      next: (res: any) => this.globalPrizes = res.prizes || [],
      error: (err) => console.error('Error loading global prizes', err)
    });
  }

  addGlobalPrize() {
    if (!this.globalPrizeForm.title) return;
    this.adminService.addGlobalPrize(this.globalPrizeForm).subscribe({
      next: () => {
        alert('تم إضافة الجائزة العامة بنجاح');
        this.globalPrizeForm = { title: '', value: '', minLevel: 1 };
        this.loadGlobalPrizes();
      },
      error: () => alert('خطأ في إضافة الجائزة العامة')
    });
  }

  removeGlobalPrize(id: string) {
    if (!confirm('هل انت متأكد من حذف هذه الجائزة من جميع المسوقين؟')) return;
    this.adminService.removeGlobalPrize(id).subscribe({
      next: () => {
        alert('تم الحذف بنجاح');
        this.loadGlobalPrizes();
      },
      error: () => alert('خطأ في الحذف')
    });
  }

  loadMarketers() {
    this.loading = true;
    console.log('🔄 [ADMIN_UI] Requesting marketer list...');
    this.adminService.listMarketers().subscribe({
      next: (res: any) => {
        console.log(`📊 [ADMIN_UI] Received ${res.marketers?.length || 0} marketers from API.`);
        this.marketers = res.marketers || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('❌ [ADMIN_UI] Error loading marketers:', err);
        this.loading = false;
      }
    });
  }

  loadApplications() {
    this.loadingApps = true;
    console.log('🔄 [ADMIN_UI] Requesting pending applications...');
    this.marketerService.getPendingApplications().subscribe({
      next: (res: any) => {
        console.log(`📊 [ADMIN_UI] Received ${res.applications?.length || 0} pending applications.`);
        this.pendingApplications = res.applications || [];
        this.loadingApps = false;
      },
      error: (err) => {
        console.error('❌ [ADMIN_UI] Error loading applications:', err);
        this.loadingApps = false;
      }
    });
  }

  approveApp(userId: string) {
    if (!confirm('هل أنت متأكد من قبول هذا المسوق؟')) return;
    this.marketerService.processApplication(userId, 'approved').subscribe({
      next: () => {
        alert('تم القبول بنجاح');
        this.loadApplications();
        this.loadMarketers();
      },
      error: () => alert('خطأ في معالجة الطلب')
    });
  }

  rejectApp(userId: string) {
    const reason = prompt('يرجى إدخال سبب الرفض:');
    if (reason === null) return;
    
    this.marketerService.processApplication(userId, 'rejected', reason).subscribe({
      next: () => {
        alert('تم رفض الطلب');
        this.loadApplications();
      },
      error: () => alert('خطأ في معالجة الطلب')
    });
  }

  promoteUser(email: string) {
    if (!email) return;
    this.isPromoting = true;
    this.adminService.promoteToMarketer(email).subscribe({
      next: () => {
        alert('تمت الترقية بنجاح');
        this.isPromoting = false;
        this.showAddModal = false;
        this.promoteEmail = '';
        this.loadMarketers();
      },
      error: (err: any) => {
        alert('خطأ في الترقية: ' + (err.error?.message || 'تعذر العثور على المستخدم'));
        this.isPromoting = false;
      }
    });
  }

  updateConfig(marketer: any) {
    const userId = marketer._id;
    const config = {
      commissionRate: marketer.marketer.commissionRate,
      level: marketer.marketer.level,
      levelLabel: marketer.marketer.levelLabel
    };
    this.adminService.updateMarketerConfig(userId, config).subscribe({
      next: () => alert('تم التحديث بنجاح'),
      error: () => alert('خطأ في التحديث')
    });
  }

  assignTask(userId: string) {
    if (!this.newTask.title || !this.newTask.target) {
      alert('يرجى ملء البيانات الأساسية للمهمة');
      return;
    }
    this.adminService.assignMarketerTask(userId, this.newTask).subscribe({
      next: () => {
        alert('تم تعيين المهمة');
        this.newTask = { title: '', description: '', target: 0, reward: 0, deadline: '', targetId: '', targetType: 'book' };
        this.bookSearchQuery = '';
        this.selectedBook = null;
        this.bookResults = [];
        this.selectedMarketer = null;
        this.loadMarketers();
      },
      error: () => alert('خطأ في تعيين المهمة')
    });
  }

  getImgUrl(imagePath: string): string {
    if (!imagePath) return 'assets/book-placeholder.jpg';
    if (imagePath.startsWith('http')) return imagePath;
    
    // Cleanup leading slashes
    let cleanPath = imagePath;
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
    
    // Check if it already contains uploads
    if (cleanPath.startsWith('uploads/')) {
        return `https://knoozbook.com/${cleanPath}`;
    }
    
    return `https://knoozbook.com/uploads/${cleanPath}`;
  }

  addPrize() {
    if (!this.selectedMarketer || !this.newPrize.title) return;
    this.adminService.addMarketerPrize(this.selectedMarketer._id, this.newPrize).subscribe({
      next: () => {
        alert('تم إضافة الجائزة بنجاح');
        this.newPrize = { title: '', value: '' };
        this.loadMarketers(); // Refresh to get updated prizes
        this.selectedMarketer = null; // Close modal
      },
      error: () => alert('خطأ في إضافة الجائزة')
    });
  }

  removePrize(marketerId: string, prizeId: string) {
    if (!confirm('هل انت متأكد من حذف هذه الجائزة؟')) return;
    this.adminService.removeMarketerPrize(marketerId, prizeId).subscribe({
      next: () => {
        alert('تم حذف الجائزة بنجاح');
        this.loadMarketers();
        this.selectedMarketer = null;
      },
      error: () => alert('خطأ في حذف الجائزة')
    });
  }
}
