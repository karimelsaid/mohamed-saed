"""
خدمة تفريغ الدروس القرآنية - Quran Lecture Transcription API
يعمل كـ FastAPI Microservice بجانب Node.js Backend
"""
import os
import re
import json
import tempfile
import base64
from typing import Optional
from contextlib import asynccontextmanager

# Monkey-patch av.open for compatibility with av>=19 (metadata_errors removed)
import av
_original_av_open = av.open
def _patched_av_open(*args, **kwargs):
    kwargs.pop('metadata_errors', None)
    return _original_av_open(*args, **kwargs)
av.open = _patched_av_open

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel
from rapidfuzz import process, fuzz
import soundfile as sf
import uuid


@asynccontextmanager
async def lifespan(app):
    """تحميل النموذج والفهرس عند بدء التشغيل"""
    print("🚀 بدء تشغيل خدمة التفريغ...", flush=True)
    try:
        load_quran_index()
        load_whisper_model()
        print("✅ جاهز لاستقبال الطلبات", flush=True)
        yield
    except Exception as e:
        print(f"❌ خطأ في التهيئة: {e}", flush=True)
        raise
    finally:
        print("🛑 إيقاف خدمة التفريغ", flush=True)

app = FastAPI(
    title="Quran Transcription API",
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=JSONResponse
)

# Allow Angular dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://localhost:4000", "https://knoozbook.com", "http://localhost", "capacitor://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== Global State ==========
QURAN_JSON_FILE = os.path.join(os.path.dirname(__file__), "quran_normalized.json")
quran_index = []
model = None


def normalize_text(text: str) -> str:
    """تطبيع النص: حذف التشكيل، توحيد الهمزات، إلخ"""
    if not text:
        return ""
    text = re.sub(r'[\u064B-\u065F\u0670]', '', text)
    text = re.sub(r'[أإآ]', 'ا', text)
    text = re.sub(r'ؤ', 'و', text)
    text = re.sub(r'ئ', 'ي', text)
    text = re.sub(r'ى', 'ي', text)
    text = re.sub(r'ة', 'ه', text)
    text = re.sub(r'[^\w\s]', '', text)
    text = ' '.join(text.split())
    return text


def load_quran_index():
    """تحميل فهرس القرآن المطبّع"""
    global quran_index
    if os.path.exists(QURAN_JSON_FILE):
        with open(QURAN_JSON_FILE, 'r', encoding='utf-8') as f:
            quran_index = json.load(f)
        print(f"✅ تم تحميل فهرس القرآن: {len(quran_index)} آية", flush=True)
    else:
        print("⚠️  ملف فهرس القرآن غير موجود. شغّل poc.py أولاً لتحميله.", flush=True)


def load_whisper_model():
    """تحميل نموذج Whisper"""
    global model
    print("⏳ جاري تحميل نموذج Whisper (small)...", flush=True)
    model = WhisperModel("small", device="cpu", compute_type="int8")
    print("✅ تم تحميل نموذج Whisper بنجاح!", flush=True)


def find_matches(text: str, lecture_type: str = "general"):
    """البحث عن تطابق مع القرآن - محسّن للسرعة"""
    normalized = normalize_text(text)
    if len(normalized.split()) < 3:
        return None

    choices = [ayah['normalized_text'] for ayah in quran_index]

    # اختيار نوع المطابقة حسب نوع الدرس
    if lecture_type == "tajweed":
        scorer = fuzz.partial_ratio  # أفضل لأجزاء الآيات
        threshold = 75
    elif lecture_type == "tafseer":
        scorer = fuzz.ratio  # مطابقة أدق للآيات الكاملة
        threshold = 70
    else:
        scorer = fuzz.partial_ratio
        threshold = 80

    # البحث مع limit للسرعة - نأخذ أفضل 50 نتيجة فقط
    matches = process.extract(normalized, choices, scorer=scorer, limit=50)

    if matches and matches[0][1] > threshold:
        matched_index = matches[0][2]
        ayah = quran_index[matched_index]
        return {
            "surah_number": ayah["surah_number"],
            "surah_name": ayah["surah_name"],
            "ayah_number": ayah["ayah_number"],
            "original_text": ayah["original_text"],
            "confidence": round(matches[0][1], 1)
        }
    return None


# ========== API Endpoints ==========


@app.get("/api/transcription/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "index_loaded": len(quran_index) > 0,
        "total_ayahs": len(quran_index)
    }


from fastapi import BackgroundTasks

# ========== Job State ==========
jobs = {}

def process_audio_job(job_id: str, tmp_path: str, lecture_type: str, segment_offset: float = 0.0):
    try:
        print(f"🎬 بدء معالجة الوظيفة: {job_id}", flush=True)
        print(f"⏱️ إزاحة التوقيت: {segment_offset}s", flush=True)
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 5

        # إعداد المشكّل (Diacritization)
        try:
            import mishkal.tashkeel
            vocalizer = mishkal.tashkeel.TashkeelClass()
            print("✅ تم تحميل مشكّل mishkal بنجاح", flush=True)
        except ImportError:
            vocalizer = None
            print("⚠️ لم يتم العثور على مكتبة mishkal. سيتم التفريغ بدون تشكيل.", flush=True)

        jobs[job_id]["progress"] = 10

        # لا تقوم بالتحويل - استخدم الملف الأصلي مباشرة
        converted_path = tmp_path
        print(f"� استخدام الملف الأصلي: {tmp_path}", flush=True)

        jobs[job_id]["progress"] = 15
        print(f"🎤 جاري بدء التفريغ...", flush=True)

        try:
            print(f"📂 الملف: {converted_path}", flush=True)
            file_size = os.path.getsize(converted_path)
            print(f"📏 حجم الملف: {file_size / (1024*1024):.2f} MB", flush=True)

            segments, info = model.transcribe(
                converted_path,
                language="ar",
                beam_size=1,  # أسرع ولكن أقل دقة
                vad_filter=True,  # تصفية الصمت لتسريع المعالجة
                condition_on_previous_text=False,
                initial_prompt="هذا تفريغ صوتي باللغة العربية: ",
                word_timestamps=False  # تعطيل timestamp الكلمات للتسريع
            )
            print(f"✅ تم تحليل الصوت، اللغة: {info.language}", flush=True)
        except Exception as e:
            print(f"❌ خطأ في تحليل الصوت: {e}", flush=True)
            import traceback
            traceback.print_exc()
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = str(e)
            return

        jobs[job_id]["progress"] = 20

        results = []
        speech_indices = []  # فهرس المقاطع غير القرآنية للتشكيل
        segment_count = 0
        segments_list = list(segments)
        total_segments = len(segments_list)
        print(f"📊 إجمالي المقاطع: {total_segments}", flush=True)

        # المرحلة 1: المطابقة أولاً (أسرع)
        print("🔍 جاري معالجة المقاطع ومطابقة الآيات...", flush=True)
        for segment in segments_list:
            text = segment.text.strip()
            if not text:
                continue

            segment_count += 1
            if segment_count % 10 == 0:
                progress = int(20 + (segment_count / total_segments) * 50)
                jobs[job_id]["progress"] = progress
                print(f"📊 التقدم: {progress}% ({segment_count}/{total_segments})", flush=True)

            # Log first few segments for debugging
            if segment_count <= 3:
                print(f"📝 المقطع {segment_count}: {text[:100]}...", flush=True)

            match = find_matches(text, lecture_type)

            # Adjust timestamp with segment offset
            adjusted_start = segment.start + segment_offset
            adjusted_end = segment.end + segment_offset

            result = {
                "start": round(adjusted_start, 2),
                "end": round(adjusted_end, 2),
                "text": text,
                "type": "quran" if match else "speech",
                "verified": match is not None and match["confidence"] >= 90,
            }

            if match:
                result["match"] = match

            results.append(result)

            # تشكيل فقط النصوص غير القرآنية
            if vocalizer and not match:
                speech_indices.append(len(results) - 1)

        # Log segment offset info
        print(f"⏱️ إزاحة المقطع النهائية: {segment_offset}s", flush=True)

        # المرحلة 2: تشكيل النصوص غير القرآنية
        jobs[job_id]["progress"] = 75
        if vocalizer and speech_indices:
            print(f"🔤 جاري تشكيل {len(speech_indices)} مقطع غير قرآني...", flush=True)
            try:
                for idx in speech_indices:
                    original_text = results[idx]["text"]
                    print(f"📝 النص الأصلي: {original_text[:100]}...", flush=True)
                    diacritized = vocalizer.tashkeel(original_text)
                    print(f"✨ النص المشكّل: {diacritized[:100]}...", flush=True)
                    # Check if diacritized is valid Arabic (no English letters or weird symbols)
                    # Only allow Arabic characters, diacritics, and basic punctuation
                    is_valid = all(
                        c.isascii() and c in ' ,.،.؟!؟:' or
                        '\u0600' <= c <= '\u06FF' or
                        c in '\u0750-\u077F' or  # Arabic Supplement
                        c in '\u08A0-\u08FF' or  # Arabic Extended-A
                        c in '\uFB50-\uFDFF' or  # Arabic Presentation Forms
                        c in '\uFE70-\uFEFF'     # Arabic Presentation Forms-B
                        for c in diacritized
                    )

                    if is_valid and diacritized:
                        results[idx]["text"] = diacritized
                    else:
                        print(f"⚠️ التشكيل غير صالح، استخدام النص الأصلي", flush=True)
                print(f"✅ تم تشكيل {len(speech_indices)} مقطع غير قرآني", flush=True)
            except Exception as e:
                print(f"⚠️ خطأ في التشكيل: {e}", flush=True)

        jobs[job_id]["progress"] = 90

        print(f"✅ اكتملت المعالجة: {len(results)} مقطع", flush=True)

        # Finished
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100

        # حساب عدد الكلمات
        total_words = sum(len(r["text"].split()) for r in results)
        print(f"📊 إجمالي الكلمات: {total_words}", flush=True)

        # Log first few results with timestamps
        print(f"📝 أول 3 نتائج مع التوقيت:", flush=True)
        for i, r in enumerate(results[:3]):
            print(f"  {i+1}. [{r['start']}s - {r['end']}s]: {r['text'][:50]}...", flush=True)

        jobs[job_id]["response_data"] = {
            "success": True,
            "language": info.language,
            "language_confidence": round(info.language_probability, 2),
            "lecture_type": lecture_type,
            "total_segments": len(results),
            "quran_segments": len([r for r in results if r["type"] == "quran"]),
            "total_words": total_words,
            "results": results
        }

    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)
    finally:
        try:
            os.unlink(tmp_path)
        except:
            pass


@app.post("/api/transcription/transcribe")
async def transcribe_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    lecture_type: str = Form("general"),
    recitation_style: str = Form("hafs")
):
    """
    استقبال ملف صوتي، وحفظه، وبدء التفريغ في الخلفية
    """
    if model is None:
        raise HTTPException(status_code=503, detail="النموذج لم يتم تحميله بعد")

    if not quran_index:
        raise HTTPException(status_code=503, detail="فهرس القرآن غير محمّل")

    # Generate Job ID
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "pending",
        "progress": 0
    }

    # حفظ الملف المؤقت
    suffix = os.path.splitext(file.filename)[1] if file.filename else ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = tmp.name

    # إضافة المهمة للخلفية
    background_tasks.add_task(process_audio_job, job_id, tmp_path, lecture_type)
    
    return {"job_id": job_id, "status": "pending"}


@app.post("/api/transcription/check-duration")
async def check_audio_duration(file: UploadFile = File(...)):
    """
    التحقق من مدة الملف الصوتي قبل التفريغ
    """
    suffix = os.path.splitext(file.filename)[1] if file.filename else ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = tmp.name

    try:
        # Use pydub to get duration
        audio = AudioSegment.from_file(tmp_path)
        duration_seconds = len(audio) / 1000.0  # Convert milliseconds to seconds
        duration_minutes = duration_seconds / 60

        os.unlink(tmp_path)

        return {
            "duration_seconds": round(duration_seconds, 2),
            "duration_minutes": round(duration_minutes, 2),
            "requires_splitting": duration_minutes > 2,
            "suggested_segments": int(duration_minutes / 2) + 1
        }
    except Exception as e:
        os.unlink(tmp_path)
        # If pydub fails, try a simple estimate based on file size
        file_size_mb = len(content) / (1024 * 1024)
        # Rough estimate: 1 MB ≈ 1 minute for MP3 at 128kbps
        estimated_minutes = file_size_mb
        return {
            "duration_seconds": round(estimated_minutes * 60, 2),
            "duration_minutes": round(estimated_minutes, 2),
            "requires_splitting": estimated_minutes > 2,
            "suggested_segments": int(estimated_minutes / 2) + 1,
            "estimated": True
        }


@app.post("/api/transcription/split")
async def split_audio(file: UploadFile = File(...), segment_duration: int = Form(120)):
    """
    تقسيم الملف الصوتي إلى مقاطع
    segment_duration: مدة كل مقطع بالثواني (الافتراضي 2 دقيقة = 120 ثانية)
    """
    suffix = os.path.splitext(file.filename)[1] if file.filename else ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = tmp.name

    try:
        # Use soundfile to get duration
        print(f"📦 تحميل الملف بـ soundfile: {tmp_path}", flush=True)
        audio_info = sf.info(tmp_path)
        duration_seconds = audio_info.duration
        duration_minutes = duration_seconds / 60

        print(f"📊 مدة الملف: {duration_seconds}s ({duration_minutes}min)", flush=True)

        total_segments = int(duration_minutes / 2) + 1
        actual_segment_duration = duration_seconds / total_segments

        print(f"📊 إجمالي المقاطع: {total_segments}", flush=True)

        segments = []

        for i in range(total_segments):
            start = i * actual_segment_duration
            end = min((i + 1) * actual_segment_duration, duration_seconds)

            print(f"📦 حدود المقطع {i}: {start}s - {end}s", flush=True)

            segments.append({
                "index": i,
                "start": round(start, 2),
                "end": round(end, 2),
                "duration": round(end - start, 2),
                "file": f"segment_{i}{suffix}",
                "audio_data": None  # Will use original file with boundaries
            })

        # Clean up original file
        os.unlink(tmp_path)

        return {
            "total_segments": total_segments,
            "segments": segments,
            "estimated": False,
            "actual_duration_minutes": round(duration_minutes, 2)
        }
    except Exception as e:
        print(f"⚠️ خطأ في التقسيم: {e}", flush=True)
        import traceback
        traceback.print_exc()
        # Clean up on error
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        # Fallback: estimate based on file size and return boundaries only
        file_size_mb = len(content) / (1024 * 1024)
        estimated_minutes = file_size_mb
        duration_seconds = estimated_minutes * 60
        segment_duration_minutes = segment_duration / 60

        total_segments = int(estimated_minutes / segment_duration_minutes) + 1
        actual_segment_duration = duration_seconds / total_segments

        segments = []
        for i in range(total_segments):
            start = i * actual_segment_duration
            end = min((i + 1) * actual_segment_duration, duration_seconds)
            segments.append({
                "index": i,
                "start": round(start, 2),
                "end": round(end, 2),
                "duration": round(end - start, 2),
                "file": f"segment_{i}{suffix}",
                "audio_data": None  # Will use original file with boundaries
            })

        return {
            "total_segments": total_segments,
            "segments": segments,
            "estimated": True,
            "file_size_mb": round(file_size_mb, 2),
            "estimated_duration_minutes": round(estimated_minutes, 2)
        }


@app.post("/api/transcription/transcribe-segment")
async def transcribe_segment(
    file: UploadFile = File(...),
    audio_data: Optional[str] = Form(None),
    lecture_type: str = Form("general"),
    recitation_style: str = Form("hafs"),
    segment_start: Optional[str] = Form(None),
    segment_end: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """تفريغ مقطع واحد من الملف"""
    print(f"🔍 Received request: file={file.filename if file else 'None'}, audio_data={'Yes' if audio_data else 'None'}", flush=True)

    if not model:
        raise HTTPException(status_code=503, detail="النموذج غير محمّل")

    if not quran_index:
        raise HTTPException(status_code=503, detail="فهرس القرآن غير محمّل")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "pending",
        "progress": 0
    }

    # If audio_data (base64) is provided, use it directly
    if audio_data:
        print("📦 استخدام المقطع base64", flush=True)
        content = base64.b64decode(audio_data)
        suffix = ".mp3"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp.flush()
            os.fsync(tmp.fileno())
            tmp_path = tmp.name
        print(f"📊 حجم الملف base64: {len(content)} bytes", flush=True)
    else:
        # Fallback: use original file with boundaries
        print(f"📦 استخدام الملف الأصلي: {file.filename}", flush=True)
        suffix = os.path.splitext(file.filename)[1] if file.filename else ".mp3"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp.flush()
            os.fsync(tmp.fileno())
            tmp_path = tmp.name
        print(f"📊 حجم الملف المستلم: {len(content)} bytes", flush=True)

    # If segment boundaries are provided, extract the segment using ffmpeg
    segment_offset = 0.0
    if segment_start and segment_end:
        start_sec = float(segment_start)
        end_sec = float(segment_end)
        duration = end_sec - start_sec
        segment_offset = start_sec  # Store the offset for timing adjustment
        print(f"⏱️ استخراج المقطع من {start_sec}s إلى {end_sec}s", flush=True)
        
        # Use ffmpeg to extract the segment
        import subprocess
        sliced_tmp_path = tmp_path + "_sliced.mp3"
        try:
            subprocess.run([
                'ffmpeg', '-y', '-i', tmp_path, 
                '-ss', str(start_sec), '-t', str(duration), 
                '-acodec', 'copy', sliced_tmp_path
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            # Replace tmp_path with sliced_tmp_path
            os.unlink(tmp_path)
            tmp_path = sliced_tmp_path
            print(f"✅ تم استخراج المقطع بنجاح", flush=True)
        except Exception as e:
            print(f"⚠️ خطأ في قص الملف: {e}. سيتم استخدام الملف الكامل.", flush=True)

    background_tasks.add_task(process_audio_job, job_id, tmp_path, lecture_type, segment_offset)

    return {"job_id": job_id, "status": "pending"}

@app.get("/api/transcription/status/{job_id}")
async def get_transcription_status(job_id: str):
    """
    الاستعلام عن حالة التفريغ بواسطة job_id
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="الطلب غير موجود أو انتهت صلاحيته")
    return jobs[job_id]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5050)
