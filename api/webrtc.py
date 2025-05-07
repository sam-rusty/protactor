from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCConfiguration, RTCIceServer
from aiohttp import web
import re
from socket_server import socket
from logger import log
from video_transform_track import VideoTransformTrack
import asyncio
from aiortc.exceptions import InvalidStateError
from contextlib import suppress

# Initialize Socket.IO server
app = web.Application()
socket.attach(app)

# Store peer connections for both students and admins
students_peer = set()
admin_peer = set()
# Store admin socket IDs for each student
student_admin_map = {}
# Store cleanup tasks to prevent race conditions
cleanup_tasks = {}

# Define STUN servers
ice_config = RTCConfiguration([
    RTCIceServer(urls=["stun:stun.l.google.com:19302"])
])

async def safe_cleanup(pc, student_id=None):
    """Safely cleanup a peer connection with proper error handling"""
    try:
        if pc in students_peer:
            log.info(f"Removing peer connection for student {student_id}")
            students_peer.discard(pc)
            
            # Remove admin mapping if this was the last connection for the student
            if student_id and not any(p.student_id == student_id for p in students_peer):
                if student_id in student_admin_map:
                    del student_admin_map[student_id]
        
        # Close all transceivers first
        for transceiver in pc.getTransceivers():
            with suppress(Exception):
                await transceiver.stop()
        
        # Close all data channels
        for channel in pc.sctp.transport.channels.values():
            with suppress(Exception):
                await channel.close()
        
        # Close the peer connection
        if pc.connectionState != "closed":
            try:
                await pc.close()
            except Exception as e:
                log.error(f"Error closing peer connection: {e}")
    except Exception as e:
        log.error(f"Error in safe_cleanup: {e}")

@socket.event
async def connect(sid, environ):
    log.warning(f"Client connected: {sid}")

@socket.event
async def offer(sid, data):
    try:
        student_id = data.get('studentId')
        if not student_id:
            log.error(f"No student ID provided in offer from {sid}")
            return

        log.info(f"Received offer from student {student_id} (socket: {sid})")
        
        # Check if this is an admin offer
        is_admin_offer = data.get('isAdminOffer', False)
        admin_id = data.get('adminId')
        from_admin = data.get('fromAdmin', False)
        
        if is_admin_offer:
            # This is an admin offer, just forward it to the student
            log.info(f"Forwarding admin offer to student {student_id}")
            await socket.emit("offer", {
                "sdp": data["sdp"],
                "type": data["type"],
                "studentId": student_id,
                "isAdminOffer": True,
                "adminId": admin_id,
                "fromAdmin": from_admin
            }, to=sid)
            return
        
        # Create a peer connection for video analysis
        pc = RTCPeerConnection(ice_config)
        pc.student_id = student_id
        pc.socket_id = sid
        pc.is_analysis = True  # Mark this as analysis connection
        students_peer.add(pc)

        @pc.on("track")
        async def on_track(track):
            log.info(f"Received track {track.kind} id={track.id}")
            if track.kind == "video":
                log.info(f"Received video track from student {student_id}")
                try:
                    # Create a video transform track for analysis
                    video_transform = VideoTransformTrack(track, sid, app)
                    
                    # Set up the callback for suspicious activity
                    async def notify_admin(activity_data):
                        log.info(f"Suspicious activity detected for student {student_id}: {activity_data}")
                        admin_sid = student_admin_map.get(student_id)
                        if admin_sid:
                            log.info(f"Sending suspicious activity notification to admin {admin_sid}")
                            await socket.emit("suspicious_activity", {
                                "studentId": student_id,
                                "activity": activity_data["activity"],
                                "timestamp": activity_data["timestamp"],
                                "id": activity_data["id"]
                            }, to=admin_sid)
                        else:
                            log.warning(f"No admin found for student {student_id}")
                    
                    # Set the callback on the transform track
                    video_transform.on_suspicious_activity = notify_admin
                    log.info(f"Set up suspicious activity callback for student {student_id}")
                    
                    # Add the transform track to the peer connection
                    pc.addTrack(video_transform)
                    log.info(f"Added video transform track for analysis")
                    
                    # Start receiving frames
                    while True:
                        try:
                            frame = await video_transform.recv()
                            if frame is None:
                                break
                        except Exception as e:
                            log.error(f"Error receiving frame: {e}")
                            break
                except Exception as e:
                    log.error(f"Error setting up video transform track: {e}")

        @pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            log.info(f"Student {student_id} ICE connection state changed to {pc.iceConnectionState}")
            if pc.iceConnectionState == "failed":
                await pc.close()
                students_peer.discard(pc)

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            log.info(f"Student {student_id} connection state changed to {pc.connectionState}")
            if pc.connectionState == "failed":
                await pc.close()
                students_peer.discard(pc)

        # Set up the peer connection for analysis
        offer = RTCSessionDescription(sdp=data["sdp"], type=data["type"])
        await pc.setRemoteDescription(offer)
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        # Send answer back to student for analysis
        await socket.emit("answer", {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type,
            "studentId": student_id,
            "isAnalysis": True  # Mark this as analysis answer
        }, to=sid)

        # Forward the original offer to other clients (for direct browser-to-browser)
        await socket.emit("offer", {
            "sdp": data["sdp"],
            "type": data["type"],
            "studentId": student_id
        }, skip_sid=sid)

    except Exception as e:
        log.error(f"Error handling offer: {e}")
        if 'pc' in locals():
            await pc.close()
            students_peer.discard(pc)

@socket.event
async def admin_offer(sid, data):
    try:
        student_id = data.get('studentId')
        if not student_id:
            log.error("No student ID provided in admin offer")
            return

        log.info(f"Admin {sid} requesting video from student {student_id}")
        
        # Store the admin's socket ID for this student
        student_admin_map[student_id] = sid
        
        # Forward the offer to the student with isAdminOffer flag
        log.info(f"Forwarding admin offer to student")
        await socket.emit("offer", {
            "sdp": data["sdp"]["sdp"],
            "type": data["sdp"]["type"],
            "studentId": student_id,
            "isAdminOffer": True,
            "adminId": sid,
            "fromAdmin": True
        }, skip_sid=sid)

    except Exception as e:
        log.error(f"Error handling admin offer: {e}")

@socket.event
async def answer(sid, data):
    try:
        student_id = data.get('studentId')
        admin_id = data.get('adminId')
        from_admin = data.get('fromAdmin', False)
        is_analysis = data.get('isAnalysis', False)
        
        if not student_id:
            log.error("No student ID provided in answer")
            return

        log.info(f"Received answer from {sid}")
        
        if admin_id:
            # If this is an answer to an admin offer, send it only to that admin
            log.info(f"Forwarding answer to admin {admin_id}")
            await socket.emit("answer", {
                "sdp": data["sdp"],
                "type": data["type"],
                "studentId": student_id,
                "adminId": admin_id,
                "fromAdmin": from_admin
            }, to=admin_id)
        elif is_analysis:
            # If this is an answer for analysis, handle it separately
            log.info(f"Received analysis answer from {sid}")
            # No need to forward this answer
        else:
            # Otherwise, forward to all other clients
            await socket.emit("answer", {
                "sdp": data["sdp"],
                "type": data["type"],
                "studentId": student_id
            }, skip_sid=sid)
        log.info(f"Forwarded answer from {sid}")

    except Exception as e:
        log.error(f"Error handling answer: {e}")

@socket.event
async def candidate(sid, data):
    try:
        student_id = data.get('studentId')
        admin_id = data.get('adminId')
        from_admin = data.get('fromAdmin', False)
        is_analysis = data.get('isAnalysis', False)
        
        if admin_id:
            # If this is a candidate for an admin connection, send it only to that admin
            await socket.emit("candidate", {
                "candidate": data.get("candidate"),
                "sdpMid": data.get("sdpMid"),
                "sdpMLineIndex": data.get("sdpMLineIndex"),
                "studentId": student_id,
                "adminId": admin_id,
                "fromAdmin": from_admin
            }, to=admin_id)
        elif is_analysis:
            # If this is a candidate for analysis, handle it separately
            log.info(f"Received analysis candidate from {sid}")
            # No need to forward this candidate
        else:
            # Otherwise, forward to all other clients
            await socket.emit("candidate", {
                "candidate": data.get("candidate"),
                "sdpMid": data.get("sdpMid"),
                "sdpMLineIndex": data.get("sdpMLineIndex"),
                "studentId": student_id
            }, skip_sid=sid)
        log.info(f"Forwarded ICE candidate from {sid}")

    except Exception as e:
        log.error(f"Error handling ICE candidate: {e}")

@socket.event
async def disconnect(sid):
    log.warning(f"Client disconnected: {sid}")
    # Clean up any peer connections for this socket ID
    for pc in students_peer.copy():
        if hasattr(pc, 'socket_id') and pc.socket_id == sid:
            student_id = getattr(pc, 'student_id', None)
            if student_id in cleanup_tasks:
                cleanup_tasks[student_id].cancel()
                del cleanup_tasks[student_id]
            await safe_cleanup(pc, student_id)
    
    # Remove admin mapping if this was an admin
    for student_id, admin_sid in list(student_admin_map.items()):
        if admin_sid == sid:
            del student_admin_map[student_id]

def parse_candidate(candidate_str):
    """Parse a candidate string into RTCIceCandidate parameters"""
    try:
        match = re.match(
            r"candidate:(\S+) (\d+) (\w+) (\d+) (\S+) (\d+) typ (\w+)(?: generation (\d+))?(?: ufrag (\S+))?",
            candidate_str
        )
        if not match:
            raise ValueError("Invalid candidate format")

        foundation, component, protocol, priority, ip, port, typ, generation, ufrag = match.groups()
        return {
            "foundation": foundation,
            "component": int(component),
            "protocol": protocol.lower(),
            "priority": int(priority),
            "ip": ip,
            "port": int(port),
            "type": typ,
            "usernameFragment": ufrag if ufrag else None
        }
    except Exception as e:
        log.error(f"Error parsing candidate: {candidate_str}, error: {e}")
        return None