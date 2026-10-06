import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { environment } from '../../../../../environments/environment';

interface AudioSegment {
  index: number;
  start: number;
  end: number;
  duration: number;
  file: string;
  audio_data?: string; // Base64 encoded audio data
  transcribed: boolean;
  results?: TranscriptionResult[];
  wordCount?: number;
  jobId?: string;
  status?: 'pending' | 'processing' | 'completed' | 'error';
}

interface AudioDurationInfo {
  duration_seconds: number;
  duration_minutes: number;
  requires_splitting: boolean;
  suggested_segments: number;
}

interface TranscriptionResult {
  start: number;
  end: number;
  text: string;
  type: 'quran' | 'speech';
  verified: boolean;
  match?: {
    surah_number: number;
    surah_name: string;
    ayah_number: number;
    original_text: string;
    confidence: number;
  };
}

interface TranscriptionResponse {
  success: boolean;
  language: string;
  language_confidence: number;
  lecture_type: string;
  total_segments: number;
  quran_segments: number;
  results: TranscriptionResult[];
}

@Component({
  selector: 'app-lecture-transcription',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './lecture-transcription.component.html',
  styleUrls: ['./lecture-transcription.component.css']
})
export class LectureTranscriptionComponent implements OnInit {
  selectedFile: File | null = null;
  lectureType: string = 'general';
  recitationStyle: string = 'hafs';
  isProcessing: boolean = false;
  currentStep: number = 0; // 0: None, 1: Checking, 2: Transcribing, 3: Matching, 4: Done
  processingProgress: string = '';
  results: TranscriptionResult[] = [];
  totalSegments: number = 0;
  quranSegments: number = 0;
  errorMessage: string = '';
  apiReady: boolean = false;
  
  progressPercent: number = 0;
  progressInterval: any;
  
  editingSegmentIndex: number | null = null;
  editedText: string = '';
  totalWordCount: number = 0;
  
  // Segment management
  audioSegments: AudioSegment[] = [];
  currentSegmentIndex: number = 0;
  requiresSplitting: boolean = false;
  isSegmentedMode: boolean = false;

  // Warning modal
  showWarningModal: boolean = false;
  warningDuration: number | null = null;
  warningSegments: number = 0;

  // Format warning modal
  showFormatWarningModal: boolean = false;

  private readonly API_URL = environment.transcriptionApiUrl;
  audioUrl: SafeUrl | null = null;
  private rawAudioUrl: string | null = null;
  playbackRate: number = 1.0;
  isPlayingSegment: boolean = false;
  private segmentEndCheckInterval: any;

  constructor(private http: HttpClient, private sanitizer: DomSanitizer, private route: ActivatedRoute) {
    this.checkApiHealth();
  }

  ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      if (params['url']) {
        this.isProcessing = true;
        this.processingProgress = 'جاري جلب الملف الصوتي...';
        try {
          let audioUrl = params['url'];
          
          if (audioUrl.startsWith('capacitor://') || audioUrl.startsWith('file://') || audioUrl.startsWith('http://localhost') || audioUrl.startsWith('ionic://')) {
             audioUrl = Capacitor.convertFileSrc(audioUrl);
          }
          
          const response = await fetch(audioUrl);
          if (!response.ok) throw new Error('فشل تحميل الملف');
          
          const blob = await response.blob();
          const fileName = params['title'] ? `${params['title']}.mp3` : 'lesson.mp3';
          this.selectedFile = new File([blob], fileName, { type: blob.type || 'audio/mpeg' });
          
          this.errorMessage = '';
          this.results = [];
          if (this.rawAudioUrl) {
            URL.revokeObjectURL(this.rawAudioUrl);
          }
          this.rawAudioUrl = URL.createObjectURL(this.selectedFile);
          this.audioUrl = this.sanitizer.bypassSecurityTrustUrl(this.rawAudioUrl);
          
          this.isProcessing = false;
        } catch (e) {
          console.error(e);
          this.errorMessage = 'حدث خطأ أثناء جلب الملف: قد يكون حجمه كبيراً جداً أو الرابط غير متاح';
          this.isProcessing = false;
        }
      }
    });
  }

  checkApiHealth() {
    this.http.get<any>(`${this.API_URL}/health`).subscribe({
      next: (res) => {
        this.apiReady = res.status === 'ok' && res.model_loaded && res.index_loaded;
      },
      error: () => {
        this.apiReady = false;
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Check file format
      const extension = file.name.split('.').pop().toLowerCase();
      if (extension === 'opus' || extension === 'ogg') {
        this.showFormatWarningModal = true;
        return;
      }

      this.selectedFile = file;
      this.errorMessage = '';
      this.results = [];
      if (this.rawAudioUrl) {
        URL.revokeObjectURL(this.rawAudioUrl);
      }
      this.rawAudioUrl = URL.createObjectURL(file);
      this.audioUrl = this.sanitizer.bypassSecurityTrustUrl(this.rawAudioUrl);
    }
  }

  closeFormatWarningModal() {
    this.showFormatWarningModal = false;
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  startTranscription() {
    if (!this.selectedFile) return;

    this.isProcessing = true;
    this.currentStep = 1;
    this.processingProgress = 'جاري التحقق من مدة الملف...';
    this.errorMessage = '';
    this.results = [];
    this.progressPercent = 0;

    // First check duration
    this.checkAudioDuration();
  }

  checkAudioDuration() {
    if (!this.selectedFile) return;

    this.currentStep = 1;
    this.processingProgress = 'جاري التحقق من مدة الملف...';

    const formData = new FormData();
    formData.append('file', this.selectedFile as File);

    this.http.post<AudioDurationInfo>(`${this.API_URL}/check-duration`, formData).subscribe({
      next: (info) => {
        if (info.requires_splitting) {
          this.requiresSplitting = true;
          this.warningDuration = info.duration_minutes;
          this.warningSegments = info.suggested_segments;
          this.showWarningModal = true;
        } else {
          this.uploadAndTranscribe();
        }
      },
      error: (err) => {
        console.error('Error checking duration:', err);
        this.uploadAndTranscribe(); // Proceed if check fails
      }
    });
  }

  closeWarningModal() {
    this.showWarningModal = false;
    this.warningDuration = null;
    this.warningSegments = 0;
    this.isProcessing = false;
    this.currentStep = 0;
  }

  confirmSplit() {
    this.showWarningModal = false;
    this.splitAudio(this.warningSegments);
  }

  splitAudio(numSegments: number) {
    this.isSegmentedMode = true;
    this.processingProgress = 'جاري تقسيم الملف...';

    const formData = new FormData();
    formData.append('file', this.selectedFile as File);
    formData.append('segment_duration', '120'); // 2 minutes per segment

    this.http.post<any>(`${this.API_URL}/split`, formData).subscribe({
      next: (res) => {
        console.log('Split response:', res);
        console.log('First segment audio_data:', res.segments[0]?.audio_data ? 'exists' : 'missing');
        this.audioSegments = res.segments.map((seg: any) => ({
          ...seg,
          transcribed: false,
          status: 'pending' as const
        }));
        this.currentSegmentIndex = 0;
        this.currentStep = 2;
        this.processingProgress = `تم تقسيم الملف إلى ${res.total_segments} مقاطع`;

        // Auto-start first segment
        setTimeout(() => {
          this.transcribeSegment(0);
        }, 500);
      },
      error: (err) => {
        this.errorMessage = 'خطأ في تقسيم الملف: ' + (err.error?.detail || 'يرجى المحاولة مرة أخرى');
        this.isProcessing = false;
        this.currentStep = 0;
        this.isSegmentedMode = false;
      }
    });
  }

  transcribeSegment(index: number) {
    if (index >= this.audioSegments.length) {
      // All segments done
      this.currentStep = 4;
      this.isProcessing = false;
      this.processingProgress = 'تمت معالجة جميع المقاطع بنجاح!';
      this.isSegmentedMode = false;
      return;
    }

    this.currentSegmentIndex = index;
    this.isProcessing = true;
    this.processingProgress = `جاري معالجة المقطع ${index + 1} من ${this.audioSegments.length}...`;

    this.audioSegments[index].status = 'processing';

    const segment = this.audioSegments[index];
    const formData = new FormData();

    // Always use original file with segment boundaries
    formData.append('file', this.selectedFile as File);
    formData.append('segment_start', segment.start.toString());
    formData.append('segment_end', segment.end.toString());

    formData.append('lecture_type', this.lectureType);
    formData.append('recitation_style', this.recitationStyle);

    this.http.post<any>(`${this.API_URL}/transcribe-segment`, formData).subscribe({
      next: (res) => {
        this.audioSegments[index].jobId = res.job_id;
        this.pollSegmentStatus(index, res.job_id);
      },
      error: (err) => {
        this.audioSegments[index].status = 'error';
        this.errorMessage = 'خطأ في معالجة المقطع: ' + (err.error?.detail || 'يرجى المحاولة مرة أخرى');
        this.isProcessing = false;
      }
    });
  }

  base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    const sliceSize = 512;

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: mimeType });
  }

  pollSegmentStatus(index: number, jobId: string) {
    let errorCount = 0;
    const pollInterval = setInterval(() => {
      this.http.get<any>(`${this.API_URL}/status/${jobId}`).subscribe({
        next: (res) => {
          errorCount = 0;
          if (res.status === 'processing' || res.status === 'pending') {
            this.progressPercent = res.progress || 0;
            this.processingProgress = `المقطع ${index + 1}: ${this.progressPercent}%`;
          } else if (res.status === 'completed') {
            clearInterval(pollInterval);
            this.audioSegments[index].status = 'completed';
            this.audioSegments[index].transcribed = true;
            this.audioSegments[index].results = res.response_data.results;
            this.audioSegments[index].wordCount = res.response_data.total_words;
            this.totalWordCount += res.response_data.total_words;

            // Check if all segments are completed
            const allCompleted = this.audioSegments.every(seg => seg.status === 'completed');

            if (allCompleted) {
              // Combine all results and sort by timestamp
              this.results = [];
              this.audioSegments.forEach(seg => {
                if (seg.results) {
                  this.results.push(...seg.results);
                }
              });

              // Sort results by start time
              this.results.sort((a, b) => a.start - b.start);

              this.currentStep = 4;
              this.progressPercent = 100;
              this.processingProgress = 'تمت المعالجة بنجاح!';
              this.isProcessing = false;
              this.currentStep = 0;
            } else {
              // Move to next segment
              this.transcribeSegment(index + 1);
            }
          } else if (res.status === 'error') {
            clearInterval(pollInterval);
            this.audioSegments[index].status = 'error';
            this.errorMessage = 'خطأ في معالجة المقطع: ' + (res.error || '');
            this.isProcessing = false;
          }
        },
        error: (err) => {
          errorCount++;
          if (err.status === 404 || errorCount >= 60) {
            clearInterval(pollInterval);
            this.audioSegments[index].status = 'error';
            this.errorMessage = 'انتهت صلاحية جلسة المقطع';
            this.isProcessing = false;
          }
        }
      });
    }, 5000);
  }

  uploadAndTranscribe() {
    this.currentStep = 2;
    this.processingProgress = 'جاري رفع الملف...';
    
    const formData = new FormData();
    formData.append('file', this.selectedFile as File);
    formData.append('lecture_type', this.lectureType);
    formData.append('recitation_style', this.recitationStyle);

    this.http.post<any>(`${this.API_URL}/transcribe`, formData).subscribe({
      next: (res) => {
        if (res.job_id) {
          this.processingProgress = 'تم رفع الملف... جاري تفريغ الصوت (قد يستغرق وقتاً طويلاً)...';
          this.pollJobStatus(res.job_id);
        } else {
          this.isProcessing = false;
          this.errorMessage = 'لم يتم استلام معرف المهمة من الخادم.';
        }
      },
      error: (err) => {
        this.isProcessing = false;
        this.currentStep = 0;
        this.processingProgress = '';
        if (err.status === 0) {
          this.errorMessage = 'خدمة التفريغ غير متاحة حالياً. تأكد من تشغيل خادم Python (server.py) على المنفذ 5050.';
        } else {
          this.errorMessage = err.error?.detail || 'حدث خطأ أثناء رفع الملف';
        }
      }
    });
  }

  pollJobStatus(jobId: string) {
    let errorCount = 0;
    const pollInterval = setInterval(() => {
      this.http.get<any>(`${this.API_URL}/status/${jobId}`).subscribe({
        next: (res) => {
          errorCount = 0; // Reset errors on success
          if (res.status === 'processing' || res.status === 'pending') {
            this.progressPercent = res.progress || 0;
            
            // Update step based on progress
            if (this.progressPercent < 50) {
              this.currentStep = 2;
              this.processingProgress = `جاري استخراج النصوص... ${this.progressPercent}%`;
            } else if (this.progressPercent < 90) {
              this.currentStep = 2;
              this.processingProgress = `جاري استخراج النصوص... ${this.progressPercent}%`;
            } else {
              this.currentStep = 3;
              this.processingProgress = `جاري مطابقة الآيات... ${this.progressPercent}%`;
            }
          } else if (res.status === 'completed') {
            clearInterval(pollInterval);
            this.currentStep = 4;
            this.progressPercent = 100;
            this.processingProgress = 'تمت المعالجة بنجاح!';
            
            // Capture word count
            if (res.response_data && res.response_data.total_words) {
              this.totalWordCount = res.response_data.total_words;
            }
            
            setTimeout(() => {
              this.isProcessing = false;
              this.currentStep = 0;
              this.results = res.response_data.results;
              this.totalSegments = res.response_data.total_segments;
              this.quranSegments = res.response_data.quran_segments;
              this.processingProgress = '';
            }, 1000);
          } else if (res.status === 'error') {
            clearInterval(pollInterval);
            this.isProcessing = false;
            this.currentStep = 0;
            this.errorMessage = 'حدث خطأ أثناء التفريغ: ' + (res.error || '');
          }
        },
        error: (err) => {
          errorCount++;
          console.error("Polling error:", err);
          if (err.status === 404 || errorCount >= 20) {
            // Only stop if the job was deleted (404) or failed 20 times consecutively (100 seconds offline)
            clearInterval(pollInterval);
            this.isProcessing = false;
            this.currentStep = 0;
            if (err.status === 404) {
                this.errorMessage = 'انتهت صلاحية الجلسة. يرجى إعادة المحاولة.';
            } else {
                this.errorMessage = 'فقدنا الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
            }
          }
        }
      });
    }, 5000); // Poll every 5 seconds
  }

  // ===== Edit Functions =====
  
  startEdit(index: number, text: string) {
    this.editingSegmentIndex = index;
    this.editedText = text;
    this.playbackRate = 1.0;
  }
  
  playSegmentAudio(audioElement: HTMLAudioElement) {
    if (this.editingSegmentIndex === null) return;
    const segment = this.results[this.editingSegmentIndex];
    if (!segment) return;

    audioElement.currentTime = segment.start;
    audioElement.playbackRate = this.playbackRate;
    audioElement.play();
    this.isPlayingSegment = true;

    if (this.segmentEndCheckInterval) clearInterval(this.segmentEndCheckInterval);
    
    this.segmentEndCheckInterval = setInterval(() => {
      if (audioElement.currentTime >= segment.end) {
        audioElement.pause();
        this.isPlayingSegment = false;
        clearInterval(this.segmentEndCheckInterval);
      }
    }, 100);
  }

  pauseSegmentAudio(audioElement: HTMLAudioElement) {
    audioElement.pause();
    this.isPlayingSegment = false;
    if (this.segmentEndCheckInterval) clearInterval(this.segmentEndCheckInterval);
  }

  changePlaybackRate(audioElement: HTMLAudioElement, rate: number) {
    this.playbackRate = rate;
    audioElement.playbackRate = rate;
  }

  saveEdit(index: number) {
    if (this.results && this.results[index]) {
      this.results[index].text = this.editedText;
    }
    this.cancelEdit();
  }
  
  cancelEdit() {
    this.editingSegmentIndex = null;
    this.isPlayingSegment = false;
    if (this.segmentEndCheckInterval) clearInterval(this.segmentEndCheckInterval);
  }

  // ===== Export Functions =====
  
  exportToTxt() {
    let content = 'تفريغ الدرس\n\n';
    this.results.forEach(res => {
      if (res.type === 'quran' && res.match) {
        content += `[قرآن كريم - ${res.match.surah_name} : ${res.match.ayah_number}]\n`;
        content += `"${res.match.original_text}"\n\n`;
      } else {
        content += `${res.text}\n\n`;
      }
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    this.downloadFile(blob, 'transcription.txt');
  }

  exportToWord() {
    let content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>تفريغ الدرس</title>
        <style>
          body { font-family: 'Arial', sans-serif; direction: rtl; text-align: right; line-height: 1.8; }
          .quran { color: #1a5c53; font-weight: bold; font-size: 16px; margin-top: 15px; }
          .speech { color: #333; font-size: 14px; }
          .metadata { color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>تفريغ الدرس</h1>
        <hr>
    `;

    this.results.forEach(res => {
      if (res.type === 'quran' && res.match) {
        content += `<p class="metadata">[قرآن كريم - سورة ${res.match.surah_name} : آية ${res.match.ayah_number}]</p>`;
        content += `<p class="quran">"${res.match.original_text}"</p><br>`;
      } else {
        content += `<p class="speech">${res.text}</p><br>`;
      }
    });

    content += `</body></html>`;
    const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
    this.downloadFile(blob, 'transcription.doc');
  }

  exportToPdf() {
    // @ts-ignore
    import('html2pdf.js').then(html2pdf => {
      const element = document.createElement('div');
      
      let htmlContent = `
        <div style="font-family: 'Arial', sans-serif; direction: rtl; text-align: right; padding: 20px;">
          <h1 style="text-align: center; color: #1F3A2E; margin-bottom: 5px; font-size: 24px;">تفريغ المحاضرة</h1>
          <p style="text-align: center; color: #6B7D5C; font-size: 14px; margin-bottom: 30px;">تطبيق وتين لخدمة القرآن الكريم وعلومه</p>
          <hr style="border: 0; border-top: 2px solid #EAE5D8; margin-bottom: 30px;">
      `;
      
      let inSpeechBlock = false;

      this.results.forEach(res => {
        if (res.type === 'quran' && res.match) {
          if (inSpeechBlock) {
            htmlContent += `</p>`;
            inSpeechBlock = false;
          }
          htmlContent += `
            <div style="page-break-inside: avoid; margin: 25px 0; padding: 20px; background-color: #f9fbf9; border-right: 4px solid #1F3A2E; border-radius: 8px;">
              <p style="color: #6E7C70; font-size: 13px; margin-bottom: 10px; margin-top: 0;">[قرآن كريم - سورة ${res.match.surah_name} : آية ${res.match.ayah_number}]</p>
              <p style="color: #1F3A2E; font-weight: bold; font-size: 18px; margin: 0; line-height: 2;">"${res.match.original_text}"</p>
            </div>
          `;
        } else {
          if (!inSpeechBlock) {
            htmlContent += `<p style="color: #222; font-size: 16px; line-height: 2.2; text-align: justify; margin-bottom: 15px;">`;
            inSpeechBlock = true;
          }
          htmlContent += `${res.text} `;
        }
      });
      
      if (inSpeechBlock) {
        htmlContent += `</p>`;
      }
      
      htmlContent += `
          <div style="page-break-inside: avoid; margin-top: 50px; padding-top: 20px; border-top: 1px dashed #ccc; text-align: center; color: #888; font-size: 13px;">
            تم التفريغ آلياً بواسطة <strong>تطبيق وتين</strong>
          </div>
        </div>
      `;
      
      element.innerHTML = htmlContent;

      const opt: any = {
        margin:       0.8,
        filename:     'watin_transcription.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
      };
      
      // Call html2pdf and output as blob to handle native mobile downloads
      html2pdf.default().set(opt).from(element).outputPdf('blob').then((pdfBlob: Blob) => {
        this.downloadFile(pdfBlob, opt.filename);
      });
    }).catch(err => {
      console.error('Failed to load html2pdf.js', err);
      alert('حدث خطأ أثناء تصدير ملف PDF');
    });
  }

  private async downloadFile(blob: Blob, filename: string) {
    if (Capacitor.isNativePlatform()) {
      try {
        const fullBase64 = await this.blobToBase64(blob);
        const base64Data = fullBase64.split(',')[1] || fullBase64;
        const savedFile = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Cache
        });
        
        await Share.share({
          title: filename,
          text: 'مشاركة تفريغ المحاضرة',
          url: savedFile.uri,
          dialogTitle: 'حفظ أو مشاركة التفريغ'
        });
      } catch (e) {
        console.error('Error saving/sharing file on native:', e);
        alert('حدث خطأ أثناء حفظ الملف.');
      }
    } else {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(blob);
    });
  }
}
