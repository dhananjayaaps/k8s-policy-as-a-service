# Frontend Authentication Integration

## Overview

The frontend has been fully integrated with the JWT authentication system. All pages are now protected and require authentication.

## What Was Added

### 1. **Authentication Context** ([contexts/AuthContext.tsx](src/contexts/AuthContext.tsx))
   - Manages authentication state globally
   - Handles login, signup, and logout
   - Stores JWT token in localStorage
   - Provides `useAuth()` hook for components

### 2. **Login Page** ([app/login/page.tsx](src/app/login/page.tsx))
   - Beautiful login/signup UI with gradient background
   - Toggle between login and signup modes
   - Shows default credentials hint
   - Error handling and loading states
   - Redirects to dashboard after successful login

### 3. **Protected Route Wrapper** ([components/ProtectedRoute.tsx](src/components/ProtectedRoute.tsx))
   - Wraps protected pages
   - Redirects to login if not authenticated
   - Shows loading spinner during auth check

### 4. **Updated Components**
   - **Header**: Now shows username, role badge, and logout button
   - **Layout**: Wrapped with AuthProvider
   - **Main Page**: Wrapped with ProtectedRoute

### 5. **API Updates** ([lib/api.ts](src/lib/api.ts))
   - Added auth endpoints (login, signup, getCurrentUser)
   - JWT token automatically included in all API requests
   - Token retrieved from localStorage
   - Better error handling with detailed messages

### 6. **Type Definitions** ([types/index.ts](src/types/index.ts))
   - User, LoginRequest, SignupRequest, AuthResponse types added

### 7. **Configuration** ([lib/config.ts](src/lib/config.ts))
   - Updated backend URL to `http://localhost:8000`
   - Changed `useMockData` to `false` to use real API
   - Removed API version from URL construction

## File Structure

```
frontend/src/
├── app/
│   ├── layout.tsx          # Root layout with AuthProvider
│   ├── page.tsx            # Main page wrapped with ProtectedRoute
│   └── login/
│       └── page.tsx        # Login/Signup page
├── components/
│   ├── Header.tsx          # Updated with user info and logout
│   └── ProtectedRoute.tsx  # Route protection wrapper
├── contexts/
│   └── AuthContext.tsx     # Authentication state management
├── lib/
│   ├── api.ts              # API client with JWT support
│   └── config.ts           # API configuration
└── types/
    └── index.ts            # TypeScript type definitions
```

## How It Works

### Authentication Flow

1. **First Visit**
   - User navigates to app
   - ProtectedRoute checks authentication
   - Redirects to `/login` if not authenticated

2. **Login**
   - User enters credentials
   - POST to `/auth/login`
   - Receives JWT token
   - Token stored in localStorage
   - User profile loaded from `/auth/me`
   - Redirected to dashboard

3. **Authenticated Requests**
   - All API calls automatically include `Authorization: Bearer <token>` header
   - Token retrieved from localStorage on each request

4. **Logout**
   - User clicks logout button
   - Token removed from localStorage
   - Redirected to login page

### Token Storage

- **Location**: `localStorage.getItem('auth_token')`
- **Lifetime**: 24 hours (server-side)
- **Renewal**: User must login again after expiration

### State Management

The `AuthContext` provides:
- `user`: Current user object or null
- `loading`: Boolean indicating auth check in progress
- `isAuthenticated`: Boolean if user is logged in
- `login(credentials)`: Login function
- `signup(data)`: Signup function
- `logout()`: Logout function
- `token`: Current JWT token or null

## Usage Examples

### Using Auth in a Component

```tsx
'use client';

import { useAuth } from '@/src/contexts/AuthContext';

export default function MyComponent() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  return (
    <div>
      <h1>Welcome {user?.username}!</h1>
      {user?.role === 'admin' && <p>You are an admin</p>}
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Making Authenticated API Calls

```tsx
import { getClusters } from '@/src/lib/api';

async function loadData() {
  const response = await getClusters();
  
  if (response.error) {
    console.error('Error:', response.error);
    if (response.status === 401) {
      // Token expired or invalid - redirect to login
    }
  } else {
    console.log('Data:', response.data);
  }
}
```

### Protecting a New Route

```tsx
'use client';

import ProtectedRoute from '@/src/components/ProtectedRoute';

export default function MyProtectedPage() {
  return (
    <ProtectedRoute>
      <div>This content is protected</div>
    </ProtectedRoute>
  );
}
```

## Running the Application

### Start Backend (Terminal 1)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Start Frontend (Terminal 2)

```bash
cd frontend
npm install
npm run dev
```

### Access the App

1. Open http://localhost:3000
2. You'll be redirected to login page
3. Use default credentials:
   - **Username**: `admin`
   - **Password**: `admin123`
4. After login, you'll see the dashboard

## Features

### Login Page Features
- ✅ Login and signup toggle
- ✅ Form validation (min 3 chars username, min 6 chars password)
- ✅ Loading states during authentication
- ✅ Error messages
- ✅ Beautiful gradient UI with animations
- ✅ Default credentials hint
- ✅ Responsive design

### Header Features
- ✅ Shows current username
- ✅ Admin role badge
- ✅ Logout button
- ✅ Cluster selector
- ✅ Connection status

### Security Features
- ✅ JWT token authentication
- ✅ Token auto-included in API requests
- ✅ Protected routes
- ✅ Automatic redirect to login
- ✅ Token stored securely in localStorage
- ✅ Logout clears all auth data

## Environment Variables

Create a `.env.local` file in the frontend directory:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Troubleshooting

### "Could not validate credentials" Error
- Token has expired (>24 hours old)
- Solution: Logout and login again

### Redirected to Login Immediately
- Token not in localStorage
- Token invalid or expired
- Solution: Login again

### API Calls Failing with 401
- Backend not running
- Token expired
- Solution: Check backend is running on port 8000, login again

### CORS Errors
- Backend CORS not configured properly
- Solution: Backend already configured for `allow_origins=["*"]`

## Future Enhancements

Consider adding:
1. **Token Refresh**: Implement refresh tokens for seamless re-authentication
2. **Remember Me**: Optional persistent login
3. **Password Reset**: Email-based password reset flow
4. **Profile Page**: User can update their own information
5. **Admin Panel**: Manage users, view all accounts
6. **Session Timeout Warning**: Warn user before token expires
7. **Two-Factor Authentication**: Enhanced security
8. **OAuth Integration**: Login with Google, GitHub, etc.

## Testing

### Test Login
```bash
# In browser console
localStorage.setItem('auth_token', 'your-jwt-token-here')
location.reload()
```

### Clear Auth State
```bash
# In browser console
localStorage.removeItem('auth_token')
location.reload()
```

### Check Current Token
```bash
# In browser console
console.log(localStorage.getItem('auth_token'))
```

## Notes

- All routes except `/login` are protected
- Token is validated on page load
- Token is automatically included in all API calls
- Logout clears token and redirects to login
- Admin users see a purple "Admin" badge in header
- Backend must be running on port 8000
- Frontend runs on port 3000 (Next.js default)
