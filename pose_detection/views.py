import base64
import cv2
import numpy as np
import mediapipe as mp

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

mp_pose = mp.solutions.pose

def _calculate_angle(a, b, c):
    """
    Given three 2D points a, b, c (each a tuple of (x, y)),
    return the angle at b (in degrees) formed by lines BA and BC.
    """
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)

    ba = a - b
    bc = c - b
    cos_angle = np.dot(ba, bc) / ((np.linalg.norm(ba) * np.linalg.norm(bc)) + 1e-6)
    angle = np.degrees(np.arccos(np.clip(cos_angle, -1.0, 1.0)))
    return float(angle)

@csrf_exempt
def detect_pose(request):
    """
    POST endpoint that accepts an image file ('frame'), runs MediaPipe Pose,
    draws joint circles + connecting lines, computes eight angles
    (right/left elbow, knee, shoulder, wrist), and returns JSON with:
      {
        "annotated_image": "data:image/png;base64,…",
        "angles": {
          "right_elbow":   float,
          "left_elbow":    float,
          "right_knee":    float,
          "left_knee":     float,
          "right_shoulder":float,
          "left_shoulder": float,
          "right_wrist":   float,
          "left_wrist":    float
        }
      }
    """
    if request.method != "POST":
        return JsonResponse({"error": "Only POST allowed"}, status=405)

    image_file = request.FILES.get("frame")
    if image_file is None:
        return JsonResponse({"error": "No frame provided"}, status=400)

    file_bytes = np.asarray(bytearray(image_file.read()), dtype=np.uint8)
    frame_bgr = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if frame_bgr is None:
        return JsonResponse({"error": "Invalid image data"}, status=400)

    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    with mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.5) as pose:
        results = pose.process(frame_rgb)
        if not results.pose_landmarks:
            return JsonResponse({"error": "No person/landmarks detected"}, status=200)

        annotated = frame_bgr.copy()
        lm = results.pose_landmarks.landmark
        h, w, _ = annotated.shape

        def _to_pixel(idx):
            return (int(lm[idx].x * w), int(lm[idx].y * h))

        RIGHT_SHOULDER = mp_pose.PoseLandmark.RIGHT_SHOULDER.value
        RIGHT_ELBOW    = mp_pose.PoseLandmark.RIGHT_ELBOW.value
        RIGHT_WRIST    = mp_pose.PoseLandmark.RIGHT_WRIST.value
        LEFT_SHOULDER  = mp_pose.PoseLandmark.LEFT_SHOULDER.value
        LEFT_ELBOW     = mp_pose.PoseLandmark.LEFT_ELBOW.value
        LEFT_WRIST     = mp_pose.PoseLandmark.LEFT_WRIST.value

        RIGHT_HIP   = mp_pose.PoseLandmark.RIGHT_HIP.value
        RIGHT_KNEE  = mp_pose.PoseLandmark.RIGHT_KNEE.value
        RIGHT_ANKLE = mp_pose.PoseLandmark.RIGHT_ANKLE.value
        LEFT_HIP    = mp_pose.PoseLandmark.LEFT_HIP.value
        LEFT_KNEE   = mp_pose.PoseLandmark.LEFT_KNEE.value
        LEFT_ANKLE  = mp_pose.PoseLandmark.LEFT_ANKLE.value

        r_shldr = _to_pixel(RIGHT_SHOULDER)
        r_elbow = _to_pixel(RIGHT_ELBOW)
        r_wrist = _to_pixel(RIGHT_WRIST)
        l_shldr = _to_pixel(LEFT_SHOULDER)
        l_elbow = _to_pixel(LEFT_ELBOW)
        l_wrist = _to_pixel(LEFT_WRIST)

        r_hip   = _to_pixel(RIGHT_HIP)
        r_knee  = _to_pixel(RIGHT_KNEE)
        r_ankle = _to_pixel(RIGHT_ANKLE)
        l_hip   = _to_pixel(LEFT_HIP)
        l_knee  = _to_pixel(LEFT_KNEE)
        l_ankle = _to_pixel(LEFT_ANKLE)

        right_elbow_angle   = _calculate_angle(r_shldr, r_elbow, r_wrist)
        left_elbow_angle    = _calculate_angle(l_shldr, l_elbow, l_wrist)

        right_knee_angle    = _calculate_angle(r_hip, r_knee, r_ankle)
        left_knee_angle     = _calculate_angle(l_hip, l_knee, l_ankle)

        right_shldr_angle   = _calculate_angle(r_elbow, r_shldr, r_hip)
        left_shldr_angle    = _calculate_angle(l_elbow, l_shldr, l_hip)

        right_wrist_angle   = _calculate_angle(r_elbow, r_wrist, r_shldr)
        left_wrist_angle    = _calculate_angle(l_elbow, l_wrist, l_shldr)

        cv2.circle(annotated, r_elbow,  8, (0,   0,   255), thickness=-1)
        cv2.circle(annotated, l_elbow,  8, (0,   0,   255), thickness=-1)
        cv2.circle(annotated, r_knee,   8, (0,   255, 0),   thickness=-1)
        cv2.circle(annotated, l_knee,   8, (0,   255, 0),   thickness=-1)
        cv2.circle(annotated, r_shldr,  8, (0,   255, 255), thickness=-1)
        cv2.circle(annotated, l_shldr,  8, (0,   255, 255), thickness=-1)
        cv2.circle(annotated, r_wrist,  8, (255, 0,   0),   thickness=-1)
        cv2.circle(annotated, l_wrist,  8, (255, 0,   0),   thickness=-1)

        cv2.line(annotated, r_shldr, r_elbow, (0,   0,   255), 2)
        cv2.line(annotated, r_elbow,  r_wrist, (0,   0,   255), 2)
        cv2.line(annotated, l_shldr, l_elbow, (0,   0,   255), 2)
        cv2.line(annotated, l_elbow,  l_wrist, (0,   0,   255), 2)

        cv2.line(annotated, r_hip,  r_knee,  (0,   255, 0),   2)
        cv2.line(annotated, r_knee, r_ankle, (0,   255, 0),   2)
        cv2.line(annotated, l_hip,  l_knee,  (0,   255, 0),   2)
        cv2.line(annotated, l_knee, l_ankle, (0,   255, 0),   2)

        cv2.line(annotated, r_elbow, r_shldr, (0,   255, 255), 2)
        cv2.line(annotated, r_shldr, r_hip,   (0,   255, 255), 2)
        cv2.line(annotated, l_elbow, l_shldr, (0,   255, 255), 2)
        cv2.line(annotated, l_shldr, l_hip,   (0,   255, 255), 2)

        cv2.line(annotated, r_elbow, r_wrist, (255, 0,   0),   2)
        cv2.line(annotated, r_wrist, r_shldr, (255, 0,   0),   2)
        cv2.line(annotated, l_elbow, l_wrist, (255, 0,   0),   2)
        cv2.line(annotated, l_wrist, l_shldr, (255, 0,   0),   2)

        angles = {
            "right_elbow":    round(right_elbow_angle,   2),
            "left_elbow":     round(left_elbow_angle,    2),
            "right_knee":     round(right_knee_angle,    2),
            "left_knee":      round(left_knee_angle,     2),
            "right_shoulder": round(right_shldr_angle,   2),
            "left_shoulder":  round(left_shldr_angle,    2),
            "right_wrist":    round(right_wrist_angle,   2),
            "left_wrist":     round(left_wrist_angle,    2),
        }

        success, buffer = cv2.imencode(".png", annotated)
        if not success:
            return JsonResponse({"error": "Failed to encode image"}, status=500)
        annotated_b64 = base64.b64encode(buffer.tobytes()).decode("utf-8")
        data_uri = f"data:image/png;base64,{annotated_b64}"

        return JsonResponse({
            "annotated_image": data_uri,
            "angles": angles
        })
