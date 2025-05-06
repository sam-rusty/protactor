import type { JSX } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';

import Login from './pages/Login';
import Register from './pages/Register';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Exam from './pages/controllers/Exam';

const getCurrentUser = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1])); // Decode JWT payload
    const isTokenExpired = payload.exp * 1000 < Date.now(); // Check expiration
    return isTokenExpired ? false : payload; // Return payload if not expired
  } catch (error) {
    console.error('Invalid token:', error);
    return false;
  }
};

const PrivateRoute = ({ children, teacher_only }: { children: JSX.Element, teacher_only?: boolean }) => {
  const user = getCurrentUser();
  if  (!user) {
    return <Navigate to="/login" />;
  }
  if (teacher_only && user.role === 'Student') {
    return <Navigate to="/students/exam" />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/students"
          element={
            <PrivateRoute teacher_only>
              <Students />
            </PrivateRoute>
          }
        />
        <Route
          path="/students/:id"
          element={
            <PrivateRoute teacher_only>
              <StudentDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/students/exam"
          element={
            <PrivateRoute>
              <Exam />
            </PrivateRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
