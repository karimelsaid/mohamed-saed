import { Component, OnInit, ElementRef, ViewChild, HostListener, AfterViewInit, OnDestroy, Input, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatAiService } from '../../services/chat-ai.service';
import { QuickActionsService } from '../../services/quick-actions.service';
import { HttpClient } from '@angular/common/http';
import { fromEvent, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

interface ChatButton {
  label: string;
  action: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  books?: Book[];
  buttons?: ChatButton[];
}

interface Book {
  id: string;
  title: string;
  author: string;
  price: string;
  buyUrl: string;
}

@Component({
  selector: 'app-chat-window',
  standalone: false,
  templateUrl: './chat-window.component.html',
  styleUrls: ['./chat-window.component.css']
})
export class ChatWindowComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() marginRight: number = 70;
  @Input() marginBottom: number = 110;

  messages: Message[] = [];
  newMessage: string = '';
  isLoading: boolean = false;
  conversationId: string | null = null;

  isVisible: boolean = false;
  darkMode: boolean = true;
  isTyping: boolean = false;

  @ViewChild('messagesContainer', { static: false }) messagesContainer!: ElementRef;
  @ViewChild('chatWindow', { static: false }) chatWindow!: ElementRef;

  isDragging: boolean = false;
  dragStartX: number = 0;
  dragStartY: number = 0;
  posX: number = 0;
  posY: number = 0;

  isFullscreen: boolean = false;

  chatWindowWidth: number = 320;
  chatWindowHeight: number = 400;

  private resizeSubscription!: Subscription;
  private initialWindowHeight: number = 0;
  private keyboardVisible: boolean = false;

  constructor(
    private chatAiService: ChatAiService,
    private quickActionsService: QuickActionsService,
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initialWindowHeight = window.innerHeight;
    }
  }

  // ===== استخراج الأزرار من نص الرد =====
  private extractButtons(text: string): { cleanText: string; buttons: ChatButton[] } {
    const buttons: ChatButton[] = [];
    const buttonRegex = /\[BUTTON:([^:]+):([^\]]+)\]/g;
    let match;

    while ((match = buttonRegex.exec(text)) !== null) {
      buttons.push({ label: match[1].trim(), action: match[2].trim() });
    }

    const cleanText = text.replace(/\[BUTTON:[^\]]+\]/g, '').trim();
    return { cleanText, buttons };
  }

  // ===== معالجة الضغط على زر =====
  onButtonClick(button: ChatButton): void {
    switch (button.action) {
      case 'REQUEST_BOOK':
        this.handleRequestBook();
        break;
      case 'NOTIFY_WHEN_AVAILABLE':
        this.handleNotifyWhenAvailable();
        break;
      case 'SHOW_ALTERNATIVES':
        this.newMessage = 'عرض بدائل مشابهة';
        this.sendMessage();
        break;
      default:
        this.newMessage = button.label;
        this.sendMessage();
    }
  }

  private handleRequestBook(): void {
    // إضافة رسالة تأكيد وإرسال طلب للـ API
    this.messages.push({
      role: 'system',
      content: 'جاري تسجيل طلبك لإضافة الكتاب...'
    });

    // استخراج اسم الكتاب من آخر رسائل المستخدم
    const lastUserMessage = [...this.messages]
      .reverse()
      .find(m => m.role === 'user');

    if (lastUserMessage) {
      this.http.post('/api/book-requests', {
        bookTitle: lastUserMessage.content,
        conversationId: this.conversationId
      }).subscribe({
        next: () => {
          this.messages.push({
            role: 'assistant',
            content: 'تم تسجيل طلبك بنجاح! سنعمل على إضافة الكتاب في أقرب وقت ممكن. 📚'
          });
          this.scrollToBottom();
        },
        error: () => {
          this.messages.push({
            role: 'assistant',
            content: 'تم تسجيل طلبك! سنتواصل معك عند توفر الكتاب.'
          });
          this.scrollToBottom();
        }
      });
    }
  }

  private handleNotifyWhenAvailable(): void {
    this.messages.push({
      role: 'assistant',
      content: 'للإبلاغ عند توفر الكتاب، يرجى التواصل معنا مباشرة على الرقم 01094612729 وسنضيفك لقائمة الانتظار. 📞'
    });
    this.scrollToBottom();
  }

  onQuickActionSelected(event: { action: string; data?: any }): void {
    let message = '';

    switch (event.action) {
      case 'recommend':
        if (event.data?.topic) {
          message = `رشح لي كتاب في مجال ${event.data.title}`;
        } else {
          message = 'رشح لي كتاباً';
        }
        break;
      case 'search':
        this.openSearchModal();
        return;
      case 'top_selling':
        this.loadTopSellingBooks();
        return;
      case 'newest':
        this.loadNewestBooks();
        return;
      case 'gift':
        message = 'رشح لي كتاباً كهدية';
        break;
      case 'category':
        if (event.data?.category) {
          this.loadBooksByCategory(event.data.category);
        }
        return;
      default:
        message = event.action;
    }

    if (message) {
      this.newMessage = message;
      this.sendMessage();
    }
  }

  onBookSelected(book: any): void {
    this.messages.push({
      role: 'assistant',
      content: `اخترت كتاب: ${book.title}`,
      books: [book]
    });
  }

  openSearchModal(): void {
    const searchTerm = prompt('أدخل اسم الكتاب:');
    if (searchTerm) {
      this.smartSearch(searchTerm);
    }
  }

  loadTopSellingBooks(): void {
    this.isLoading = true;
    this.quickActionsService.getTopSelling(5).subscribe({
      next: (books) => {
        this.isLoading = false;
        this.displayBooks(books, 'الأكثر مبيعاً');
      },
      error: () => {
        this.isLoading = false;
        this.messages.push({ role: 'assistant', content: 'حدث خطأ في تحميل الأكثر مبيعاً' });
      }
    });
  }

  loadNewestBooks(): void {
    this.isLoading = true;
    this.quickActionsService.getNewestBooks(5).subscribe({
      next: (books) => {
        this.isLoading = false;
        this.displayBooks(books, 'أحدث الكتب');
      },
      error: () => {
        this.isLoading = false;
        this.messages.push({ role: 'assistant', content: 'حدث خطأ في تحميل أحدث الكتب' });
      }
    });
  }

  loadBooksByCategory(category: string): void {
    this.isLoading = true;
    this.quickActionsService.searchByCategory(category, 10).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.displayBooks(response.data, `تصنيف: ${category}`);
      },
      error: () => {
        this.isLoading = false;
        this.messages.push({ role: 'assistant', content: 'حدث خطأ في تحميل الكتب حسب التصنيف' });
      }
    });
  }

  smartSearch(query: string): void {
    this.isLoading = true;
    this.quickActionsService.smartSearch(query, 10).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.displayBooks(response.data, `نتائج البحث: ${query}`);
      },
      error: () => {
        this.isLoading = false;
        this.messages.push({ role: 'assistant', content: 'حدث خطأ في البحث' });
      }
    });
  }

  displayBooks(books: any[], title: string): void {
    const formattedBooks = books.map(book => ({
      id: book.id,
      title: book.title,
      author: book.author,
      price: book.price,
      buyUrl: book.buyUrl
    }));

    this.messages.push({
      role: 'assistant',
      content: title,
      books: formattedBooks
    });
  }

  toggleFullscreen(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isFullscreen = !this.isFullscreen;
    if (this.isFullscreen) {
      this.posX = 0;
      this.posY = 0;
      this.chatWindowWidth = window.innerWidth;
      this.chatWindowHeight = window.innerHeight;
    } else {
      this.chatWindowWidth = 320;
      this.chatWindowHeight = 400;
      this.updatePosition();
    }
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.chatWindow && this.chatWindow.nativeElement) {
      const rect = this.chatWindow.nativeElement.getBoundingClientRect();
      this.chatWindowWidth = rect.width || 320;
      this.chatWindowHeight = rect.height || 150;
    }

    setTimeout(() => { this.updatePosition(); }, 100);

    this.resizeSubscription = fromEvent(window, 'resize')
      .pipe(debounceTime(200))
      .subscribe(() => { this.handleResize(); });
  }

  ngOnDestroy(): void {
    if (this.resizeSubscription) {
      this.resizeSubscription.unsubscribe();
    }
  }

  private handleResize(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const currentHeight = window.innerHeight;
    const heightDiff = this.initialWindowHeight - currentHeight;

    if (heightDiff > 150) {
      this.keyboardVisible = true;
      this.posY = currentHeight - this.chatWindowHeight - 20;
    } else {
      this.keyboardVisible = false;
      this.updatePosition();
    }
  }

  private updatePosition(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    let newPosX = window.innerWidth - this.chatWindowWidth - this.marginRight;
    let newPosY = window.innerHeight - this.chatWindowHeight - this.marginBottom;

    if (!this.keyboardVisible && !this.isFullscreen) {
      newPosX = Math.min(Math.max(0, newPosX), window.innerWidth - this.chatWindowWidth);
      newPosY = Math.min(Math.max(0, newPosY), window.innerHeight - this.chatWindowHeight);
      this.posX = newPosX;
      this.posY = newPosY;
    }
  }

  scrollToBottom(): void {
    try {
      setTimeout(() => {
        if (this.messagesContainer) {
          this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
        }
      }, 100);
    } catch (err) { }
  }

  sendMessage(): void {
    if (!this.newMessage.trim()) return;

    this.messages.push({ role: 'user', content: this.newMessage });
    this.scrollToBottom();

    const messageToSend = this.newMessage;
    this.newMessage = '';
    this.isLoading = true;
    this.isTyping = true;

    const apiMessages = this.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    this.chatAiService.sendMessage(
      apiMessages,
      this.conversationId,
      null,
      null,
      'gemini-2.5-flash',
      0.7,
      1000
    ).subscribe({
      next: (response) => {
        if (response.conversationId) {
          this.conversationId = response.conversationId;
        }

        if (response.success && response.data.choices && response.data.choices.length > 0) {
          const rawContent = response.data.choices[0].message.content;
          const books = response.data.books || [];

          // الأزرار بتيجي من الباكاند مباشرة أو نستخرجها من النص
          const backendButtons: ChatButton[] = response.data.buttons || [];
          const { cleanText, buttons: extractedButtons } = this.extractButtons(rawContent);
          const finalButtons = backendButtons.length > 0 ? backendButtons : extractedButtons;

          this.messages.push({
            role: 'assistant',
            content: cleanText,
            books: books,
            buttons: finalButtons.length > 0 ? finalButtons : undefined
          });
          this.scrollToBottom();
        }
        this.isLoading = false;
        this.isTyping = false;
      },
      error: () => {
        this.messages.push({
          role: 'assistant',
          content: 'عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.'
        });
        this.scrollToBottom();
        this.isLoading = false;
        this.isTyping = false;
      }
    });
  }

  toggleVisibility(): void {
    this.isVisible = !this.isVisible;
  }

  onDragStart(event: MouseEvent): void {
    this.isDragging = true;
    this.dragStartX = event.clientX - this.posX;
    this.dragStartY = event.clientY - this.posY;
    event.preventDefault();
  }

  onDragMove(event: MouseEvent): void {
    if (this.isDragging && isPlatformBrowser(this.platformId)) {
      this.posX = event.clientX - this.dragStartX;
      this.posY = event.clientY - this.dragStartY;

      const maxX = window.innerWidth - this.chatWindowWidth;
      const maxY = window.innerHeight - this.chatWindowHeight;
      if (this.posX < 0) this.posX = 0;
      if (this.posY < 0) this.posY = 0;
      if (this.posX > maxX) this.posX = maxX;
      if (this.posY > maxY) this.posY = maxY;
    }
  }

  onDragEnd(event: MouseEvent): void {
    this.isDragging = false;
  }

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.isDragging = true;
      this.dragStartX = event.touches[0].clientX - this.posX;
      this.dragStartY = event.touches[0].clientY - this.posY;
      event.preventDefault();
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (this.isDragging && event.touches.length === 1 && isPlatformBrowser(this.platformId)) {
      this.posX = event.touches[0].clientX - this.dragStartX;
      this.posY = event.touches[0].clientY - this.dragStartY;

      const maxX = window.innerWidth - this.chatWindowWidth;
      const maxY = window.innerHeight - this.chatWindowHeight;
      if (this.posX < 0) this.posX = 0;
      if (this.posY < 0) this.posY = 0;
      if (this.posX > maxX) this.posX = maxX;
      if (this.posY > maxY) this.posY = maxY;
      event.preventDefault();
    }
  }

  onTouchEnd(event: TouchEvent): void {
    this.isDragging = false;
    event.preventDefault();
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    this.onDragMove(event);
  }

  @HostListener('window:mouseup', ['$event'])
  onWindowMouseUp(event: MouseEvent): void {
    this.onDragEnd(event);
  }

  sanitize(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  openBookDetails(buyUrl: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const isAndroid = /android/i.test(navigator.userAgent);
    if (isAndroid) {
      window.location.href = buyUrl;
    } else {
      window.open(buyUrl, '_blank');
    }
  }
}