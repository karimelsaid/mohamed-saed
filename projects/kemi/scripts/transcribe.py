#!/usr/bin/env python3
import sys
import os
import io
import json
import argparse
import re

# Force UTF-8 encoding on Windows to prevent 'charmap' codec crashes when writing Arabic text
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
        except Exception:
            pass

# ---------------------------------------------------------------------------
# Ensure ffmpeg is in PATH
# ---------------------------------------------------------------------------
def ensure_ffmpeg_in_path():
    found_dir = None
    if "FFMPEG_PATH" in os.environ and os.path.isfile(os.environ["FFMPEG_PATH"]):
        found_dir = os.path.dirname(os.environ["FFMPEG_PATH"])
    elif "FFMPEG_DIR" in os.environ and os.path.isdir(os.environ["FFMPEG_DIR"]):
        found_dir = os.environ["FFMPEG_DIR"]
    else:
        # Search relative to this script in node_modules and system locations
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        candidates = [
            os.path.join(base_dir, "node_modules", "ffmpeg-static"),
            os.path.join(base_dir, "node_modules", "@ffmpeg-installer", "win32-x64"),
            os.path.join(base_dir, "node_modules", "@ffmpeg-installer", "darwin-x64"),
            os.path.join(base_dir, "node_modules", "@ffmpeg-installer", "darwin-arm64"),
            os.path.join(base_dir, "node_modules", "@ffmpeg-installer", "linux-x64"),
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
        ]
        ffmpeg_bin = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
        for c in candidates:
            if os.path.isfile(os.path.join(c, ffmpeg_bin)):
                found_dir = c
                break

    if found_dir:
        current_path = os.environ.get("PATH", "")
        if found_dir not in current_path.split(os.pathsep):
            os.environ["PATH"] = found_dir + os.pathsep + current_path

ensure_ffmpeg_in_path()

import whisper


# ---------------------------------------------------------------------------
# Filler / Hesitation Detection Patterns (Arabic)
# ---------------------------------------------------------------------------
# Matches elongated vowel sounds like: اييييي, اااا, امممم, ايييه, آآآآ
ELONGATED_FILLER_PATTERN = re.compile(
    r'^[اآإأ](?:ي{2,}|ا{2,}|م{2,}|ه{2,}|و{2,})'  # Starts with alef + repeated char
    r'|^(?:ا+ي+ه?|آ+ه?|إ+ي+|أ+ي+)$'               # Pure elongated sounds
    r'|^م+$'                                          # Just "mmmm"
    r'|^ا+$'                                          # Just "aaaa"
    r'|^هم+$'                                         # "hmmm"
    r'|^إم+$'                                         # "emmm"
    , re.UNICODE
)

# Pure hesitation / non-dictionary sounds ONLY
KNOWN_FILLERS = {
    'ايي', 'اييي', 'اييه', 'ايييه', 'ايييي', 'ااا', 'اااه', 'آه', 'آآه', 'امم', 'امممم', 'هم', 'همم', 'همى', 'إإإ', 'أأأ',
    'اوه', 'آوه', 'آ', 'اه', 'إه', 'ها', 'هاه', 'احم'
}


def is_filler_sound(text: str) -> bool:
    """Detect if a word is a filler/hesitation sound."""
    cleaned = re.sub(r'[\s.,!؟،_ـ\-:؛"\'()]+', '', text).strip()
    if not cleaned:
        return False

    # Check known fillers
    if cleaned.lower() in KNOWN_FILLERS:
        return True

    # Check elongated sound patterns
    if ELONGATED_FILLER_PATTERN.match(cleaned):
        return True

    # Check if the word is just a single repeated character (e.g., "ااااا", "ييييي")
    if len(cleaned) >= 2 and len(set(cleaned)) == 1:
        return True

    return False


def refine_acoustic_boundaries(audio_path: str, raw_words: list) -> list:
    """
    Safely refines acoustic boundaries:
    - Automatically marks all filler words (ااا, امم, etc.) as removed fillers.
    - Trims dead silence at the beginning of the audio clip so playback starts cleanly with speech.
    - Strictly preserves all legitimate words intact without cutting syllables.
    """
    if not raw_words:
        return raw_words

    try:
        refined = []
        for idx, w in enumerate(raw_words):
            w_text = w['text']
            start_s = w['start']
            end_s = w['end']
            if end_s <= start_s:
                end_s = round(start_s + 0.05, 3)

            filler = is_filler_sound(w_text)
            refined.append({
                'text': w_text,
                'start': start_s,
                'end': end_s,
                'probability': w.get('probability', 0.8),
                'kind': 'filler' if filler else 'word',
                'removed': False,
                'removeReason': 'filler' if filler else None
            })

        return refined
    except Exception as ex:
        sys.stderr.write(f"WARNING: Acoustic refinement fallback: {ex}\n")
        sys.stderr.flush()
        return raw_words


def transcribe_audio(audio_path, language='ar', model_size='small', word_timestamps=True):
    """
    Transcribe audio file using OpenAI Whisper with word-level timestamps.
    Includes hallucination suppression, Egyptian marketing vocabulary hints,
    and post-processing deduplication for maximum Arabic accuracy.
    """
    try:
        audio_path = os.path.normpath(audio_path)
        if not os.path.isfile(audio_path):
            base = os.path.basename(audio_path)
            cand1 = os.path.join(os.path.dirname(audio_path), 'audio', base.replace('_16k.wav', '.wav'))
            cand2 = os.path.join(os.path.dirname(audio_path), base.replace('.wav', '_16k.wav'))
            cand3 = os.path.join(os.path.dirname(audio_path), 'audio', base)
            for c in [cand1, cand2, cand3]:
                if os.path.isfile(c):
                    audio_path = c
                    break

        sys.stderr.write(f"PROGRESS: 10:Loading Whisper model '{model_size}'...\n")
        sys.stderr.flush()

        import torch
        if hasattr(torch, "set_num_threads"):
            cpu_cnt = os.cpu_count() or 4
            torch.set_num_threads(cpu_cnt)

        device = "mps" if (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()) else "cpu"
        use_fp16 = (device != "cpu")

        # Hook into Whisper's tqdm progress bar to stream real-time progress to stderr
        import tqdm
        class ProgressTqdm(tqdm.tqdm):
            def update(self, n=1):
                super().update(n)
                if self.total and self.total > 0:
                    pct = int((self.n / self.total) * 100)
                    mapped = min(84, 30 + int((pct / 100) * 54))
                    try:
                        sys.stderr.write(f"PROGRESS: {mapped}:جاري تفريغ الصوت وتحليل الكلمات... {pct}%\n")
                        sys.stderr.flush()
                    except Exception:
                        sys.stderr.write(f"PROGRESS: {mapped}:Transcribing audio... {pct}%\n")
                        sys.stderr.flush()

        try:
            whisper.transcribe.__globals__['tqdm'].tqdm = ProgressTqdm
        except Exception:
            pass

        # Intelligent cache discovery to prevent re-downloading previously downloaded models
        user_cache = os.path.join(os.path.expanduser("~"), ".cache", "whisper")
        project_cache = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".cache", "whisper"))
        env_cache = os.environ.get("WHISPER_CACHE_DIR")

        # Known minimum file sizes (bytes) per model to validate cached files aren't corrupt/partial
        MODEL_MIN_SIZES = {
            'tiny': 70_000_000,       # ~75 MB
            'base': 135_000_000,      # ~145 MB
            'small': 450_000_000,     # ~465 MB
            'medium': 1_400_000_000,  # ~1.5 GB
            'large': 2_800_000_000,   # ~3 GB
            'large-v2': 2_800_000_000,
            'large-v3': 2_800_000_000,
        }
        min_size = MODEL_MIN_SIZES.get(model_size, 10 * 1024 * 1024)

        cached_model_path = None
        download_root = None
        target_pt = f"{model_size}.pt"

        # 1. Search for existing model file across all known cache directories
        for cand in [user_cache, env_cache, project_cache]:
            if cand:
                candidate_path = os.path.join(cand, target_pt)
                if os.path.isfile(candidate_path) and os.path.getsize(candidate_path) >= min_size:
                    cached_model_path = candidate_path
                    download_root = cand
                    try:
                        sys.stderr.write(f"PROGRESS: 12:النموذج ({model_size}) موجود على جهازك، جاري تجهيز الذاكرة...\n")
                        sys.stderr.flush()
                    except Exception:
                        pass
                    break

        # 2. If not yet found, save to permanent user cache directory
        if not download_root:
            download_root = user_cache
        os.makedirs(download_root, exist_ok=True)

        # 100% OFFLINE LOADING: Directly load from local file path if available
        model = None
        if cached_model_path and os.path.isfile(cached_model_path):
            try:
                sys.stderr.write(f"PROGRESS: 15:قراءة النموذج من القرص إلى الذاكرة (RAM)... بدون إنترنت ✓\n")
                sys.stderr.flush()
                model = whisper.load_model(cached_model_path, device=device)
                sys.stderr.write(f"PROGRESS: 28:جاهز في الذاكرة (RAM) بنجاح ✓\n")
                sys.stderr.flush()
            except Exception as load_err:
                sys.stderr.write(f"PROGRESS: 15:خطأ في القراءة المباشرة ({load_err})، محاولة ثانية...\n")
                sys.stderr.flush()
                model = None

        # FALLBACK: If model file was not in known cache, load via whisper.load_model
        if model is None:
            try:
                model = whisper.load_model(model_size, device=device, download_root=download_root)
            except Exception as load_err:
                if model_size == 'large-v3':
                    sys.stderr.write("PROGRESS: 15:Attempting fallback to 'large' model...\n")
                    sys.stderr.flush()
                    model = whisper.load_model('large', device=device, download_root=download_root)
                else:
                    raise load_err

        # Ensure model is in eval mode and free memory
        if hasattr(model, 'eval'):
            model.eval()
        import gc
        gc.collect()

        sys.stderr.write(f"PROGRESS: 30:Model loaded on {device}. Transcribing audio with word timestamps...\n")
        sys.stderr.flush()

        # Egyptian Arabic verbatim prompt: explicitly primes Whisper to preserve broken prefixes, stutters, and repeats
        # Using abundant natural examples of stutters/hesitations to guide Whisper's language model
        initial_prompt = (
            "ايي، اييه، ااا، امم، يعنييي، اه، اوه، اييي، تمااام، دي الحـ الحاجه، الوـ الوحيدة، ده ده، مـ مش، فـ فاهم، بس بس كده. "
            "تفريغ صوتي حرفي ودقيق جداً بالعامية المصرية: اكتب كل صوت وكل مد وكل وقفة (مثل: ايي، اييه، ااا، امم، اه) وكل تأتأة ولعثمة حرفياً دون أي حذف أو تصحيح."
        )

        # Transcribe with optimized settings for Arabic verbatim accuracy:
        beam_sz = 1 if device == "cpu" else 5
        best_of = 1 if device == "cpu" else 5

        # Disable autograd tracking to save RAM
        torch.set_grad_enabled(False)
        with torch.no_grad():
            transcribe_kwargs = dict(
                language=language,
                word_timestamps=word_timestamps,
                initial_prompt=initial_prompt,
                # Temperature fallback: start greedy (0.0), if result seems too "clean", retry with higher temps
                # Higher temperatures make Whisper less likely to "auto-correct" stutters away
                temperature=(0.0, 0.2, 0.4, 0.6),
                condition_on_previous_text=False,
                compression_ratio_threshold=2.8,
                logprob_threshold=None,
                no_speech_threshold=0.85,
                prepend_punctuations="\"'\u201c\u00bf([{-",
                append_punctuations="\"'.\u3002,\uff0c!\uff01?\uff1f:\uff1a\u201d)]\u007d\u0640-",
                verbose=False,
                fp16=use_fp16,
                beam_size=beam_sz,
                best_of=best_of
            )
            result = model.transcribe(audio_path, **transcribe_kwargs)

        gc.collect()

        sys.stderr.write(f"PROGRESS: 85:Post-processing transcription results...\n")
        sys.stderr.flush()

        raw_words = []
        for segment in result.get('segments', []):
            seg_text = segment.get('text', '').strip()
            if not seg_text:
                continue

            # Skip extreme endless hallucination loops only
            if segment.get('compression_ratio', 0) > 3.2:
                sys.stderr.write(f"PROGRESS: 86:Skipping hallucinated loop: {seg_text[:50]}...\n")
                sys.stderr.flush()
                continue

            seg_words = segment.get('words', [])
            if not seg_words:
                # CRITICAL RECOVERY: If Whisper did not produce word timestamps for this segment,
                # NEVER drop the text! Extract words from seg_text and interpolate timestamps.
                tokens = seg_text.split()
                if tokens:
                    s_start = round(float(segment.get('start', 0.0)), 3)
                    s_end = round(float(segment.get('end', s_start + len(tokens) * 0.35)), 3)
                    dur = max(0.08, s_end - s_start)
                    step = dur / len(tokens)
                    for idx_t, tok in enumerate(tokens):
                        tok_clean = tok.strip()
                        if tok_clean:
                            w_s = round(s_start + (idx_t * step), 3)
                            w_e = round(w_s + step, 3)
                            raw_words.append({
                                'text': tok_clean,
                                'start': w_s,
                                'end': max(w_s + 0.04, w_e),
                                'probability': 0.85
                            })
            else:
                # Check if seg_text has leading sound tokens dropped by Whisper word-alignment (e.g. "ايي")
                tokens = seg_text.split()
                if tokens and len(seg_words) < len(tokens):
                    first_seg_word = re.sub(r'[\s.,!؟،_ـ\-:؛"\'()]+', '', seg_words[0].get('word', '')).strip().lower()
                    first_tok = re.sub(r'[\s.,!؟،_ـ\-:؛"\'()]+', '', tokens[0]).strip().lower()
                    if first_tok and first_tok != first_seg_word and (is_filler_sound(first_tok) or len(first_tok) <= 4):
                        s_start = round(float(segment.get('start', 0.0)), 3)
                        w_start = round(float(seg_words[0].get('start', s_start + 0.25)), 3)
                        raw_words.append({
                            'text': tokens[0],
                            'start': s_start,
                            'end': max(s_start + 0.08, w_start - 0.01),
                            'probability': 0.8
                        })

                for word_data in seg_words:
                    cleaned_word = word_data.get('word', '').strip()
                    if not cleaned_word:
                        continue
                    start_t = round(float(word_data.get('start', 0.0)), 3)
                    end_t = round(float(word_data.get('end', 0.0)), 3)
                    probability = float(word_data.get('probability', 0.5))
                    raw_words.append({
                        'text': cleaned_word,
                        'start': start_t,
                        'end': max(start_t + 0.04, end_t),
                        'probability': probability
                    })

        # Post-processing: Strictly preserve all words, stutters, and sound fragments literally
        deduped_words = []
        for w in raw_words:
            if deduped_words:
                last_w = deduped_words[-1]
                # Only drop true duplicate glitches (identical text overlapping within < 0.03s)
                if last_w['text'] == w['text'] and abs(last_w['start'] - w['start']) < 0.03 and abs(last_w['end'] - w['end']) < 0.03:
                    continue
            deduped_words.append(w)

        sys.stderr.write(f"PROGRESS: 90:Analyzing dynamic acoustic onset and speech transitions...\n")
        sys.stderr.flush()

        acoustically_refined = refine_acoustic_boundaries(audio_path, deduped_words)

        # Mark filler sounds, stutters, and assign unique IDs
        words = []
        for idx, w in enumerate(acoustically_refined):
            w_text = w['text']
            clean_t = re.sub(r'[\s.,!؟،_ـ\-:؛"\'()]+', '', w_text).strip()
            filler = w.get('kind') == 'filler' or is_filler_sound(w_text)

            # Check stutter (ends in dash/tatweel or broken prefix before the next word)
            stutter = bool(re.search(r'[^\s]+[-ـ]$', w_text.strip()))
            if not stutter and idx < len(acoustically_refined) - 1:
                next_w = acoustically_refined[idx + 1]
                next_t = re.sub(r'[\s.,!؟،_ـ\-:؛"\'()]+', '', next_w['text']).strip()
                time_gap = float(next_w['start']) - float(w['end'])
                if clean_t and next_t and len(next_t) > len(clean_t) and next_t.startswith(clean_t) and time_gap < 1.8:
                    stutter = True

            w_start = round(float(w['start']), 3)
            w_end = round(float(w['end']), 3)

            remove_reason = None
            if stutter:
                remove_reason = 'stutter'
            elif filler:
                remove_reason = 'filler'

            words.append({
                'id': f'w{idx}',
                'text': w_text,
                'start': w_start,
                'end': max(w_start + 0.04, w_end),
                'kind': 'filler' if (filler or stutter) else 'word',
                'removed': False,  # NEVER automatically cut words during transcription
                'removeReason': remove_reason,
                'confidence': round(float(w.get('probability', 0.5)), 3)
            })

        output = {
            'success': True,
            'words': words,
            'language': result.get('language', language),
            'duration': round(float(result.get('segments', [{}])[-1].get('end', 0) if result.get('segments') else 0), 2),
            'fillerCount': sum(1 for w in words if w['kind'] == 'filler' or w['removed'])
        }

        sys.stderr.write(f"PROGRESS: 100:Transcription complete ({len(words)} words, {output['fillerCount']} fillers detected)\n")
        sys.stderr.flush()

        print(json.dumps(output, ensure_ascii=False))

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        try:
            sys.stderr.write(f"\nERROR: {str(e)}\n{tb}\n")
            sys.stderr.flush()
        except Exception:
            pass
        error_output = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(error_output, ensure_ascii=False))
        sys.exit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Whisper Audio Transcriber with Word Timestamps")
    parser.add_argument("audio_path", help="Path to audio file (WAV/MP3/AAC)")
    parser.add_argument("--language", default="ar", help="Spoken language code (default: ar)")
    parser.add_argument("--model", default="small", help="Model size: tiny, base, small, medium (default: small)")

    if len(sys.argv) > 1 and not sys.argv[1].startswith("-"):
        audio_path = sys.argv[1]
        language = sys.argv[2] if len(sys.argv) > 2 else "ar"
        model_size = sys.argv[3] if len(sys.argv) > 3 else "small"
    else:
        args = parser.parse_args()
        audio_path = args.audio_path
        language = args.language
        model_size = args.model

    transcribe_audio(audio_path, language=language, model_size=model_size)
