from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCConfiguration, RTCIceServer
from aiohttp import web
import re
from socket_server import socket
from video_transform_track import VideoTransformTrack
from logger import log

# Initialize Socket.IO server
app = web.Application()
socket.attach(app)

students_peer = set()

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
        offer = RTCSessionDescription(sdp=data["sdp"], type=data["type"])
        pc = RTCPeerConnection(ice_config)
        students_peer.add(pc)

        @pc.on("track")
        def on_track(track):
            if track.kind == "video":
                pc.addTrack(VideoTransformTrack(track, sid, app))
            # do not add audio unless explicitly needed

        @pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            if pc.iceConnectionState == "failed":
                await cleanup_peer_connection(pc)

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            if pc.connectionState == "failed":
                await cleanup_peer_connection(pc)

        await pc.setRemoteDescription(offer)
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        await socket.emit("answer", {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type
        }, to=sid)
    except Exception as e:
        log.error(f"Error handling offer: {e}")
        await cleanup_peer_connection(pc)
    
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

    except Exception as e:
        log.error(f"Error handling ICE candidate: {e}")

@socket.event
async def disconnect(sid):
    log.warning(f"Client disconnected: {sid}")
    for pc in students_peer.copy():  # Use copy to avoid modification during iteration
        await cleanup_peer_connection(pc)
    students_peer.clear()

async def cleanup_peer_connection(pc):
    try:
        await pc.close()
        students_peer.discard(pc)
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


@socket.event
async def proctor_offer(sid, data):
    try:
        offer = RTCSessionDescription(sdp=data["sdp"], type=data["type"])
        pc = RTCPeerConnection(ice_config)
        students_peer.add(pc)

        await pc.setRemoteDescription(offer)
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        await socket.emit("proctor_answer", {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type
        }, to=sid)
    except Exception as e:
        log.error(f"Error handling proctor offer: {e}")
        await cleanup_peer_connection(pc)