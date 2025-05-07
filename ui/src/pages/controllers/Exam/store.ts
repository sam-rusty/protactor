import io, { type Socket } from "socket.io-client";
import { observable } from "@legendapp/state";
import { API_URL } from "../../../constants";

let peer: RTCPeerConnection | null = null;
let socket: Socket | null = null;

export const error_message$ = observable<string | null>(null);

export const initRCTPPeer = async (studentId: string) => {
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

    // Create peer connection
    peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Get user media
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true,
        audio: false 
    });

    // Add video track to peer connection
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
        console.log("Adding video track to peer connection:", videoTrack);
        // Ensure track is enabled and not muted
        videoTrack.enabled = true;
        const sender = peer.addTrack(videoTrack, stream);
        console.log("Video track added successfully, sender:", sender);
        
        // Monitor track state
        videoTrack.onmute = () => {
            console.log("Video track muted, re-enabling");
            videoTrack.enabled = true;
        };
        videoTrack.onunmute = () => {
            console.log("Video track unmuted");
        };
    } else {
        console.error("No video track available");
    }

    // Handle ICE candidates
    peer.onicecandidate = (event) => {
        if (event.candidate && socket) {
            console.log("Sending ICE candidate:", event.candidate);
            socket.emit("candidate", {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
            });
        }
    };

    // Create and send offer
    console.log("Creating offer with video track");
    const offer = await peer.createOffer({
        offerToReceiveVideo: false,  // We're only sending video
        offerToReceiveAudio: false
    });
    console.log("Created offer:", offer);
    await peer.setLocalDescription(offer);
    console.log("Set local description");
    if (socket) {
        console.log("Sending offer with studentId:", studentId);
        socket.emit("offer", {
            sdp: offer.sdp,
            type: offer.type,
            studentId: studentId
        });
    }
    return stream;
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
