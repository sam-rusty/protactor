import { useState, useEffect, useRef } from "react";
import { Button, Radio, Typography, Layout, Space } from "antd";
import Header from "../../Header";
import { initRCTPPeer, clean } from "./store";

const { Content, Sider } = Layout;
const { Title } = Typography;

const questions = [
	{
		id: 1,
		question: "What is the capital of France?",
		options: ["Paris", "London", "Berlin", "Madrid"],
	},
	{ id: 2, question: "What is 2 + 2?", options: ["3", "4", "5", "6"] },
	{
		id: 3,
		question: "Which planet is known as the Red Planet?",
		options: ["Earth", "Mars", "Jupiter", "Venus"],
	},
];

const Exam: React.FC = () => {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [selectedAnswers, setSelectedAnswers] = useState<{
		[key: number]: string;
	}>({});

	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

	const handleAnswerChange = (questionId: number, answer: string) => {
		setSelectedAnswers((prev) => ({ ...prev, [questionId]: answer }));
	};

	const handleNext = () => {
		if (currentQuestionIndex < questions.length - 1) {
			setCurrentQuestionIndex((prev) => prev + 1);
		}
	};

	const handlePrevious = () => {
		if (currentQuestionIndex > 0) {
			setCurrentQuestionIndex((prev) => prev - 1);
		}
	};

	useEffect(() => {
		(async () => {
			// TODO: Replace "1" with actual student ID from your auth system
			const studentId = "1"; // This should come from your authentication system
			const stream = await initRCTPPeer(studentId);
			if (stream && videoRef.current) {
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
				}
			}
		})();
		return () => {
			clean();
		}
	}, []);
	const currentQuestion = questions[currentQuestionIndex];

	return (
		<Layout style={{ height: "100vh" }}>
			<Header />
			<Layout>
				{/* Left side: Questions */}
				<Content style={{ padding: "20px", overflowY: "auto", flex: 2 }}>
					<Title level={2}>Exam</Title>
					<Space direction="vertical" size="large" style={{ width: "100%" }}>
						<Title level={4}>{currentQuestion.question}</Title>
						<Radio.Group
							onChange={(e) =>
								handleAnswerChange(currentQuestion.id, e.target.value)
							}
							value={selectedAnswers[currentQuestion.id]}
						>
							{currentQuestion.options.map((option) => (
								<Radio key={option} value={option}>
									{option}
								</Radio>
							))}
						</Radio.Group>
						<Space>
							<Button
								type="primary"
								onClick={handlePrevious}
								disabled={currentQuestionIndex === 0}
							>
								Previous
							</Button>
							<Button
								type="primary"
								onClick={handleNext}
								disabled={currentQuestionIndex === questions.length - 1}
							>
								Next
							</Button>
						</Space>
					</Space>
				</Content>

				{/* Right side: Video Stream */}
				<Sider
					width="30%"
					style={{
						backgroundColor: "#f5f5f500",
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
					}}
				>
					<video
						ref={videoRef}
						autoPlay
						style={{ width: 300, marginTop: 15, height: "auto", borderRadius: "8px", backgroundColor: "#000" }}
						muted
					/>
				</Sider>
			</Layout>
		</Layout>
	);
};

export default Exam;
