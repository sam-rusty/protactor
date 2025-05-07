from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCConfiguration, RTCIceServer
from aiohttp import web
import re
from socket_server import socket
from video_transform_track import VideoTransformTrack
from logger import log

# Initialize Socket.IO server
app = web.Application()
socket.attach(app)

# Store peer connections for both students and admins
students_peer = set()
admin_peer = set()

# Define STUN servers
ice_config = RTCConfiguration([
    RTCIceServer(urls=["stun:stun.l.google.com:19302"])
])

@socket.event
async def connect(sid, environ):
    log.warning(f"Client connected: {sid}")

@socket.event
async def offer(sid, data):
    # First: cleanup any existing peer connection for this SID
    for pc in students_peer.copy():
        if pc.connectionState in ("failed", "closed", "disconnected"):
            await cleanup_peer_connection(pc)

    try:
        student_id = data.get('studentId')
        if not student_id:
            log.error(f"No student ID provided in offer from {sid}")
            return

        log.info(f"Received offer from student {student_id} (socket: {sid})")
        
        offer = RTCSessionDescription(sdp=data["sdp"], type=data["type"])
        pc = RTCPeerConnection(ice_config)
        pc.student_id = student_id  # Store the student ID with the peer connection
        pc.socket_id = sid  # Store the socket ID for reference
        students_peer.add(pc)

        @pc.on("track")
        def on_track(track):
            if track.kind == "video":
                log.info(f"Received video track from student {student_id}")
                # Create a new track with the same properties
                new_track = track
                new_track.enabled = True
                pc.addTrack(new_track)
                log.info(f"Added video track to peer connection")

        @pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            log.info(f"Student {student_id} ICE connection state changed to {pc.iceConnectionState}")
            if pc.iceConnectionState == "failed":
                await cleanup_peer_connection(pc)

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            log.info(f"Student {student_id} connection state changed to {pc.connectionState}")
            if pc.connectionState == "failed":
                await cleanup_peer_connection(pc)

        await pc.setRemoteDescription(offer)
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        log.info(f"Student {student_id} peer connection established")
        
        await socket.emit("answer", {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type
        }, to=sid)
    except Exception as e:
        log.error(f"Error handling offer: {e}")
        await cleanup_peer_connection(pc)

@socket.event
async def admin_offer(sid, data):
    try:
        student_id = data.get('studentId')
        if not student_id:
            log.error("No student ID provided in admin offer")
            return

        log.info(f"Admin {sid} requesting video from student {student_id}")
        
        # Find the student's peer connection
        student_pc = None
        for pc in students_peer:
            if hasattr(pc, 'student_id') and pc.student_id == student_id:
                student_pc = pc
                log.info(f"Found peer connection for student {student_id}")
                break

        if not student_pc:
            log.error(f"Student {student_id} not found in active connections")
            return

        # Create admin peer connection
        admin_pc = RTCPeerConnection(ice_config)
        admin_pc.student_id = student_id  # Store student ID for reference
        admin_pc.admin_id = sid  # Store admin ID for reference
        admin_peer.add(admin_pc)

        # Set up the offer
        offer = RTCSessionDescription(sdp=data["sdp"]["sdp"], type=data["sdp"]["type"])
        await admin_pc.setRemoteDescription(offer)
        
        # Create and set local description
        answer = await admin_pc.createAnswer()
        await admin_pc.setLocalDescription(answer)

        # Send answer back to admin
        log.info(f"Sending answer back to admin {sid}")
        await socket.emit("admin_answer", {
            "sdp": admin_pc.localDescription.sdp,
            "type": admin_pc.localDescription.type
        }, to=sid)

        # Forward the offer to the student
        log.info(f"Forwarding admin offer to student {student_id}")
        await socket.emit("offer", {
            "sdp": offer.sdp,
            "type": offer.type
        }, to=student_pc.socket_id)

        # Get the student's video track and add it to admin's connection
        for sender in student_pc.getSenders():
            if sender.track and sender.track.kind == "video":
                log.info(f"Found student's video track: {sender.track.id}")
                # Create a new track with the same properties
                new_track = sender.track
                new_track.enabled = True
                admin_pc.addTrack(new_track)
                log.info(f"Added video track to admin connection")
                break

    except Exception as e:
        log.error(f"Error handling admin offer: {e}")
        if 'admin_pc' in locals():
            await cleanup_peer_connection(admin_pc)

@socket.event
async def candidate(sid, data):
    try:
        # Only proceed if remote description is set
        for pc in students_peer.copy():
            if pc.remoteDescription is None:
                continue

            candidate_info = parse_candidate(data.get("candidate", ""))
            if not candidate_info:
                return

            candidate = RTCIceCandidate(
                foundation=candidate_info["foundation"],
                component=candidate_info["component"],
                protocol=candidate_info["protocol"],
                priority=candidate_info["priority"],
                ip=candidate_info["ip"],
                port=candidate_info["port"],
                type=candidate_info["type"],
                sdpMid=data.get("sdpMid", "0"),
                sdpMLineIndex=data.get("sdpMLineIndex", 0)
            )

            await pc.addIceCandidate(candidate)
            log.info(f"Added ICE candidate for student {sid}")

    except Exception as e:
        log.error(f"Error handling ICE candidate: {e}")

@socket.event
async def admin_candidate(sid, data):
    try:
        student_id = data.get('studentId')
        if not student_id:
            log.error("No student ID provided in admin candidate")
            return

        # Find the admin's peer connection for this student
        admin_pc = None
        for pc in admin_peer.copy():
            if hasattr(pc, 'student_id') and pc.student_id == student_id and hasattr(pc, 'admin_id') and pc.admin_id == sid:
                admin_pc = pc
                break

        if not admin_pc:
            log.error(f"Admin peer connection not found for student {student_id} and admin {sid}")
            return

        if admin_pc.remoteDescription is None:
            log.error(f"Admin peer connection not ready for student {student_id}")
            return

        candidate_info = parse_candidate(data.get("candidate", ""))
        if not candidate_info:
            return

        candidate = RTCIceCandidate(
            foundation=candidate_info["foundation"],
            component=candidate_info["component"],
            protocol=candidate_info["protocol"],
            priority=candidate_info["priority"],
            ip=candidate_info["ip"],
            port=candidate_info["port"],
            type=candidate_info["type"],
            sdpMid=data.get("sdpMid", "0"),
            sdpMLineIndex=data.get("sdpMLineIndex", 0)
        )

        await admin_pc.addIceCandidate(candidate)
        log.info(f"Added ICE candidate for admin {sid} viewing student {student_id}")

    except Exception as e:
        log.error(f"Error handling admin ICE candidate: {e}")

@socket.event
async def disconnect(sid):
    log.warning(f"Client disconnected: {sid}")
    # Only cleanup peer connections that match this socket ID
    for pc in students_peer.copy():
        if hasattr(pc, 'socket_id') and pc.socket_id == sid:
            await cleanup_peer_connection(pc)
    for pc in admin_peer.copy():
        if hasattr(pc, 'admin_id') and pc.admin_id == sid:
            await cleanup_peer_connection(pc)

async def cleanup_peer_connection(pc):
    try:
        if pc in students_peer:
            student_id = getattr(pc, 'student_id', 'unknown')
            log.info(f"Cleaning up student peer connection for student {student_id}")
            students_peer.discard(pc)
        if pc in admin_peer:
            admin_id = getattr(pc, 'admin_id', 'unknown')
            log.info(f"Cleaning up admin peer connection for admin {admin_id}")
            admin_peer.discard(pc)
        await pc.close()
    except Exception as e:
        log.error(f"Error cleaning up peer connection: {e}")

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