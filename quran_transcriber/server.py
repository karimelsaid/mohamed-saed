"""
خدمة تفريغ الدروس القرآنية - Quran Lecture Transcription API
يعمل كـ FastAPI Microservice بجانب Node.js Backend
"""
import os
import re
import json
import tempfile
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from rapidfuzz import process, fuzz


@asynccontextmanager
async def lifespan(app):
    """تحميل النموذج والفهرس عند بدء التشغيل"""
    load_quran_index()
    load_whisper_model()
    yield

app = FastAPI(title="Quran Transcription API", version="1.0.0", lifespan=lifespan)

# Allow Angular dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://localhost:4000", "https://knoozbook.com"],
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
        print(f"✅ تم تحميل فهرس القرآن: {len(quran_index)} آية")
    else:
        print("⚠️  ملف فهرس القرآن غير موجود. شغّل poc.py أولاً لتحميله.")


def load_whisper_model():
    """تحميل نموذج Whisper"""
    global model
    print("⏳ جاري تحميل نموذج Whisper (turbo)...")
    model = WhisperModel("turbo", device="cpu", compute_type="int8")
    print("✅ تم تحميل نموذج Whisper بنجاح!")


def find_matches(text: str, lecture_type: str = "general"):
    """البحث عن تطابق مع القرآن"""
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

    match = process.extractOne(normalized, choices, scorer=scorer)

    if match and match[1] > threshold:
        matched_index = match[2]
        ayah = quran_index[matched_index]
        return {
            "surah_number": ayah["surah_number"],
            "surah_name": ayah["surah_name"],
            "ayah_number": ayah["ayah_number"],
            "original_text": ayah["original_text"],
            "confidence": round(match[1], 1)
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


@app.post("/api/transcription/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    lecture_type: str = Form("general"),
    recitation_style: str = Form("hafs")
):
    """
    استقبال ملف صوتي وتفريغه ومطابقته مع القرآن
    """
    if model is None:
        raise HTTPException(status_code=503, detail="النموذج لم يتم تحميله بعد")

    if not quran_index:
        raise HTTPException(status_code=503, detail="فهرس القرآن غير محمّل")

    # حفظ الملف المؤقت - بطريقة آمنة للملفات الكبيرة
    suffix = os.path.splitext(file.filename)[1] if file.filename else ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        # قراءة الملف بشكل مجزأ (chunks) بدلاً من تحميله كله في الذاكرة
        total_bytes = 0
        while True:
            chunk = await file.read(1024 * 1024)  # 1MB في المرة
            if not chunk:
                break
            tmp.write(chunk)
            total_bytes += len(chunk)
        tmp.flush()
        os.fsync(tmp.fileno())

    # تشخيص: حجم الملف
    disk_size = os.path.getsize(tmp_path)
    print(f"📁 [DEBUG] الملف: {file.filename}")
    print(f"📁 [DEBUG] حجم البيانات المستلمة: {total_bytes:,} بايت ({total_bytes/1024/1024:.2f} MB)")
    print(f"📁 [DEBUG] حجم الملف على القرص: {disk_size:,} بايت ({disk_size/1024/1024:.2f} MB)")

    # تشخيص: مدة الصوت الفعلية باستخدام ffprobe
    try:
        import subprocess
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", tmp_path],
            capture_output=True, text=True, timeout=10
        )
        audio_duration = float(probe.stdout.strip()) if probe.stdout.strip() else 0
        print(f"🎵 [DEBUG] مدة الصوت الفعلية: {audio_duration:.1f} ثانية ({audio_duration/60:.1f} دقيقة)")
    except Exception as e:
        print(f"⚠️ [DEBUG] فشل قراءة مدة الصوت: {e}")
        audio_duration = 0

    try:
        # تفريغ الصوت
        from fastapi.concurrency import run_in_threadpool
        print(f"⏳ [DEBUG] بدء التفريغ...")
        
        # إعداد المشكّل
        try:
            import mishkal.tashkeel
            vocalizer = mishkal.tashkeel.TashkeelClass()
        except ImportError:
            vocalizer = None
            print("⚠️ [DEBUG] لم يتم العثور على مكتبة mishkal. سيتم التخطي بدون تشكيل.")
        
        def run_transcribe():
            segs, inf = model.transcribe(
                tmp_path, 
                language="ar", 
                beam_size=3,
                vad_filter=False,
                condition_on_previous_text=False,
                initial_prompt="هذا تفريغ صوتي باللغة العربية: " 
            )
            return list(segs), inf
            
        segments, info = await run_in_threadpool(run_transcribe)

        results = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue

            # إضافة التشكيل التلقائي إذا كانت المكتبة متاحة
            if vocalizer:
                text = vocalizer.tashkeel(text)

            match = find_matches(text, lecture_type)

            result = {
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": text,
                "type": "quran" if match else "speech",
                "verified": match is not None and match["confidence"] >= 90,
            }

            if match:
                result["match"] = match

            results.append(result)

        # تشخيص: عدد المقاطع وآخر طابع زمني
        if results:
            last_end = max(r["end"] for r in results)
            print(f"✅ [DEBUG] تم استخراج {len(results)} مقطع، آخر طابع زمني: {last_end} ثانية")
        else:
            print(f"⚠️ [DEBUG] لم يتم استخراج أي مقطع!")

        return {
            "success": True,
            "language": info.language,
            "language_confidence": round(info.language_probability, 2),
            "lecture_type": lecture_type,
            "total_segments": len(results),
            "quran_segments": len([r for r in results if r["type"] == "quran"]),
            "results": results
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في المعالجة: {str(e)}")
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5050)
