import cv2
import dlib
import cv2
import dlib
from logger import log

face_detector = dlib.get_frontal_face_detector()
log.warning("Face detector initialized")

def detect_faces(image):
    """Face detection using dlib"""
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = face_detector(gray)
        return len(faces), faces
    except Exception as e:
        log.error(f"Face detection error: {e}")
        return 0, []

def estimate_head_pose(faces, image):
    """Simple head pose estimation based on face position"""
    if not faces:
        return -1
    try:
        face = faces[0]
        # Get face center
        center_x = face.left() + face.width() // 2
        image_center = image.shape[1] // 2
        
        # Simple left/right estimation based on face position
        if center_x > image_center + 50:  # Right threshold
            return "right"
        elif center_x < image_center - 50:  # Left threshold
            return "left"
        else:
            return "center"
    except Exception as e:
        log.error(f"Head pose estimation error: {e}")
        return -1

def convert_opencv_to_dlib_rect(rect):
    """Convert OpenCV rectangle (x, y, w, h) to dlib rectangle"""
    if isinstance(rect, dlib.rectangle):
        return rect
    try:
        x, y, w, h = rect
        return dlib.rectangle(int(x), int(y), int(x + w), int(y + h))
    except Exception as e:
        log.error(f"Error converting rectangle: {rect}, error: {e}")
        return None