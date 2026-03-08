'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, LoginRequest, SignupRequest } from '@/src/types';
import { login as apiLogin, signup as apiSignup, getCurrentUser } from '@/src/lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<{ success: boolean; error?: string }>;
  signup: (data: SignupRequest) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Load token and user on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      setToken(storedToken);
      loadUser(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  // Load user profile
  const loadUser = async (authToken: string) => {
    try {
      const response = await getCurrentUser(authToken);
      if (response.data) {
        setUser(response.data);
      } else {
        // Token invalid, clear it
        localStorage.removeItem('auth_token');
        setToken(null);
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      localStorage.removeItem('auth_token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  // Login function
  const login = async (credentials: LoginRequest) => {
    try {
      const response = await apiLogin(credentials);
      
      if (response.data) {
        const authToken = response.data.access_token;
        localStorage.setItem('auth_token', authToken);
        setToken(authToken);
        
        // Load user profile
        await loadUser(authToken);
        
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Login failed' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
      };
    }
  };

  // Signup function
  const signup = async (data: SignupRequest) => {
    try {
      const response = await apiSignup(data);
      
      if (response.data) {
        // After signup, automatically login
        return await login({ 
          username: data.username, 
          password: data.password 
        });
      } else {
        return { success: false, error: response.error || 'Signup failed' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Signup failed' 
      };
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user && !!token,
    login,
    signup,
    logout,
    token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
