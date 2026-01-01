import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Capacitor } from '@capacitor/core';

declare var webkitSpeechRecognition: any;
declare var SpeechRecognition: any;

export interface VoiceEvent {
    type: 'start' | 'end' | 'result' | 'error';
    transcript?: string;
    isFinal?: boolean;
    error?: string;
}

@Injectable({
    providedIn: 'root'
})
export class VoiceRecognitionService {
    private recognition: any;
    private isListening = false;
    private voiceSubject = new Subject<VoiceEvent>();
    private isAndroid = Capacitor.getPlatform() === 'android';
    private isMicWarmedUp = false;

    // Flag to track if the user EXPLICITLY wants to listen
    // This helps us distinguish between OS-level timeouts and manual stops
    private shouldBeListening = false;

    // Automatic shutdown timer (2 minutes)
    private autoOffTimer: any;
    private readonly INACTIVITY_THRESHOLD = 120000; // 2 minutes

    public voiceEvents$ = this.voiceSubject.asObservable();

    constructor(private ngZone: NgZone) {
        this.initRecognition();
    }

    private initRecognition(): void {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            this.voiceSubject.next({ type: 'error', error: 'NOT_SUPPORTED' });
            return;
        }

        try {
            this.recognition = new SpeechRecognition();
            this.recognition.interimResults = true;
            this.recognition.lang = 'ar-SA';
            this.recognition.continuous = true;

            if (this.isAndroid) {
                this.recognition.maxAlternatives = 1;
            }

            this.recognition.onstart = () => {
                this.ngZone.run(() => {
                    this.isListening = true;
                    this.voiceSubject.next({ type: 'start' });
                    this.resetAutoOffTimer();
                });
            };

            this.recognition.onend = () => {
                this.ngZone.run(() => {
                    this.isListening = false;

                    // AUTO-RESTART LOGIC (The Core Fix)
                    // If the OS closed the mic but we (the app/user) still want to listen, 
                    // we restart it immediately. This makes the "session" feel persistent.
                    if (this.shouldBeListening) {
                        this.recognition.start();
                    } else {
                        this.voiceSubject.next({ type: 'end' });
                    }
                });
            };

            this.recognition.onresult = (event: any) => {
                this.ngZone.run(() => {
                    this.resetAutoOffTimer();
                    let interimTranscript = '';
                    let finalTranscript = '';

                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        const result = event.results[i];
                        if (result.isFinal) {
                            finalTranscript += result[0].transcript;
                            this.voiceSubject.next({
                                type: 'result',
                                transcript: finalTranscript.trim(),
                                isFinal: true
                            });
                        } else {
                            interimTranscript += result[0].transcript;
                            this.voiceSubject.next({
                                type: 'result',
                                transcript: interimTranscript.trim(),
                                isFinal: false
                            });
                        }
                    }
                });
            };

            this.recognition.onerror = (event: any) => {
                this.ngZone.run(() => {
                    if (event.error === 'no-speech') return;

                    // Certain errors mean the hardware or network failed seriously
                    if (event.error === 'aborted' || event.error === 'network' || event.error === 'not-allowed') {
                        this.shouldBeListening = false; // Give up on serious errors
                        this.isListening = false;
                    }

                    this.voiceSubject.next({ type: 'error', error: event.error });
                });
            };
        } catch (e: any) {
            this.voiceSubject.next({ type: 'error', error: 'INIT_FAIL' });
        }
    }

    private resetAutoOffTimer(): void {
        this.clearAutoOffTimer();
        this.autoOffTimer = setTimeout(() => {
            this.ngZone.run(() => {
                this.stop();
            });
        }, this.INACTIVITY_THRESHOLD);
    }

    private clearAutoOffTimer(): void {
        if (this.autoOffTimer) {
            clearTimeout(this.autoOffTimer);
            this.autoOffTimer = null;
        }
    }

    /**
     * One-time warm up to register permission in WebView context.
     */
    private async warmUpMic(): Promise<void> {
        if (!this.isAndroid || this.isMicWarmedUp) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            return new Promise((resolve) => {
                setTimeout(() => {
                    stream.getTracks().forEach(track => track.stop());
                    this.isMicWarmedUp = true;
                    resolve();
                }, 200);
            });
        } catch (e) {
            // Silently fail
        }
    }

    public async start(): Promise<void> {
        if (!this.recognition || this.isListening) return;

        this.shouldBeListening = true; // Set intent

        if (this.isAndroid && !this.isMicWarmedUp) {
            await this.warmUpMic();
        }

        try {
            this.recognition.start();
        } catch (e: any) {
            if (e.name !== 'InvalidStateError') {
                this.voiceSubject.next({ type: 'error', error: 'START_FAILED' });
            }
        }
    }

    public stop(): void {
        if (!this.recognition) return;
        this.shouldBeListening = false; // Clear intent
        try {
            this.clearAutoOffTimer();
            this.recognition.stop();
            this.isListening = false;
        } catch (e) { }
    }

    public abort(): void {
        if (!this.recognition) return;
        this.shouldBeListening = false; // Clear intent
        try {
            this.clearAutoOffTimer();
            this.recognition.abort();
            this.isListening = false;
        } catch (e) { }
    }
}
