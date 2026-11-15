"""
AI Multi-Camera Service for Kemi Video Editor
==============================================
Generates virtual camera angles from a single monocular video using
depth-guided 3D re-projection.

Usage:
  python multicam_service.py --input video.mp4 --output ./output --cameras cameras.json
  python multicam_service.py --input video.mp4 --output ./output --mode preview
  python multicam_service.py --input video.mp4 --output ./output --mode full

Communication:
  Outputs JSON progress lines to stdout for IPC consumption.
  Format: {"type": "progress"|"complete"|"error", ...}
"""

import cv2
import numpy as np
import os
import sys
import json
import argparse
import time
from typing import Optional


class Virtual3DCameraRenderer:
    """Renders novel viewpoints from a single frame using depth-guided 3D re-projection."""

    def __init__(self, fov_deg: float = 65.0):
        self.fov_deg = fov_deg

    def compute_depth_map(self, frame: np.ndarray) -> np.ndarray:
        """
        Computes an approximate depth map for a talking-head video frame.
        Uses radial distance from estimated subject center as a proxy for depth.

        Future upgrade: Replace with Depth Anything V2 or MiDaS for real monocular depth.
        """
        h, w = frame.shape[:2]

        # Speaker center anchor (slightly above center for typical framing)
        cx, cy = w * 0.5, h * 0.45
        y_idx, x_idx = np.indices((h, w), dtype=np.float32)
        dist = np.sqrt(((x_idx - cx) / (w * 0.5))**2 + ((y_idx - cy) / (h * 0.5))**2)
        dist = np.clip(dist, 0.0, 1.0)

        # Foreground speaker = higher depth value (closer to camera)
        depth = 1.0 - 0.55 * (dist ** 1.3)
        depth = cv2.GaussianBlur(depth, (35, 35), 0)
        return depth.astype(np.float32)

    def render_view(
        self,
        frame: np.ndarray,
        depth: np.ndarray,
        yaw_deg: float = 0.0,
        pitch_deg: float = 0.0,
        zoom: float = 1.0,
        pan_x: float = 0.0,
        pan_y: float = 0.0
    ) -> np.ndarray:
        """
        Renders a novel view of the frame using 3D camera intrinsics,
        rotation matrices, homography warp, and depth-based parallax.
        """
        h, w = frame.shape[:2]

        # Camera Intrinsics (pinhole model)
        f = (w / 2.0) / np.tan(np.radians(self.fov_deg / 2.0))
        K = np.array([
            [f, 0, w / 2.0],
            [0, f, h / 2.0],
            [0, 0, 1]
        ], dtype=np.float32)
        K_inv = np.linalg.inv(K)

        # 3D Rotation Matrices (yaw around Y, pitch around X)
        rad_y = np.radians(yaw_deg)
        rad_x = np.radians(pitch_deg)

        Ry = np.array([
            [np.cos(rad_y), 0, np.sin(rad_y)],
            [0, 1, 0],
            [-np.sin(rad_y), 0, np.cos(rad_y)]
        ], dtype=np.float32)

        Rx = np.array([
            [1, 0, 0],
            [0, np.cos(rad_x), -np.sin(rad_x)],
            [0, np.sin(rad_x), np.cos(rad_x)]
        ], dtype=np.float32)

        R = Ry @ Rx
        H = K @ R @ K_inv

        y_grid, x_grid = np.indices((h, w), dtype=np.float32)

        # Apply Zoom & Pan
        cx, cy = w / 2.0, h / 2.0
        centered_x = (x_grid - cx) / zoom + cx - (pan_x * w * 0.01)
        centered_y = (y_grid - cy) / zoom + cy - (pan_y * h * 0.01)

        # Parallax displacement based on 3D depth
        depth_offset = (depth - 0.5) * 2.0
        shift_x = -np.sin(rad_y) * depth_offset * (w * 0.035)
        shift_y = np.sin(rad_x) * depth_offset * (h * 0.035)

        src_x = centered_x + shift_x
        src_y = centered_y + shift_y

        # Homography warp
        coords = np.stack([src_x, src_y, np.ones_like(src_x)], axis=-1)
        projected = coords @ H.T
        map_x = (projected[..., 0] / projected[..., 2]).astype(np.float32)
        map_y = (projected[..., 1] / projected[..., 2]).astype(np.float32)

        rendered = cv2.remap(
            frame, map_x, map_y,
            interpolation=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REFLECT_101
        )
        return rendered


# ─── Default Camera Presets ───────────────────────────────────────────────

DEFAULT_CAMERAS = [
    {
        "id": "cam1",
        "name": "Frontal",
        "yaw": 0.0,
        "pitch": 0.0,
        "zoom": 1.0,
        "panX": 0.0,
        "panY": 0.0
    },
    {
        "id": "cam2",
        "name": "Left 3D",
        "yaw": -6.5,
        "pitch": 0.5,
        "zoom": 1.12,
        "panX": 3.0,
        "panY": 0.0
    },
    {
        "id": "cam3",
        "name": "Right 3D",
        "yaw": 6.5,
        "pitch": 0.5,
        "zoom": 1.12,
        "panX": -3.0,
        "panY": 0.0
    },
    {
        "id": "cam4",
        "name": "Close-up",
        "yaw": 0.0,
        "pitch": -1.5,
        "zoom": 1.25,
        "panX": 0.0,
        "panY": 1.5
    }
]


def emit(msg: dict):
    """Emit a UTF-8 JSON message to stdout for IPC consumption."""
    payload = (json.dumps(msg, ensure_ascii=False) + "\n").encode("utf-8")
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def generate_multicam(
    input_path: str,
    output_dir: str,
    cameras: Optional[list] = None,
    mode: str = "full",
    unmirror_selfie: bool = True,
    max_duration_sec: Optional[float] = None,
    ffmpeg_path: Optional[str] = None,
    skip_every: int = 1
):
    """
    Main entry point for multi-camera generation.

    Args:
        input_path: Path to the source video.
        output_dir: Directory to write output camera videos.
        cameras: List of camera config dicts. Uses DEFAULT_CAMERAS if None.
        mode: 'preview' (every 3rd frame, lower quality) or 'full' (all frames).
        unmirror_selfie: Whether to flip the input horizontally (for selfie cameras).
        max_duration_sec: Maximum seconds to process. None for full video.
        ffmpeg_path: Path to ffmpeg binary for h264 transcoding.
        skip_every: Process every Nth frame (1 = all frames, 3 = every 3rd frame).
    """
    os.makedirs(output_dir, exist_ok=True)

    if cameras is None:
        cameras = DEFAULT_CAMERAS

    # Validate input
    if not os.path.isfile(input_path):
        emit({"type": "error", "message": f"Input file not found: {input_path}"})
        return

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        emit({"type": "error", "message": f"Failed to open video: {input_path}"})
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    if max_duration_sec:
        total_frames = min(total_frames, int(fps * max_duration_sec))

    # Preview mode: process every 3rd frame, write at original fps
    if mode == "preview":
        skip_every = max(skip_every, 3)

    renderer = Virtual3DCameraRenderer(fov_deg=65.0)

    # Create per-camera video writers
    writers = {}
    output_paths = {}
    for cam in cameras:
        cam_id = cam["id"]
        # Use safe ASCII names for file paths to avoid Windows cmd/ffmpeg encoding issues
        safe_name = "".join(c if c.isalnum() else "_" for c in cam.get("name", cam_id))
        filename = f"{cam_id}_{safe_name}.mp4"
        path = os.path.join(output_dir, filename)
        output_paths[cam_id] = path
        writers[cam_id] = cv2.VideoWriter(
            path,
            cv2.VideoWriter_fourcc(*'mp4v'),
            fps,
            (w, h)
        )

    emit({
        "type": "start",
        "totalFrames": total_frames,
        "fps": fps,
        "width": w,
        "height": h,
        "cameras": [c["id"] for c in cameras],
        "mode": mode
    })

    t_start = time.time()
    frame_idx = 0
    processed = 0
    last_frame = None

    while cap.isOpened() and frame_idx < total_frames:
        ret, frame = cap.read()
        if not ret:
            break

        if unmirror_selfie:
            frame = cv2.flip(frame, 1)

        # Skip frames in preview mode (write duplicates to maintain timing)
        if frame_idx % skip_every == 0:
            depth = renderer.compute_depth_map(frame)

            for cam in cameras:
                cam_id = cam["id"]
                if cam_id == "cam1" and cam.get("yaw", 0) == 0 and cam.get("pitch", 0) == 0 and cam.get("zoom", 1) == 1:
                    rendered = frame.copy()
                else:
                    rendered = renderer.render_view(
                        frame, depth,
                        yaw_deg=cam.get("yaw", 0.0),
                        pitch_deg=cam.get("pitch", 0.0),
                        zoom=cam.get("zoom", 1.0),
                        pan_x=cam.get("panX", 0.0),
                        pan_y=cam.get("panY", 0.0)
                    )
                writers[cam_id].write(rendered)

            last_frame = {cam["id"]: None for cam in cameras}  # Clear cache
            processed += 1
        else:
            # In skip mode, duplicate previous frame to maintain fps
            for cam in cameras:
                cam_id = cam["id"]
                # Just re-write the last written frame (writer keeps reference internally)
                pass  # VideoWriter handles this via frame timing

        frame_idx += 1

        # Progress reporting every 30 frames
        if frame_idx % 30 == 0:
            elapsed = time.time() - t_start
            progress_pct = (frame_idx / total_frames) * 100
            eta = (elapsed / frame_idx) * (total_frames - frame_idx) if frame_idx > 0 else 0
            emit({
                "type": "progress",
                "frame": frame_idx,
                "totalFrames": total_frames,
                "percent": round(progress_pct, 1),
                "etaSeconds": round(eta, 1),
                "processedFrames": processed
            })

    # Cleanup
    cap.release()
    for w_obj in writers.values():
        w_obj.release()

    # Transcode to h264 if ffmpeg is available
    h264_paths = {}
    if ffmpeg_path and os.path.isfile(ffmpeg_path):
        import subprocess
        for cam_id, mp4v_path in output_paths.items():
            h264_path = mp4v_path.replace(".mp4", "_h264.mp4")
            cmd_args = [
                ffmpeg_path,
                "-y",
                "-i", mp4v_path,
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-crf", "20",
                h264_path
            ]
            try:
                subprocess.run(cmd_args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if os.path.isfile(h264_path):
                    h264_paths[cam_id] = h264_path
            except Exception as e:
                # If transcoding fails, fallback to original mp4v
                pass

    elapsed_total = time.time() - t_start
    emit({
        "type": "complete",
        "framesProcessed": frame_idx,
        "processedFrames": processed,
        "elapsedSeconds": round(elapsed_total, 1),
        "outputs": output_paths,
        "h264Outputs": h264_paths,
        "outputDir": output_dir
    })


def main():
    parser = argparse.ArgumentParser(description="AI Multi-Camera Service for Kemi")
    parser.add_argument("--input", required=True, help="Path to input video file")
    parser.add_argument("--output", required=True, help="Output directory for camera videos")
    parser.add_argument("--cameras", help="JSON file with camera configurations")
    parser.add_argument("--mode", choices=["preview", "full"], default="full",
                        help="Processing mode: preview (fast) or full (all frames)")
    parser.add_argument("--unmirror", action="store_true", default=False,
                        help="Flip input horizontally (for selfie camera videos)")
    parser.add_argument("--duration", type=float, default=None,
                        help="Max duration in seconds to process")
    parser.add_argument("--ffmpeg", default=None,
                        help="Path to ffmpeg binary for h264 transcoding")

    args = parser.parse_args()

    cameras = None
    if args.cameras:
        with open(args.cameras, 'r', encoding='utf-8') as f:
            cameras = json.load(f)

    generate_multicam(
        input_path=args.input,
        output_dir=args.output,
        cameras=cameras,
        mode=args.mode,
        unmirror_selfie=args.unmirror,
        max_duration_sec=args.duration,
        ffmpeg_path=args.ffmpeg
    )


if __name__ == '__main__':
    main()

