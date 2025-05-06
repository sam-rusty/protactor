import io, { type Socket } from "socket.io-client";
import { observable } from "@legendapp/state";
import { API_URL } from "../../../constants";

let peer: RTCPeerConnection | null = null;
let socket: Socket | null = null;

export const error_message$ = observable<string | null>(null);

export const initRCTPPeer = async () => {
    clean();
    socket = io(API_URL, { transports: ['websocket'] });
    socket.on("answer", async (description) => {
        if (peer) {
            try {
                await peer.setRemoteDescription(
                    new RTCSessionDescription(description),
                );
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                error_message$.set(
                    `Error setting remote description: ${errorMessage}`,
                );
            }
        }
    });
    
    socket.on("candidate", async (candidate) => {
        if (peer) {
            try {
                await peer.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                error_message$.set(
                    `'Error adding ICE candidate: ${
                        err instanceof Error ? err.message : "Unknown error"
                    }`,
                );
            }
        }
    });
    
    socket.on("connect", () => {
        console.log("Socket.IO connected");
    });
    socket.on("connect_error", (err) => {
        console.error("Socket.IO connect error:", err.message);
    });
    peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of stream.getTracks()) {
        peer.addTrack(track, stream);
    }
    peer.onicecandidate = (event) => {
        if (event.candidate && socket) {
           socket.emit("candidate", {
                candidate: event.candidate.candidate,  // <-- only the raw candidate string
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
            });
        }
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("offer", offer);
    return stream
}

export const clean = () => {
    if(socket) {
        socket.disconnect();
        socket.close();
    }
    if (peer) {
        peer.close();
    }
}
