import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faWallet, faChartLine, faLink, faTrophy, faUserCircle, faCheckCircle, faClock, faMoneyBillWave, faArrowTrendUp, faSearch, faInfoCircle, faPaperPlane, faCopy } from '@fortawesome/free-solid-svg-icons';
import { MarketerService } from '../services/marketer.service';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';

@Component({
  selector: 'app-marketer-hub',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule, FormsModule],
  templateUrl: './marketer-hub.component.html',
  styleUrls: ['./marketer-hub.component.css']
})
export class MarketerHubComponent implements OnInit {
  // Icons
  faWallet = faWallet;
  faChartLine = faChartLine;
  faLink = faLink;
  faTrophy = faTrophy;
  faUserCircle = faUserCircle;
  faCheckCircle = faCheckCircle;
  faClock = faClock;
  faMoneyBillWave = faMoneyBillWave;
  faArrowTrendUp = faArrowTrendUp;
  faSearch = faSearch;
  faInfoCircle = faInfoCircle;
  faPaperPlane = faPaperPlane;
  faCopy = faCopy;

  // App State
  isApproved = false;
  applicationStatus = 'none'; // 'none', 'pending', 'rejected'
  rejectionReason = '';
  marketerBio = '';
  submittingApp = false;

  stats: any = {};
  recentOrders: any[] = [];
  referralLinks: any[] = [];
  tasks: any[] = [];
  prizes: any[] = [];
  
  loading = true;
  generatingLink = false;
  
  // Link Generator Search
  searchQuery = '';
  searchResults: any[] = [];
  selectedProduct: any = null;
  trendingProducts: any[] = [];
  opportunityStats: any = {};
  activeTab: 'dashboard' | 'products' | 'quests' = 'dashboard';
  generatedLink = '';
  private searchSubject = new Subject<string>();

  constructor(private marketerService: MarketerService) {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(query => query ? this.marketerService.searchProducts(query) : [])
    ).subscribe((res: any) => {
      this.searchResults = res.success ? res.products : [];
    });
  }

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard() {
    this.loading = true;
    this.marketerService.getDashboardStats().subscribe({
      next: (res) => {
        this.isApproved = res.isApproved;
        if (this.isApproved) {
          this.stats = res.stats;
          this.recentOrders = res.recentOrders;
          this.referralLinks = res.referralLinks;
          this.tasks = res.tasks;
          this.prizes = res.prizes;
          this.loadOpportunities();
        } else {
          this.applicationStatus = res.applicationStatus;
          this.rejectionReason = res.rejectionReason;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading marketer dashboard', err);
        this.loading = false;
      }
    });
  }

  loadOpportunities() {
    this.marketerService.getOpportunities().subscribe({
      next: (res) => {
        if (res.success) {
          this.trendingProducts = res.trendingProducts;
          this.opportunityStats = res.stats;
          // Merge tasks from opportunities if richer
          if (res.quests && res.quests.length > 0) {
            this.tasks = res.quests;
          }
        }
      }
    });
  }

  generateQuickLink(product: any) {
    this.generatingLink = true;
    this.marketerService.generateLink(product.barcode || product.id, 'book').subscribe({
      next: (res) => {
        this.generatedLink = res.link;
        this.generatingLink = false;
        product.alreadyHasLink = true;
        this.loadDashboard(); // Refresh links list
      },
      error: (err) => {
        console.error('Error generating link', err);
        this.generatingLink = false;
      }
    });
  }

  generateTaskLink(quest: any) {
    if (!quest.targetId) return;
    this.generatingLink = true;
    this.marketerService.generateLink(quest.targetId, quest.targetType || 'book').subscribe({
      next: (res) => {
        this.generatedLink = res.link;
        this.generatingLink = false;
        this.activeTab = 'dashboard'; // Take user to see the link
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.loadDashboard();
      },
      error: (err) => {
        console.error('Error generating link for task', err);
        this.generatingLink = false;
      }
    });
  }

  submitApplication() {
    this.submittingApp = true;
    this.marketerService.apply(this.marketerBio).subscribe({
      next: (res) => {
        this.applicationStatus = 'pending';
        this.submittingApp = false;
      },
      error: (err) => {
        alert('خطأ في إرسال الطلب');
        this.submittingApp = false;
      }
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
    if (imagePath.startsWith('/uploads')) {
        return `https://knoozbook.com${imagePath}`;
    }

    // If it looks like a barcode (only numbers) and has no extension, add .webp
    let finalPath = cleanPath;
    if (/^\d+$/.test(cleanPath) && !cleanPath.includes('.')) {
        finalPath = `${cleanPath}.webp`;
    }
    
    return `https://knoozbook.com/uploads/${finalPath}`;
  }

  onSearch(query: string) {
    this.searchSubject.next(query);
  }

  selectProduct(product: any) {
    this.selectedProduct = product;
    this.searchQuery = product.product_name;
    this.searchResults = [];
  }

  generateLink() {
    if (!this.selectedProduct) return;
    this.generatingLink = true;
    this.marketerService.generateLink(this.selectedProduct.barcode, 'book').subscribe({
      next: (res) => {
        this.generatedLink = res.link;
        this.generatingLink = false;
      },
      error: (err) => {
        console.error('Error generating link', err);
        this.generatingLink = false;
      }
    });
  }

  copySuccess = false;
  copyLink(link?: string) {
    const textToCopy = link || this.generatedLink;
    navigator.clipboard.writeText(textToCopy);
    this.copySuccess = true;
    setTimeout(() => this.copySuccess = false, 2000);
  }

  claimPrize(prizeId: string) {
    this.marketerService.claimPrize(prizeId).subscribe({
      next: (res) => {
        alert('تم طلب الجائزة بنجاح!');
        this.loadDashboard();
      },
      error: (err) => alert('خطأ في طلب الجائزة')
    });
  }

  getLevelLabel(level: number): string {
    const lv = level || 1;
    if (lv >= 10) return 'مسوق أسطوري';
    if (lv >= 7) return 'مسوق خبير';
    if (lv >= 4) return 'مسوق محترف';
    if (lv >= 2) return 'مسوق نشط';
    return 'مسوق مبتدئ';
  }

  getQuestProgress(quest: any): number {
    if (!quest.target || quest.target === 0) return 0;
    const progress = (quest.current / quest.target) * 100;
    return Math.min(100, Math.max(0, progress));
  }
}
