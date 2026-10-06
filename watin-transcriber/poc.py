import os
import re
import json
import requests
from faster_whisper import WhisperModel
from rapidfuzz import process, fuzz

QURAN_JSON_FILE = "quran_normalized.json"

def normalize_text(text):
    """
    تطبيع النص المبدئي بناءً على الخطة:
    حذف التشكيل، توحيد الهمزات، حذف الألف الخنجرية الخ...
    """
    if not text:
        return ""
    
    # حذف التشكيل (الحركات)
    text = re.sub(r'[\u064B-\u065F\u0670]', '', text)
    
    # توحيد الهمزات والألف
    text = re.sub(r'[أإآ]', 'ا', text)
    text = re.sub(r'ؤ', 'و', text)
    text = re.sub(r'ئ', 'ي', text)
    
    # توحيد الياء والألف المقصورة
    text = re.sub(r'ى', 'ي', text)
    
    # توحيد التاء المربوطة والهاء
    text = re.sub(r'ة', 'ه', text)
    
    # علامات الوقف والأقواس
    text = re.sub(r'[^\w\s]', '', text)
    
    # إزالة المسافات الزائدة
    text = ' '.join(text.split())
    
    return text

def download_quran_if_needed():
    if os.path.exists(QURAN_JSON_FILE):
        return
    print("جاري تحميل نص القرآن الكريم للفهرسة من API...")
    
    normalized_quran = []
    
    res = requests.get("http://api.alquran.cloud/v1/quran/quran-uthmani")
    data = res.json()['data']['surahs']
    
    for surah in data:
        for ayah in surah['ayahs']:
            normalized_quran.append({
                "surah_number": surah['number'],
                "surah_name": surah['englishName'],
                "ayah_number": ayah['numberInSurah'],
                "original_text": ayah['text'],
                "normalized_text": normalize_text(ayah['text'])
            })
            
    with open(QURAN_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(normalized_quran, f, ensure_ascii=False, indent=2)
    print("تم الانتهاء من تحميل الفهرس.")

def load_quran_index():
    with open(QURAN_JSON_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def find_best_match(transcribed_text, quran_index):
    normalized_transcribed = normalize_text(transcribed_text)
    if len(normalized_transcribed.split()) < 3:
        return None # نص قصير جدا للمطابقة
        
    # نستخرج قائمة النصوص المطبّعة
    choices = [ayah['normalized_text'] for ayah in quran_index]
    
    # استخراج أفضل تطابق
    # partial_ratio ممتاز إذا كان الشيخ يقرأ جزء من الآية
    match = process.extractOne(normalized_transcribed, choices, scorer=fuzz.partial_ratio)
    
    if match and match[1] > 80: # نسبة الثقة
        matched_index = match[2]
        return quran_index[matched_index], match[1]
    
    return None

def main(audio_file):
    if not os.path.exists(audio_file):
        print(f"الملف {audio_file} غير موجود. يرجى توفير ملف صوتي باسم {audio_file} في نفس المجلد.")
        return

    download_quran_if_needed()
    quran_index = load_quran_index()

    print("جاري تشغيل Whisper (Turbo)...")
    # نستخدم turbo لسرعته على الأجهزة العادية
    model = WhisperModel("turbo", device="cpu", compute_type="int8")
    
    segments, info = model.transcribe(audio_file, language="ar", beam_size=5)
    
    print(f"تم التعرف على اللغة: {info.language} بثقة {info.language_probability}")
    
    print("\n--- النتائج ---")
    for segment in segments:
        text = segment.text
        print(f"[{segment.start:.2f}s -> {segment.end:.2f}s] {text}")
        
        # محاولة المطابقة
        match = find_best_match(text, quran_index)
        if match:
            ayah_info, score = match
            print(f"  --> [تم اكتشاف تلاوة] سورة {ayah_info['surah_name']} آية {ayah_info['ayah_number']}")
            print(f"  --> [النص الأصلي من المصحف]: {ayah_info['original_text']}")
            print(f"  --> [نسبة التطابق]: {score}%\n")
        else:
            print("  --> [كلام عادي/شرح]\n")

if __name__ == "__main__":
    main("test.mp3")
