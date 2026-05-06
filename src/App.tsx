import { useState, useEffect } from 'react';
import { ChatInterface } from './components';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ForgotPassword } from './components/Auth/ForgotPassword';
import { getCurrentUser, isLoggedIn, logout } from './services/auth';
import type { User } from './types/user';

type AuthMode = 'login' | 'register' | 'forgotPassword';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // 初始化检查用户登录状态
  useEffect(() => {
    if (isLoggedIn()) {
      const currentUser = getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
      }
    }
  }, []);

  const handleLogin = () => {
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      setIsAuthenticated(true);
    }
  };

  const handleRegister = () => {
    // 注册成功后跳转到登录界面，让用户手动登录
    setAuthMode('login');
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setIsAuthenticated(false);
    setAuthMode('login');
  };

  const handleForgotPasswordSuccess = () => {
    setAuthMode('login');
  };

  // 如果未登录，显示登录/注册/忘记密码页面
  if (!isAuthenticated) {
    if (authMode === 'login') {
      return (
        <Login
          onLogin={handleLogin}
          onSwitchToRegister={() => setAuthMode('register')}
          onForgotPassword={() => setAuthMode('forgotPassword')}
        />
      );
    } else if (authMode === 'register') {
      return (
        <Register
          onRegister={handleRegister}
          onSwitchToLogin={() => setAuthMode('login')}
        />
      );
    } else {
      return (
        <ForgotPassword
          onBackToLogin={() => setAuthMode('login')}
          onSuccess={handleForgotPasswordSuccess}
        />
      );
    }
  }

  // 已登录，显示聊天界面
  return (
    <ChatInterface user={user!} onLogout={handleLogout} />
  );
}

export default App;