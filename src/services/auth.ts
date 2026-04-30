import type { User, LoginData, RegisterData } from '../types/user';

// 模拟数据库
const USERS_KEY = 'chat_users';
const CURRENT_USER_KEY = 'current_user';
const REMEMBER_ME_KEY = 'chat_remember_me';

// 获取所有用户
const getUsers = (): User[] => {
  const users = localStorage.getItem(USERS_KEY);
  return users ? JSON.parse(users) : [];
};

// 保存用户列表
const saveUsers = (users: User[]): void => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

// 注册用户
export const register = (data: RegisterData): Promise<User> => {
  return new Promise((resolve, reject) => {
    const users = getUsers();
    
    // 检查邮箱是否已注册
    if (users.some(user => user.email === data.email)) {
      reject(new Error('该邮箱已被注册'));
      return;
    }
    
    // 创建新用户
    const newUser: User = {
      id: Date.now().toString(),
      username: data.username,
      email: data.email,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.username}`
    };
    
    // 保存用户（密码仅作演示，实际应用中应使用加密存储）
    const usersWithPassword = users.map(u => ({ ...u, password: u.password }));
    usersWithPassword.push({ ...newUser, password: data.password });
    saveUsers(usersWithPassword);
    
    // 设置当前用户（不包含密码）
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
    
    resolve(newUser);
  });
};

// 登录用户
export const login = (data: LoginData, rememberMe: boolean = false): Promise<User> => {
  return new Promise((resolve, reject) => {
    const users = getUsers();
    
    // 查找用户
    const user = users.find(
      u => u.email === data.email && u.password === data.password
    );
    
    if (!user) {
      reject(new Error('邮箱或密码错误'));
      return;
    }
    
    // 设置当前用户（不包含密码）
    const userWithoutPassword = { id: user.id, username: user.username, email: user.email, avatar: user.avatar };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userWithoutPassword));
    
    // 如果选择记住密码，保存登录信息
    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({
        email: data.email,
        password: data.password
      }));
    } else {
      // 如果不记住密码，清除之前保存的登录信息
      localStorage.removeItem(REMEMBER_ME_KEY);
    }
    
    resolve(userWithoutPassword);
  });
};

// 获取当前登录用户
export const getCurrentUser = (): User | null => {
  const user = localStorage.getItem(CURRENT_USER_KEY);
  return user ? JSON.parse(user) : null;
};

// 登出用户
export const logout = (): void => {
  localStorage.removeItem(CURRENT_USER_KEY);
  // 登出时不清除记住的密码，用户下次登录时可以选择是否继续使用
};

// 检查用户是否已登录
export const isLoggedIn = (): boolean => {
  return !!localStorage.getItem(CURRENT_USER_KEY);
};

// 清除记住的密码
export const clearRememberedPassword = (): void => {
  localStorage.removeItem(REMEMBER_ME_KEY);
};

// 发送验证码（调用后端API）
export const sendVerificationCode = (email: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const users = getUsers();
    
    // 先检查邮箱是否已注册
    const user = users.find(u => u.email === email);
    if (!user) {
      reject(new Error('该邮箱未注册'));
      return;
    }
    
    // 调用后端API发送验证码
    fetch('http://localhost:5000/api/send-verification-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        resolve();
      } else {
        reject(new Error(data.message));
      }
    })
    .catch(error => {
      console.error('发送验证码失败:', error);
      reject(new Error('发送验证码失败，请稍后重试'));
    });
  });
};

// 验证验证码（调用后端API）
export const verifyCode = (email: string, code: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    fetch('http://localhost:5000/api/verify-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, code })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        resolve();
      } else {
        reject(new Error(data.message));
      }
    })
    .catch(error => {
      console.error('验证验证码失败:', error);
      reject(new Error('验证失败，请稍后重试'));
    });
  });
};

// 重置密码（先验证验证码，再更新密码）
export const resetPassword = (email: string, code: string, newPassword: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // 先调用后端验证验证码
    fetch('http://localhost:5000/api/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, code })
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        reject(new Error(data.message));
        return;
      }
      
      // 验证码验证成功，更新前端存储的密码
      const users = getUsers();
      const updatedUsers = users.map(user => {
        if (user.email === email) {
          return { ...user, password: newPassword };
        }
        return user;
      });
      
      saveUsers(updatedUsers);
      
      // 清除记住的密码（因为密码已更改）
      localStorage.removeItem(REMEMBER_ME_KEY);
      
      resolve();
    })
    .catch(error => {
      console.error('重置密码失败:', error);
      reject(new Error('重置密码失败，请稍后重试'));
    });
  });
};