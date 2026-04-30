export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  password?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}