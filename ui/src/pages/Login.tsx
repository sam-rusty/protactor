import { Form, Input, Button, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { post } from '../http';

const { Link } = Typography;

const Login: React.FC = () => {
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const navigate = useNavigate();

    const onFinish = async (values: { email: string; password: string }) => {
        try {
            const data = await post('/authorization/login', values);
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            setMessage({ type: 'success', text: 'Login successful!' });
            // wait for 3 seconds before redirecting
            // if user role is Student then redirect to /exam page otherwise redirect to /students
            setTimeout(() => {
                if (data.user.role === 'Student') {
                    navigate('/students/exam');
                } else {
                    navigate('/students');
                }
            }, 3000);
        } catch (error) {
            if (error instanceof Error) {
                setMessage({ type: 'error', text: error.message || 'An error occurred during login' });
            } else {
                setMessage({ type: 'error', text: 'An unexpected error occurred' });
            }
        }
    };

    const onFinishFailed = (errorInfo: unknown) => {
        console.log('Failed:', errorInfo);
    };

    return (
        <div style={{ maxWidth: 400, margin: '50px auto', padding: 20, border: '1px solid #ddd', borderRadius: 8 }}>
            <h2 style={{ textAlign: 'center' }}>Login</h2>
            <Form
                name="login"
                initialValues={{}}
                onFinish={onFinish}
                onFinishFailed={onFinishFailed}
                layout="vertical"
            >
                <Form.Item
                    label="Email"
                    name="email"
                    rules={[
                        { required: true, message: 'Please input your email!' },
                        { type: 'email', message: 'Please enter a valid email!' },
                    ]}
                >
                    <Input placeholder="Enter your email" />
                </Form.Item>

                <Form.Item
                    label="Password"
                    name="password"
                    rules={[{ required: true, message: 'Please input your password!' }]}
                >
                    <Input.Password placeholder="Enter your password" />
                </Form.Item>

                <Form.Item>
                    <Button type="primary" htmlType="submit" block>
                        Submit
                    </Button>
                </Form.Item>
            </Form>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
                <Link href="/register">Don't have an account? Register here</Link>
            </div>
            {message && (
                <div
                    style={{
                        marginTop: 20,
                        padding: 10,
                        borderRadius: 4,
                        color: message.type === 'success' ? 'green' : 'red',
                        backgroundColor: message.type === 'success' ? '#f6ffed' : '#fff1f0',
                        border: `1px solid ${message.type === 'success' ? '#b7eb8f' : '#ffa39e'}`,
                    }}
                >
                    {message.text}
                </div>
            )}
        </div>
    );
};

export default Login;
