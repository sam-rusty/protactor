import { useEffect, useState } from "react";
import { Table, Spin, message, Button, Layout } from "antd";
import { useNavigate } from "react-router-dom";

import { get } from "../http";
import Header from "./Header"; // Assuming HeaderComponent is in the components folder

const { Content } = Layout;

interface Student {
	id: number;
	first_name: string;
	last_name: string;
	email: string;
}

const Students: React.FC = () => {
	const [studentList, setStudentList] = useState<Student[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const navigate = useNavigate();

	useEffect(() => {
		const fetchStudents = async () => {
			try {
				const data: Student[] = await get("/students");
				setStudentList(data);
			} catch (error: unknown) {
				message.error(`Error fetching students: ${(error as Error).message}`);
			} finally {
				setIsLoading(false);
			}
		};

		fetchStudents();
	}, []);

	const columns = [
		{
			title: "First Name",
			dataIndex: "first_name",
			key: "first_name",
		},
		{
			title: "Last Name",
			dataIndex: "last_name",
			key: "last_name",
		},
		{
			title: "Email",
			dataIndex: "email",
			key: "email",
		},
		{
			title: "Action",
			key: "action",
			render: (_: unknown, record: Student) => (
				<Button onClick={() => navigate(`/students/${record.id}`)}>
					View Details
				</Button>
			),
		},
	];

	return (
		<Layout>
			<Header />
			<Content style={{ padding: "20px" }}>
				<h1>Students</h1>
				{isLoading ? (
					<Spin size="large" />
				) : (
					<Table
						dataSource={studentList}
						columns={columns}
						rowKey="id"
						bordered
					/>
				)}
			</Content>
		</Layout>
	);
};

export default Students;
