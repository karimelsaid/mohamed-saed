import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCopy, faShareAlt, faMoneyBillWave, faLink, faTimes, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../auth/auth.service';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { Book } from '../book';
import { environment } from '../../environments/environment';
import { User } from '../auth/user.model';
import { switchMap, take } from 'rxjs/operators';

@Component({
  selector: 'app-referrals',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule, FormsModule],
  templateUrl: './referrals.component.html',
  styleUrls: ['./referrals.component.css']
})
export class ReferralsComponent implements OnInit {
  @Output() closeModalEvent = new EventEmitter<void>();

  faCopy = faCopy;
  faShareAlt = faShareAlt;
  faMoneyBillWave = faMoneyBillWave;
  faLink = faLink;
  faTimes = faTimes;
  faGlobe = faGlobe;

  referralBalance: number = 0;
  referralCode: string = '';
  referrals: any[] = [];
  currentBookId: string = '';
  referralLink: string = '';
  bookName: string = '';
  isRequestingPayment = false; // Add this property
  user: User | null = null;
  allBooks: Book[] = [];
  filteredBooks: Book[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private dataService: DataService
  ) { }

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      this.user = user;
      if (user && user.id) {
        this.loadReferralData(user.id);
      }
    });
    this.dataService.getData().subscribe(books => {
      if (books) {
        this.allBooks = books;
        this.filteredBooks = books;
      }
    });
  }

  loadReferralData(userId: string) {
    // Load balance
    this.http.get(`${environment.apiBaseUrl}/users/referral-balance/${userId}`).subscribe({
      next: (response: any) => {
        this.referralBalance = response.balance;
        this.referralCode = response.referralCode;
      },
      error: (error) => {
        console.error('Error loading referral balance:', error);
      }
    });

    // Load referrals
    this.http.get(`${environment.apiBaseUrl}/users/referrals/${userId}`).subscribe({
      next: (response: any) => {
        this.referrals = response.referrals;
      },
      error: (error) => {
        console.error('Error loading referrals:', error);
      }
    });
  }

  requestPayment() {
    if (this.isRequestingPayment) {
      return;
    }
    this.isRequestingPayment = true;

    this.authService.user$.pipe(
      take(1), // Get the current user value once and then unsubscribe
      switchMap(user => {
        if (!user || !user.id) {
          throw new Error('User not logged in');
        }
        return this.http.post(`${environment.apiBaseUrl}/payment-requests/request`, { userId: user.id });
      })
    ).subscribe({
      next: (response: any) => {
        alert('تم إرسال طلب الدفع بنجاح');
        this.isRequestingPayment = false;
        this.authService.user$.pipe(take(1)).subscribe(user => user && this.loadReferralData(user.id)); // Refresh balance
      },
      error: (error) => {
        console.error('Payment request failed:', error);
        alert(`فشل طلب الدفع: ${error.error?.message || 'حدث خطأ غير متوقع'}`);
        this.isRequestingPayment = false;
      }
    });
  }

  generateReferralLink(bookId: string) {
    this.currentBookId = bookId;
    // First, get the book name from the data service
    this.dataService.getData().subscribe((books: Book[]) => {
      const book = books.find((b: Book) => b.products_id.toString() === bookId);
      if (!book) {
        alert('لم يتم العثور على الكتاب بالمعرف المدخل.');
        return;
      }
      this.bookName = book.product_name;

      // Now, generate the link with the book name
      this.authService.user$.subscribe(user => {
        if (user && user.id) {
          this.http.post(`${environment.apiBaseUrl}/users/generate-referral-link`, {
            userId: user.id,
            bookId,
            bookName: this.bookName // Send book name to backend
          }).subscribe({
          next: (response: any) => {
            this.referralLink = response.link;
          },
          error: (error) => {
            console.error('Error generating referral link:', error);
          }
        });
        }
      });
    })
  }

  generateGeneralReferralLink() {
    this.authService.user$.pipe(take(1)).subscribe(user => {
      if (user && user.referralCode) {
        // The base URL of your application
        const baseUrl = window.location.origin;
        // Construct the general referral link for registration
        this.referralLink = `${baseUrl}/register?ref=${user.referralCode}`;
      } else {
        alert('لا يمكن إنشاء رابط الإحالة. الرجاء المحاولة مرة أخرى.');
        console.error('User or referral code is missing.');
      }
    });
  }


  copyLink() {
    navigator.clipboard.writeText(this.referralLink);
    alert('تم نسخ الرابط!');
  }

  shareLink() {
    if (navigator.share) {
      navigator.share({
        title: 'شارك هذا الكتاب',
        text: 'تحقق من هذا الكتاب المثير!',
        url: this.referralLink
      });
    } else {
      this.copyLink();
    }
  }

  closeModal() {
    this.referralLink = '';
    this.currentBookId = '';
    this.closeModalEvent.emit();
  }

  copyId(bookId: string) {
    navigator.clipboard.writeText(bookId);
    alert('تم نسخ رقم الكتاب!');
  }

  filterBooks(value: string) {
    const searchTerm = value.toLowerCase();
    if (!searchTerm) {
      this.filteredBooks = this.allBooks;
    } else {
      this.filteredBooks = this.allBooks.filter(book =>
        (book.product_name && book.product_name.toLowerCase().includes(searchTerm)) ||
        (book.products_id && book.products_id.toString().toLowerCase().includes(searchTerm))
      );
    }
  }

  deleteReferral(referralId: string) {
    if (confirm('هل أنت متأكد من حذف هذه الإحالة؟')) {
      this.authService.user$.pipe(take(1)).subscribe(user => {
        if (user && user.id) {
          this.http.delete(`${environment.apiBaseUrl}/users/referrals/${user.id}/${referralId}`).subscribe({
            next: (response: any) => {
              alert('تم حذف الإحالة بنجاح');
              this.loadReferralData(user.id); // Refresh the list
            },
            error: (error) => {
              console.error('Error deleting referral:', error);
              alert('حدث خطأ أثناء حذف الإحالة');
            }
          });
        }
      });
    }
  }
}
