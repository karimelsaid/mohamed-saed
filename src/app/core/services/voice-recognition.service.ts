import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';

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

    public voiceEvents$ = this.voiceSubject.asObservable();

    constructor(private ngZone: NgZone) {
        this.initRecognition();
    }

    private initRecognition(): void {
        const { webkitSpeechRecognition }: IWindow = <IWindow>(window as any);
        const SpeechRecognition = webkitSpeechRecognition || (window as any).SpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('Voice recognition not supported in this browser.');
            this.voiceSubject.next({ type: 'error', error: 'not-supported' });
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'ar-SA'; // Quranic Arabic preference

        this.recognition.onstart = () => {
            this.ngZone.run(() => {
                this.isListening = true;
                this.voiceSubject.next({ type: 'start' });
            });
        };

        this.recognition.onend = () => {
            this.ngZone.run(() => {
                this.isListening = false;
                this.voiceSubject.next({ type: 'end' });
            });
        };

        this.recognition.onresult = (event: any) => {
            this.ngZone.run(() => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                        this.voiceSubject.next({
                            type: 'result',
                            transcript: finalTranscript.trim(),
                            isFinal: true
                        });
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                        // Emit interim results too if needed for live feedback
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
                console.error('Voice recognition error:', event.error);
                if (event.error === 'no-speech') {
                    // Ignore no-speech errors usually, or handle them gently
                    return;
                }
                this.voiceSubject.next({ type: 'error', error: event.error });
            });
        };
    }

    public start(): void {
        if (!this.recognition) {
            this.voiceSubject.next({ type: 'error', error: 'not-supported' });
            return;
        }
        if (this.isListening) return;

        try {
            this.recognition.start();
        } catch (e) {
            console.error('Error starting recognition:', e);
        }
    }

    public stop(): void {
        if (!this.recognition || !this.isListening) return;
        try {
            this.recognition.stop();
        } catch (e) {
            console.error('Error stopping recognition:', e);
        }
    }

    public abort(): void {
        if (!this.recognition) return;
        try {
            this.recognition.abort();
            this.isListening = false;
        } catch (e) {
            console.error('Error aborting recognition:', e);
        }
    }
}

interface IWindow extends Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
}
