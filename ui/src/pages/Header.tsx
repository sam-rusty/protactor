import { useNavigate } from 'react-router-dom';
import { Button, Layout, Typography } from 'antd';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

const Header: React.FC = () => {
    const navigate = useNavigate();

    // Get the current logged-in user from localStorage and parse it
    const user = localStorage.getItem('user');
    const parsedUser = user ? JSON.parse(user) : null;

    const handleLogout = () => {
        // Clear localStorage and navigate to login page
        localStorage.clear();
        navigate('/login');
    };

    return (
        <AntHeader style={styles.header}>
            <Text style={styles.userInfo}>
                {parsedUser
                    ? `Welcome, ${parsedUser.first_name} ${parsedUser.last_name}`
                    : 'Welcome, Guest'}
            </Text>
            <Button type='link' style={styles.logoutLink} onClick={handleLogout}>
                Logout
            </Button>
        </AntHeader>
    );
};

const styles = {
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 20px',
        backgroundColor: '#001529', // Dark blue background
        color: '#fff', // White text color
    },
    userInfo: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#fff', // White text color
    },
    logoutLink: {
        fontSize: '16px',
        color: '#1890ff', // Ant Design primary blue color
        textDecoration: 'none',
        cursor: 'pointer',
    },
};

export default Header;