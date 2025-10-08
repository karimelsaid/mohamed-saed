import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCopy, faShareAlt, faMoneyBillWave, faLink, faTimes } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../auth/auth.service';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { Book } from '../book';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-referrals',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule, FormsModule],
  templateUrl: './referrals.component.html',
  styleUrls: ['./referrals.component.css']
})
export class ReferralsComponent implements OnInit {
  faCopy = faCopy;
  faShareAlt = faShareAlt;
  faMoneyBillWave = faMoneyBillWave;
  faLink = faLink;
  faTimes = faTimes;

  referralBalance: number = 0;
  referralCode: string = '';
  referrals: any[] = [];
  currentBookId: string = '';
  referralLink: string = '';
  bookName: string = '';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private dataService: DataService
  ) { }

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      if (user && user.id) {
        this.loadReferralData(user.id);
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
    this.authService.user$.subscribe(user => {
      if (user && user.id) {
        this.http.post(`${environment.apiBaseUrl}/users/request-payment`, { userId: user.id }).subscribe({
          next: (response: any) => {
            alert('تم إرسال طلب الدفع بنجاح');
          },
          error: (error) => {
            console.error('Error requesting payment:', error);
          }
        });
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
  }
}
