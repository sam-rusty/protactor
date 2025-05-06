import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, message } from 'antd';
import { post } from '../http';

const { Title, Text, Link } = Typography;

const Register: React.FC = () => {
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<boolean>(false);
    const navigate = useNavigate();

    const handleSubmit = async (values: any) => {
        setError(null); // Clear any previous errors
        setSuccess(false); // Reset success state

        try {
            await post('/authorization/register', values);
            setSuccess(true); // Show success message
            message.success('Registration successful! Redirecting to login...');
            // Redirect to login page after 3 seconds
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            setError(err.message || 'An error occurred during registration');
        }
    };

    return (
        <div style={{ maxWidth: 400, margin: '50px auto', padding: 20, border: '1px solid #ddd', borderRadius: 8 }}>
            <Title level={2}>Register</Title>
            <Form
                layout="vertical"
                onFinish={handleSubmit}
                style={{ marginTop: '20px' }}
            >
                <Form.Item
                    label="First Name"
                    name="first"
                    rules={[{ required: true, message: 'Please enter your first name' }]}
                >
                    <Input placeholder="Enter your first name" />
                </Form.Item>
                <Form.Item
                    label="Last Name"
                    name="last_name"
                    rules={[{ required: true, message: 'Please enter your last name' }]}
                >
                    <Input placeholder="Enter your last name" />
                </Form.Item>
                <Form.Item
                    label="Email"
                    name="email"
                    rules={[
                        { required: true, message: 'Please enter your email' },
                        { type: 'email', message: 'Please enter a valid email' },
                    ]}
                >
                    <Input placeholder="Enter your email" />
                </Form.Item>
                <Form.Item
                    label="Password"
                    name="password"
                    rules={[{ required: true, message: 'Please enter your password' }]}
                >
                    <Input.Password placeholder="Enter your password" />
                </Form.Item>
                <Form.Item>
                    <Button type="primary" htmlType="submit" block>
                        Register
                    </Button>
                </Form.Item>
                {
                    error && (
                        <Form.Item>
                            <Text type="danger" style={{ marginTop: '10px', display: 'block' }}>
                                {error}
                            </Text>
                        </Form.Item>
                    )
                }
                {
                    success && (
                        <Form.Item>
                            <Text type="success" style={{ marginTop: '10px', display: 'block' }}>
                                Registration successful! Redirecting to login...
                            </Text>
                        </Form.Item>
                    )
                }
                <Form.Item>
                    <Link href="/login" style={{ display: 'block', textAlign: 'center', marginTop: '10px' }}>
                        Back to Login
                    </Link>
                </Form.Item>
            </Form>
        </div>
    );
};

export default Register;
