import io, { type Socket } from "socket.io-client";
import { observable } from "@legendapp/state";
import { API_URL } from "../../../constants";

let analysisPeer: RTCPeerConnection | null = null;
let adminPeer: RTCPeerConnection | null = null;
let socket: Socket | null = null;

export const error_message$ = observable<string | null>(null);

export const initRCTPPeer = async (studentId: string) => {
    clean();
    socket = io(API_URL, { transports: ['websocket'] });

    // Handle incoming offers
    socket.on("offer", async (data) => {
        try {
            console.log("Received offer:", data);
            const isAdminOffer = data.isAdminOffer;
            const adminId = data.adminId;
            const isAnalysis = data.isAnalysis;
            
            if (isAdminOffer) {
                console.log("Creating new peer connection for admin offer");
                if (adminPeer) {
                    adminPeer.close();
                }
                
                adminPeer = new RTCPeerConnection({
                    iceServers: [
                        { urls: "stun:stun.l.google.com:19302" },
                        { urls: "stun:stun1.l.google.com:19302" }
                    ],
                    bundlePolicy: "max-bundle",
                    rtcpMuxPolicy: "require"
                });

                // Monitor connection state
                adminPeer.onconnectionstatechange = () => {
                    console.log("Admin connection state changed:", adminPeer?.connectionState);
                };

                adminPeer.oniceconnectionstatechange = () => {
                    console.log("Admin ICE connection state changed:", adminPeer?.iceConnectionState);
                };

                adminPeer.onicegatheringstatechange = () => {
                    console.log("Admin ICE gathering state:", adminPeer?.iceGatheringState);
                };

                // Get user media
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: true,
                    audio: false 
                });

                // Add video track to peer connection
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) {
                    console.log("Adding video track to admin peer connection:", videoTrack);
                    videoTrack.enabled = true;
                    const sender = adminPeer.addTrack(videoTrack, stream);
                    console.log("Video track added successfully to admin peer, sender:", sender);
                }

                // Handle ICE candidates for admin connection
                adminPeer.onicecandidate = (event) => {
                    if (event.candidate && socket) {
                        console.log("Sending ICE candidate for admin connection:", event.candidate);
                        socket.emit("candidate", {
                            candidate: event.candidate.candidate,
                            sdpMid: event.candidate.sdpMid,
                            sdpMLineIndex: event.candidate.sdpMLineIndex,
                            studentId: studentId,
                            adminId: adminId,
                            fromAdmin: true
                        });
                    }
                };

                // Set remote description and create answer
                await adminPeer.setRemoteDescription(new RTCSessionDescription({
                    sdp: data.sdp,
                    type: data.type
                }));
                const answer = await adminPeer.createAnswer();
                await adminPeer.setLocalDescription(answer);
                
                if (socket) {
                    console.log("Sending answer for admin connection:", {
                        sdp: answer.sdp,
                        type: answer.type,
                        studentId: studentId,
                        adminId: adminId,
                        fromAdmin: true
                    });
                    
                    socket.emit("answer", {
                        sdp: answer.sdp,
                        type: answer.type,
                        studentId: studentId,
                        adminId: adminId,
                        fromAdmin: true
                    });
                }
            } else if (isAnalysis) {
                // Handle analysis connection
                if (analysisPeer) {
                    await analysisPeer.setRemoteDescription(new RTCSessionDescription({
                        sdp: data.sdp,
                        type: data.type
                    }));
                    const answer = await analysisPeer.createAnswer();
                    await analysisPeer.setLocalDescription(answer);
                    
                    if (socket) {
                        console.log("Sending answer for analysis connection");
                        socket.emit("answer", {
                            sdp: answer.sdp,
                            type: answer.type,
                            studentId: studentId,
                            isAnalysis: true
                        });
                    }
                }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            error_message$.set(`Error handling offer: ${errorMessage}`);
            console.error("Error handling offer:", err);
        }
    });

    // Handle incoming answers
    socket.on("answer", async (data) => {
        const isAnalysis = data.isAnalysis;
        const peer = isAnalysis ? analysisPeer : adminPeer;
        
        if (peer) {
            try {
                console.log("Received answer:", data);
                await peer.setRemoteDescription(new RTCSessionDescription({
                    sdp: data.sdp,
                    type: data.type
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                error_message$.set(`Error handling answer: ${errorMessage}`);
            }
        }
    });
    
    // Handle ICE candidates
    socket.on("candidate", async (data) => {
        const isAnalysis = data.isAnalysis;
        const peer = isAnalysis ? analysisPeer : adminPeer;
        
        if (peer) {
            try {
                console.log("Received ICE candidate:", data);
                await peer.addIceCandidate(new RTCIceCandidate({
                    candidate: data.candidate,
                    sdpMid: data.sdpMid,
                    sdpMLineIndex: data.sdpMLineIndex
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                error_message$.set(`Error adding ICE candidate: ${errorMessage}`);
            }
        }
    });
    
    socket.on("connect", () => {
        console.log("Socket.IO connected");
    });

    socket.on("connect_error", (err) => {
        console.error("Socket.IO connect error:", err.message);
        error_message$.set("Failed to connect to video server");
    });

    // Create initial peer connection for analysis
    analysisPeer = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
        ],
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require"
    });

    // Monitor connection state
    analysisPeer.onconnectionstatechange = () => {
        console.log("Analysis connection state changed:", analysisPeer?.connectionState);
    };

    analysisPeer.oniceconnectionstatechange = () => {
        console.log("Analysis ICE connection state changed:", analysisPeer?.iceConnectionState);
    };

    analysisPeer.onicegatheringstatechange = () => {
        console.log("Analysis ICE gathering state:", analysisPeer?.iceGatheringState);
    };

    // Get user media
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true,
        audio: false 
    });

    // Add video track to peer connection
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
        console.log("Adding video track to analysis peer connection:", videoTrack);
        videoTrack.enabled = true;
        const sender = analysisPeer.addTrack(videoTrack, stream);
        console.log("Video track added successfully to analysis peer, sender:", sender);
    }

    // Handle ICE candidates
    analysisPeer.onicecandidate = (event) => {
        if (event.candidate && socket) {
            console.log("Sending ICE candidate for analysis:", event.candidate);
            socket.emit("candidate", {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                studentId: studentId,
                isAnalysis: true
            });
        } else if (!event.candidate) {
            console.log("ICE gathering completed for analysis");
        }
    };

    // Create and send offer
    console.log("Creating offer for analysis");
    const offer = await analysisPeer.createOffer({
        offerToReceiveVideo: false,  // We're only sending video
        offerToReceiveAudio: false
    });
    console.log("Created offer for analysis:", offer);
    await analysisPeer.setLocalDescription(offer);
    console.log("Set local description for analysis");
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
    if (analysisPeer) {
        analysisPeer.close();
        analysisPeer = null;
    }
    if (adminPeer) {
        adminPeer.close();
        adminPeer = null;
    }
}
