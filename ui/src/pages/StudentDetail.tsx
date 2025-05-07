import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout, Table, Typography, Button, Space, Spin, Row, Col, message } from "antd";
import { get } from "../http";
import { io } from 'socket.io-client';
import { use$ } from '@legendapp/state/react';
import { observable } from '@legendapp/state';
import { API_URL } from "../constants";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export const error_message$ = observable<string>('');

interface Student {
	first_name: string;
	last_name: string;
	email: string;
}

interface Activity {
	id: number;
	activity: string;
	timestamp: string;
}

const columns = [
	{
		title: "Activity",
		dataIndex: "activity",
		key: "activity",
	},
	{
		title: "Timestamp",
		dataIndex: "timestamp",
		key: "timestamp",
	},
];

const StudentDetail: React.FC = () => {
	const { id } = useParams<{ id: string }>();
	const [student, setStudent] = useState<Student | null>(null);
	const [activities, setActivities] = useState<Activity[]>([]);
	const [loading, setLoading] = useState(true);
	const [showPlayButton, setShowPlayButton] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);
	const errorMessage = use$(error_message$);
	const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
	const socketRef = useRef<any>(null);

	const handlePlayVideo = async () => {
		if (videoRef.current) {
			try {
				// Start playing (video is already muted)
				await videoRef.current.play();
				console.log('Video playback started after user interaction');
				
				// After successful play, try to unmute
				try {
					videoRef.current.muted = false;
					console.log('Successfully unmuted video');
				} catch (unmuteError) {
					console.warn('Could not unmute video:', unmuteError);
					// Keep video muted but playing
					videoRef.current.muted = true;
				}
				
				setShowPlayButton(false);
				setIsPlaying(true);
			} catch (error) {
				console.error('Error playing video after user interaction:', error);
				// If play fails, keep the video muted
				if (videoRef.current) {
					videoRef.current.muted = true;
				}
			}
		}
	};

	const initRCTPPeer = useCallback(async () => {
		try {
			console.log('Creating new peer connection');
			// Clean up any existing connection
			if (peerConnectionRef.current) {
				peerConnectionRef.current.close();
			}

			// Create new peer connection with more detailed configuration
			peerConnectionRef.current = new RTCPeerConnection({
				iceServers: [
					{ urls: 'stun:stun.l.google.com:19302' },
					{ urls: 'stun:stun1.l.google.com:19302' }
				],
				bundlePolicy: 'max-bundle',
				rtcpMuxPolicy: 'require'
			});

			// Handle incoming video track
			peerConnectionRef.current.ontrack = (event) => {
				console.log('Received video track event:', event);
				console.log('Track kind:', event.track.kind);
				console.log('Track enabled:', event.track.enabled);
				console.log('Track muted:', event.track.muted);
				console.log('Track readyState:', event.track.readyState);
				console.log('Streams:', event.streams);
				
				// Get the receiver and track
				const receiver = event.receiver;
				const track = receiver.track;
				
				// Create a new MediaStream with the track
				const stream = new MediaStream([track]);
				console.log('Created new MediaStream with track');
				
				if (videoRef.current) {
					// Set the stream to the video element
					videoRef.current.srcObject = stream;
					console.log('Set stream to video element');
					
					// Try to play the video immediately
					videoRef.current.play().then(() => {
						console.log('Video playback started successfully');
						setShowPlayButton(false);
						setIsPlaying(true);
					}).catch(error => {
						console.error('Error playing video:', error);
						// If autoplay fails, show play button
						setShowPlayButton(true);
					});
				} else {
					console.error('Video element not available');
				}
			};

			// Handle connection state changes
			peerConnectionRef.current.onconnectionstatechange = () => {
				console.log('Connection state changed:', peerConnectionRef.current?.connectionState);
				if (peerConnectionRef.current?.connectionState === 'connected') {
					console.log('WebRTC connection established!');
					// Check receivers after connection is established
					const receivers = peerConnectionRef.current.getReceivers();
					console.log('Current receivers:', receivers);
					receivers.forEach(receiver => {
						console.log('Receiver track:', receiver.track);
						console.log('Receiver track enabled:', receiver.track.enabled);
						console.log('Receiver track muted:', receiver.track.muted);
						console.log('Receiver track readyState:', receiver.track.readyState);
					});
				}
			};

			peerConnectionRef.current.oniceconnectionstatechange = () => {
				console.log('ICE connection state changed:', peerConnectionRef.current?.iceConnectionState);
				if (peerConnectionRef.current?.iceConnectionState === 'connected') {
					console.log('ICE connection established!');
				}
			};

			peerConnectionRef.current.onicegatheringstatechange = () => {
				console.log('ICE gathering state:', peerConnectionRef.current?.iceGatheringState);
			};

			// Handle ICE candidates
			peerConnectionRef.current.onicecandidate = (event) => {
				if (event.candidate && id && socketRef.current) {
					console.log('Sending ICE candidate:', event.candidate);
					socketRef.current.emit('admin_candidate', {
						studentId: id,
						candidate: event.candidate.candidate,
						sdpMid: event.candidate.sdpMid,
						sdpMLineIndex: event.candidate.sdpMLineIndex
					});
				} else if (!event.candidate) {
					console.log('ICE gathering completed');
				}
			};

			// Create and send offer
			console.log('Creating offer');
			const offer = await peerConnectionRef.current.createOffer({
				offerToReceiveVideo: true,
				offerToReceiveAudio: false
			});
			console.log('Created offer:', offer);
			await peerConnectionRef.current.setLocalDescription(offer);
			console.log('Set local description');
			console.log('Sending offer for student:', id);
			socketRef.current.emit('admin_offer', { 
				studentId: id,
				sdp: {
					sdp: offer.sdp,
					type: offer.type
				}
			});

		} catch (error) {
			console.error('WebRTC initialization error:', error);
			error_message$.set(error instanceof Error ? error.message : 'Failed to initialize WebRTC');
		}
	}, [id]);

	// Initialize socket connection
	useEffect(() => {
		console.log('Initializing socket connection');
		socketRef.current = io(API_URL, { 
			transports: ['websocket'],
			reconnection: true,
			reconnectionAttempts: 5
		});

		socketRef.current.on('connect', () => {
			console.log('Socket connected');
			if (id) {
				initRCTPPeer();
			}
		});

		socketRef.current.on('connect_error', (error: any) => {
			console.error('Socket connection error:', error);
			error_message$.set('Failed to connect to video server');
		});

		socketRef.current.on('answer', async (data: any) => {
			console.log('Received answer from student:', data);
			if (peerConnectionRef.current) {
				try {
					await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription({
						type: data.type,
						sdp: data.sdp
					}));
					console.log('Set remote description successfully');
				} catch (error) {
					console.error('Error setting remote description:', error);
					error_message$.set(error instanceof Error ? error.message : 'Failed to set remote description');
				}
			} else {
				console.error('No peer connection available when receiving answer');
			}
		});

		// Add handler for ICE candidates from student
		socketRef.current.on('candidate', async (data: any) => {
			console.log('Received ICE candidate from student:', data);
			if (peerConnectionRef.current) {
				try {
					const candidate = new RTCIceCandidate({
						candidate: data.candidate,
						sdpMid: data.sdpMid,
						sdpMLineIndex: data.sdpMLineIndex
					});
					await peerConnectionRef.current.addIceCandidate(candidate);
					console.log('Added ICE candidate from student');
				} catch (error) {
					console.error('Error adding ICE candidate from student:', error);
				}
			}
		});

		// Add socket event listener for suspicious activities
		socketRef.current.on('suspicious_activity', (data: any) => {
			console.log('Received suspicious activity:', data);
			// Add the new activity to the activities list
			setActivities(prev => [{
				id: data.id,
				activity: data.activity,
				timestamp: data.timestamp
			}, ...prev]);
			
			// Show notification
			message.warning(`Suspicious activity detected: ${data.activity}`);
		});

		return () => {
			console.log('Cleaning up socket connection');
			if (socketRef.current) {
				socketRef.current.disconnect();
			}
			if (peerConnectionRef.current) {
				peerConnectionRef.current.close();
				peerConnectionRef.current = null;
			}
		};
	}, [id, initRCTPPeer]);

	useEffect(() => {
		const fetchStudent = async () => {
			try {
				const data = await get(`/students/${id}`);
				setStudent(data);
			} catch (error) {
				console.error("Error fetching student:", error);
			}
		};

		const fetchActivities = async () => {
			try {
				const data = await get(
					`/students/${id}/suspicious-activities`
				);
				setActivities(data);
			} catch (error) {
				console.error("Error fetching activities:", error);
			}
		};

		const fetchData = async () => {
			setLoading(true);
			await Promise.all([fetchStudent(), fetchActivities()]);
			setLoading(false);
		};

		fetchData();
	}, [id]);

	// Show error messages
	useEffect(() => {
		if (errorMessage) {
			message.error(errorMessage);
		}
	}, [errorMessage]);

	if (loading) {
		return (
			<Row justify="center" align="middle" style={{ height: "100vh" }}>
				<Spin size="large" />
			</Row>
		);
	}

	if (!student) {
		return <div>Student not found</div>;
	}

	return (
		<Layout style={{ minHeight: "100vh" }}>
			<Header style={{ background: "#001529", padding: "0 20px" }}>
				<Title level={3} style={{ color: "#fff", margin: 0 }}>
					Student Details
				</Title>
			</Header>
			<Content style={{ padding: "20px" }}>
				<Space direction="vertical" style={{ width: "100%" }}>
					<Button type="link">
						<Link to="/students">Back</Link>
					</Button>
					<Row gutter={[16, 16]}>
						<Col span={12}>
							<Space direction="vertical" size="middle" style={{ width: "100%" }}>
								<Title level={4}>
									{student.first_name} {student.last_name}
								</Title>
								<Text>{student.email}</Text>
							</Space>
						</Col>
						<Col span={12} style={{ position: 'relative' }}>
							<video
								ref={videoRef}
								style={{
									width: 500,
									maxHeight: "300px",
									backgroundColor: "#000",
									border: "1px solid #ccc",
									borderRadius: "8px",
								}}
								autoPlay
								playsInline
								muted={true}
								onLoadedMetadata={() => {
									console.log('Video metadata loaded');
									// Try to play immediately
									if (videoRef.current) {
										videoRef.current.play().then(() => {
											console.log('Video autoplay started');
											setShowPlayButton(false);
											setIsPlaying(true);
										}).catch(error => {
											console.error('Autoplay failed:', error);
											setShowPlayButton(true);
										});
									}
								}}
								onPlay={() => {
									console.log('Video started playing');
									setIsPlaying(true);
									// Try to unmute after play starts
									if (videoRef.current) {
										videoRef.current.muted = false;
									}
								}}
								onPause={() => {
									console.log('Video paused');
									setIsPlaying(false);
								}}
								onError={(e) => {
									console.error('Video error:', e);
									console.error('Video element error code:', videoRef.current?.error?.code);
									console.error('Video element error message:', videoRef.current?.error?.message);
								}}
							/>
							{showPlayButton && !isPlaying && (
								<Button
									type="primary"
									onClick={handlePlayVideo}
									style={{
										position: 'absolute',
										top: '50%',
										left: '50%',
										transform: 'translate(-50%, -50%)',
										zIndex: 1
									}}
								>
									Play Video
								</Button>
							)}
						</Col>
					</Row>
					<Title level={4}>Suspicious Activities</Title>
					<Table
						dataSource={activities}
						columns={columns}
						rowKey="id"
						bordered
					/>
				</Space>
			</Content>
		</Layout>
	);
};

export default StudentDetail;
