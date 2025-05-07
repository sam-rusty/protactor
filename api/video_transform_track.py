from aiortc import MediaStreamTrack
from aiortc.mediastreams import MediaStreamError
import av
import numpy as np
import cv2
from datetime import datetime
import asyncio
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
        self.on_suspicious_activity = None

    async def recv(self):
        # print(f"recv frame to check suspicious activity")
        self.frame_count += 1
        if self.frame_count % FRAME_SKIP != 0:
            return await self.track.recv()

        try:
            frame = await self.track.recv()
            img = self._convert_frame_to_ndarray(frame)
            if img is None:
                return await self.track.recv()

            last_suspicious_activity = self._process_frame(img)
            # log.info(f"Processed frame - Activity detected: {last_suspicious_activity}")
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
            log.info(f"Face detection - Count: {face_count}")
            if face_count == 1:
                activity = self._estimate_head_pose(faces[0], img)
                log.info(f"Head pose estimation - Activity: {activity}")
                return activity
            elif face_count > 1:
                log.info("Multiple faces detected")
                return "Multiple faces"
            else:
                log.info("No face detected")
                return "No face"
        except Exception as e:
            log.error(f"Error processing frame: {e}")
            return None

    def _estimate_head_pose(self, face, img):
        try:
            head_pos = estimate_head_pose([face], img)
            log.info(f"Head position: {head_pos}")
            if head_pos != "center":
                return "Looking away"
            return None
        except Exception as e:
            log.error(f"Error estimating head pose: {e}")
            return None

    async def _log_suspicious_activity(self, activity):
        if activity and activity != self.last_suspicious_activity:
            try:
                # Log to database
                db = self.app["db"]
                async with db.cursor(row_factory=psycopg.rows.dict_row) as cur:
                    log.info(f"Logging suspicious activity to database: {activity}")
                    await cur.execute(
                        "INSERT INTO user_suspicious_activities (user_id, activity) VALUES (%s, %s)",
                        (1, activity),
                    )
                    await db.commit()

                # Emit socket event
                activity_data = {
                    "activity": activity,
                    "timestamp": datetime.now().isoformat(),
                    "id": int(datetime.now().timestamp())
                }
                log.info(f"Preparing to emit suspicious activity: {activity_data}")
                if self.on_suspicious_activity:
                    log.info("Calling on_suspicious_activity callback")
                    await self.on_suspicious_activity(activity_data)
                else:
                    log.warning("No on_suspicious_activity callback set")

                self.last_suspicious_activity = activity
            except Exception as e:
                log.error(f"Error logging suspicious activity: {e}")
