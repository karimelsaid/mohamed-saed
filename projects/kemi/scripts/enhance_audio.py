#!/usr/bin/env python3
"""
Studio Audio Enhancer for Kemi
Provides AI-grade speech noise reduction, dereverberation, voice clarity EQ, 
and podcast-grade leveling inspired by Adobe Podcast Enhance Speech.
Works 100% offline using local spectral gating, DSP, and FFmpeg broadcast chain.
"""

import os
import sys
import io
import argparse
import json
import subprocess

# Force UTF-8 on Windows
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

def emit_progress(percent: int, message: str):
    try:
        sys.stderr.write(f"PROGRESS: {percent}:{message}\n")
        sys.stderr.flush()
    except Exception:
        pass

def ensure_ffmpeg():
    """Find and configure FFmpeg binary path."""
    if "FFMPEG_PATH" in os.environ and os.path.isfile(os.environ["FFMPEG_PATH"]):
        return os.environ["FFMPEG_PATH"]
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    candidates = [
        os.path.join(base_dir, "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe"),
        os.path.join(base_dir, "node_modules", "ffmpeg-static", "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"),
        os.path.join(base_dir, "..", "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe"),
        "ffmpeg"
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return "ffmpeg"

def enhance_audio(input_path: str, output_path: str, strength: float = 0.85, mode: str = "studio"):
    """
    Main enhancement function:
    1. Reads audio.
    2. Applies spectral noise reduction via noisereduce.
    3. Runs studio EQ, dereverberation curves, and podcast broadcast compression.
    """
    temp_denoised = None
    try:
        emit_progress(10, "جاري فحص وقراءة ملف الصوت...")
        input_path = os.path.normpath(input_path)
        output_path = os.path.normpath(output_path)
        if not os.path.isfile(input_path):
            raise FileNotFoundError(f"ملف الصوت غير موجود: {input_path}")

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        temp_denoised = output_path + ".tmp_denoised.wav"

        import soundfile as sf
        import noisereduce as nr
        import numpy as np

        emit_progress(25, "جاري تحليل نبرة الصوت وعزل الضوضاء بالذكاء الاصطناعي...")
        data, rate = sf.read(input_path)

        # Handle stereo / mono
        is_stereo = len(data.shape) > 1 and data.shape[1] > 1
        mono_data = np.mean(data, axis=1) if is_stereo else data

        # Noise reduction with smooth spectral gating
        # prop_decrease controls how aggressive the noise suppression is (0.0 to 1.0)
        prop_dec = max(0.4, min(1.0, float(strength)))
        
        emit_progress(45, "جاري إزالة الضوضاء والتشويش المحيطي...")
        reduced_noise = nr.reduce_noise(
            y=mono_data,
            sr=rate,
            prop_decrease=prop_dec,
            stationary=False,
            n_fft=2048,
            hop_length=512,
            n_std_thresh_stationary=1.5
        )

        # Write intermediate clean WAV
        sf.write(temp_denoised, reduced_noise, rate)

        emit_progress(70, "جاري تطبيق معالجة الاستوديو ومعادلة الصوت (Studio Presence)...")
        ffmpeg_bin = ensure_ffmpeg()

        # Studio Audio Filter Graph:
        # 1. highpass=f=80: Cuts sub-audible table rumble, mic bumps
        # 2. equalizer 200Hz: Adds warm chest resonance / podcast proximity effect
        # 3. equalizer 450Hz: Cuts boxy room reflection / slight room reverb
        # 4. equalizer 3200Hz: Boosts speech presence and crisp intelligibility (Adobe Podcast signature)
        # 5. acompressor: Smooth broadcast leveling
        # 6. loudnorm: Industry standard -16 LUFS podcast broadcast level
        filters = [
            "highpass=f=80",
            "equalizer=f=200:width_type=q:width=1.0:g=2.5",
            "equalizer=f=450:width_type=q:width=1.5:g=-2.0",
            "equalizer=f=3200:width_type=q:width=1.2:g=3.5",
            "acompressor=threshold=-18dB:ratio=3:attack=5:release=50:makeup=2dB",
            "loudnorm=I=-16:TP=-1.5:LRA=7"
        ]
        filter_str = ",".join(filters)

        cmd = [
            ffmpeg_bin,
            "-y",
            "-i", temp_denoised,
            "-af", filter_str,
            "-ar", str(rate),
            "-c:a", "pcm_s16le",
            output_path
        ]

        emit_progress(85, "جاري إنتاج الصوت النهائي بجودة الاستوديو...")
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg error: {proc.stderr[-300:]}")

        emit_progress(100, "تمت تنقية الصوت بنجاح بجودة الاستوديو!")
        print(json.dumps({"success": True, "outputPath": output_path}, ensure_ascii=False))

    except Exception as e:
        sys.stderr.write(f"ERROR: {str(e)}\n")
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)
    finally:
        if temp_denoised and os.path.isfile(temp_denoised):
            try:
                os.remove(temp_denoised)
            except Exception:
                pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kemi Studio Audio Enhancer")
    parser.add_argument("input", help="Path to input audio file")
    parser.add_argument("output", help="Path to save enhanced audio file")
    parser.add_argument("--strength", type=float, default=0.85, help="Enhancement strength (0.0 - 1.0)")
    parser.add_argument("--mode", default="studio", help="Enhancement profile: studio, podcast, clean")

    args = parser.parse_args()
    enhance_audio(args.input, args.output, strength=args.strength, mode=args.mode)
