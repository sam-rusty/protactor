import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout, Table, Typography, Button, Space, Spin, Row, Col } from "antd";
import { get } from "../http";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

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
						<Col span={12}>
							<video
								style={{
									width: 500,
									maxHeight: "300px",
									backgroundColor: "#000",
									border: "1px solid #ccc",
									borderRadius: "8px",
								}}
								autoPlay
								playsInline
								muted
							/>
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
