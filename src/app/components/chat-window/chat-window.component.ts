import { Component, OnInit, ElementRef, ViewChild, HostListener, AfterViewInit, OnDestroy, Input, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatAiService } from '../../services/chat-ai.service';
import { fromEvent, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

  isVisible: boolean = false; // للتحكم في ظهور الدردشة
  darkMode: boolean = true; // تفعيل الوضع الداكن افتراضياً

  isTyping: boolean = false; // مؤشر الكتابة

  @ViewChild('messagesContainer', { static: false }) messagesContainer!: ElementRef;
  @ViewChild('chatWindow', { static: false }) chatWindow!: ElementRef;

  // متغيرات تحريك النافذة
  isDragging: boolean = false;
  dragStartX: number = 0;
  dragStartY: number = 0;
  posX: number = 0;
  posY: number = 0;

  isFullscreen: boolean = false; // حالة ملء الشاشة

  chatWindowWidth: number = 320;
  chatWindowHeight: number = 400;

  private resizeSubscription!: Subscription;
  private initialWindowHeight: number = 0;
  private keyboardVisible: boolean = false;

  constructor(
    private chatAiService: ChatAiService,
    private sanitizer: DomSanitizer,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initialWindowHeight = window.innerHeight;
    }
    // يمكن إضافة رسالة ترحيبية افتراضية
    this.messages.push({
      role: 'system',
      content: 'مرحباً! هل تريدني مساعدتك في اختيار كتاب؟'
    });
  }

  toggleFullscreen(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isFullscreen = !this.isFullscreen;
    if (this.isFullscreen) {
      // عند تفعيل ملء الشاشة، اضبط الموضع والحجم ليملأ الشاشة
      this.posX = 0;
      this.posY = 0;
      this.chatWindowWidth = window.innerWidth;
      this.chatWindowHeight = window.innerHeight;
    } else {
      // عند إلغاء ملء الشاشة، أعد تعيين الموضع والحجم الافتراضي
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

    // تعيين الموضع الأولي مع تأخير بسيط للسماح باستقرار التخطيط
    setTimeout(() => {
      this.updatePosition();
    }, 100);

    // الاشتراك في حدث تغيير حجم النافذة مع debounce لتقليل عدد مرات التحديث
    this.resizeSubscription = fromEvent(window, 'resize')
      .pipe(debounceTime(200))
      .subscribe(() => {
        this.handleResize();
      });
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
    const keyboardThreshold = 150; // px, threshold to detect keyboard

    if (heightDiff > keyboardThreshold) {
      // Keyboard is likely visible
      this.keyboardVisible = true;
      // Adjust marginBottom or posY to keep chat window above keyboard
      this.posY = currentHeight - this.chatWindowHeight - 20; // 20px margin above keyboard
    } else {
      // Keyboard hidden
      this.keyboardVisible = false;
      this.updatePosition();
    }
  }

  private updatePosition(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    let newPosX = window.innerWidth - this.chatWindowWidth - this.marginRight;
    let newPosY = window.innerHeight - this.chatWindowHeight - this.marginBottom;

    // If keyboard visible, posY is already adjusted in handleResize
    if (!this.keyboardVisible && !this.isFullscreen) {
      // تقييد الموضع ضمن حدود الشاشة
      newPosX = Math.min(Math.max(0, newPosX), window.innerWidth - this.chatWindowWidth);
      newPosY = Math.min(Math.max(0, newPosY), window.innerHeight - this.chatWindowHeight);
      if (this.posX !== newPosX || this.posY !== newPosY) {
        this.posX = newPosX;
        this.posY = newPosY;
        console.log('updatePosition:', { posX: this.posX, posY: this.posY, width: this.chatWindowWidth, height: this.chatWindowHeight });
      }
    }
  }

  scrollToBottom(): void {
    try {
      setTimeout(() => {
        if (this.messagesContainer) {
          this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
        }
      }, 100);
    } catch (err) {
      console.error('Scroll to bottom failed:', err);
    }
  }

  sendMessage(): void {
    if (!this.newMessage.trim()) return;

    // إضافة رسالة المستخدم إلى المحادثة
    this.messages.push({
      role: 'user',
      content: this.newMessage
    });

    this.scrollToBottom();

    const messageToSend = this.newMessage;
    this.newMessage = '';
    this.isLoading = true;
    this.isTyping = true; // بدء مؤشر الكتابة

    // تحضير مصفوفة الرسائل للإرسال إلى API
    const apiMessages = this.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // إرسال الرسالة إلى خدمة الذكاء الاصطناعي بدون اختيار مزود (OpenRouter فقط)
    this.chatAiService.sendMessage(apiMessages)
      .subscribe({
        next: (response) => {
          // إضافة رد المساعد إلى المحادثة
          if (response.success && response.data.choices && response.data.choices.length > 0) {
            const assistantMessage = response.data.choices[0].message;
            this.messages.push({
              role: 'assistant',
              content: assistantMessage.content
            });
            this.scrollToBottom();
          }
          this.isLoading = false;
          this.isTyping = false; // إيقاف مؤشر الكتابة عند استلام الرد
        },
        error: (error) => {
          console.error('حدث خطأ أثناء إرسال الرسالة:', error);
          this.messages.push({
            role: 'assistant',
            content: 'عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.'
          });
          this.scrollToBottom();
          this.isLoading = false;
          this.isTyping = false; // إيقاف مؤشر الكتابة عند الخطأ
        }
      });
  }

  toggleVisibility(): void {
    this.isVisible = !this.isVisible;
  }

  // دعم السحب بالماوس
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

  // دعم السحب باللمس
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
}
