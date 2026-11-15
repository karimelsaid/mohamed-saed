import cv2
import numpy as np
import os
import sys

class Virtual3DCameraRenderer:
    def __init__(self, fov_deg=60.0):
        self.fov_deg = fov_deg

    def compute_depth_and_subject_map(self, frame):
        """
        Calculates depth map and foreground isolation for the speaker.
        """
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Approximate face/speaker anchor at center
        cx, cy = w * 0.5, h * 0.45
        y_idx, x_idx = np.indices((h, w), dtype=np.float32)
        dist = np.sqrt(((x_idx - cx) / (w * 0.5))**2 + ((y_idx - cy) / (h * 0.5))**2)
        dist = np.clip(dist, 0.0, 1.0)
        
        # Foreground speaker has higher depth (closer to camera)
        depth = 1.0 - 0.55 * (dist ** 1.3)
        depth = cv2.GaussianBlur(depth, (35, 35), 0)
        return depth.astype(np.float32)

    def render_view(self, frame, depth, yaw_deg=0.0, pitch_deg=0.0, zoom=1.0, pan_x=0.0, pan_y=0.0):
        h, w = frame.shape[:2]

        # Camera Intrinsics
        f = (w / 2.0) / np.tan(np.radians(self.fov_deg / 2.0))
        K = np.array([
            [f, 0, w / 2.0],
            [0, f, h / 2.0],
            [0, 0, 1]
        ], dtype=np.float32)
        K_inv = np.linalg.inv(K)

        # 3D Rotation Matrix
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

        # Parallax displacement based on 3D depth difference
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

def run_poc(video_path, output_dir=r"D:\My projects\kemi\public\poc_output", duration_sec=5.0, unmirror_selfie=True):
    os.makedirs(output_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Failed to open input video:", video_path)
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    max_frames = int(fps * duration_sec)

    renderer = Virtual3DCameraRenderer(fov_deg=65.0)

    # 4 virtual camera writers
    writers = {
        'cam1': cv2.VideoWriter(os.path.join(output_dir, "cam1_frontal.mp4"), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h)),
        'cam2': cv2.VideoWriter(os.path.join(output_dir, "cam2_left_3d.mp4"), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h)),
        'cam3': cv2.VideoWriter(os.path.join(output_dir, "cam3_right_3d.mp4"), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h)),
        'cam4': cv2.VideoWriter(os.path.join(output_dir, "cam4_cinematic_closeup.mp4"), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h)),
    }
    grid_writer = cv2.VideoWriter(os.path.join(output_dir, "multicam_4view_grid.mp4"), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))

    print(f"Generating 4-camera simulation (unmirror={unmirror_selfie}) for {max_frames} frames ({w}x{h} @ {fps:.1f}fps)...")

    frame_idx = 0
    while cap.isOpened() and frame_idx < max_frames:
        ret, frame = cap.read()
        if not ret:
            break

        # [Stage A: Ingestion Orientation Normalization]
        # Front-facing (selfie) mobile cameras record in mirror mode ("Save as previewed").
        # Un-mirroring at the input frame level ensures the true physical orientation
        # is preserved across ALL virtual cameras (CAM 1-4) and 3D depth geometry.
        if unmirror_selfie:
            frame = cv2.flip(frame, 1)

        depth = renderer.compute_depth_and_subject_map(frame)

        # 1. CAM 1: Original Frontal (Baseline with correct physical orientation)
        c1 = frame.copy()

        # 2. CAM 2: 3D Left Angle (Yaw: -6.5 deg, slight reframe)
        c2 = renderer.render_view(frame, depth, yaw_deg=-6.5, pitch_deg=0.5, zoom=1.12, pan_x=3.0)

        # 3. CAM 3: 3D Right Angle (Yaw: +6.5 deg, slight reframe)
        c3 = renderer.render_view(frame, depth, yaw_deg=6.5, pitch_deg=0.5, zoom=1.12, pan_x=-3.0)

        # 4. CAM 4: 3D Cinematic Close-up (1.25x zoom, slight pitch tilt)
        c4 = renderer.render_view(frame, depth, yaw_deg=0.0, pitch_deg=-1.5, zoom=1.25, pan_y=1.5)

        writers['cam1'].write(c1)
        writers['cam2'].write(c2)
        writers['cam3'].write(c3)
        writers['cam4'].write(c4)

        # Quad-view
        half_w, half_h = w // 2, h // 2
        top_row = np.hstack([cv2.resize(c1, (half_w, half_h)), cv2.resize(c2, (half_w, half_h))])
        bot_row = np.hstack([cv2.resize(c3, (half_w, half_h)), cv2.resize(c4, (half_w, half_h))])
        grid = np.vstack([top_row, bot_row])

        # Badges
        cv2.putText(grid, "CAM 1: FRONTAL", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        cv2.putText(grid, "CAM 2: 3D LEFT (-6.5 deg)", (half_w + 20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        cv2.putText(grid, "CAM 3: 3D RIGHT (+6.5 deg)", (20, half_h + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        cv2.putText(grid, "CAM 4: 3D CLOSE-UP (1.25x)", (half_w + 20, half_h + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

        grid_writer.write(grid)

        frame_idx += 1
        if frame_idx % 30 == 0:
            print(f"Rendered {frame_idx}/{max_frames} frames...")

    cap.release()
    for w_obj in writers.values():
        w_obj.release()
    grid_writer.release()
    print("Done! All videos exported to:", output_dir)

if __name__ == '__main__':
    src = r"D:\My projects\kemi\public\VID_20261031_044956_240_bsl.mp4"
    run_poc(src, duration_sec=6.0)

