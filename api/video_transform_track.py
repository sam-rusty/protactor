from aiortc import MediaStreamTrack
import av
import numpy as np
import psycopg

from ml_models import detect_faces, estimate_head_pose
from logger import log

av.logging.set_level(av.logging.ERROR)

# Frame processing settings
FRAME_SKIP = 5

class VideoTransformTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, track, socket_id, app):
        super().__init__()
        self.app = app
        self.track = track
        self.socket_id = socket_id
        self.frame_count = 0
        self.last_suspicious_activity = None

    async def recv(self):
        self.frame_count += 1
        if self.frame_count % FRAME_SKIP != 0:
            return await self.track.recv()

        try:
            frame = await self.track.recv()
            img = self._convert_frame_to_ndarray(frame)
            if img is None:
                return await self.track.recv()

            last_suspicious_activity = self._process_frame(img)
            await self._log_suspicious_activity(last_suspicious_activity)

            return await self.track.recv()

        except Exception as e:
            log.error(f"Error processing frame: {e}")
            return await self.track.recv()

    def _convert_frame_to_ndarray(self, frame):
        try:
            img = frame.to_ndarray(format="bgr24")
            if (
                img is None
                or img.size == 0
                or len(img.shape) != 3
                or img.shape[2] != 3
            ):
                log.error("Invalid frame format received")
                return None

            if img.shape[0] <= 0 or img.shape[1] <= 0:
                log.error("Invalid frame dimensions")
                return None

            if not img.flags["C_CONTIGUOUS"]:
                img = np.ascontiguousarray(img)

            return img
        except Exception as e:
            log.error(f"Error converting frame: {e}")
            return None

    def _process_frame(self, img):
        try:
            face_count, faces = detect_faces(img)
            if face_count == 1:
                return self._estimate_head_pose(faces[0], img)
            elif face_count > 1:
                return "Multiple faces"
            else:
                return "No face"
        except Exception as e:
            log.error(f"Error processing frame: {e}")
            return None

    def _estimate_head_pose(self, face, img):
        try:
            head_pos = estimate_head_pose([face], img)
            if head_pos != "center":
                return "Looking away"
            return None
        except Exception as e:
            log.error(f"Error estimating head pose: {e}")
            return None

    async def _log_suspicious_activity(self, activity):
        if activity and activity != self.last_suspicious_activity:
            try:
                db = self.app["db"]
                async with db.cursor(row_factory=psycopg.rows.dict_row) as cur:
                    print(f"Logging suspicious activity: {activity}")
                    await cur.execute(
                        "INSERT INTO user_suspicious_activities (user_id, activity) VALUES (%s, %s)",
                        (1, activity),
                    )
                    await db.commit()
                self.last_suspicious_activity = activity
            except Exception as e:
                log.error(f"Error logging suspicious activity: {e}")
