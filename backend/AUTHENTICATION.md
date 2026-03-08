# Authentication System Documentation

## Overview

A complete JWT-based authentication system with role-based access control (RBAC) has been implemented for the Kyverno Policy Manager API.

## Features

- **JWT Token Authentication**: Secure token-based authentication using JSON Web Tokens
- **Password Hashing**: Passwords are securely hashed using bcrypt
- **Role-Based Access Control**: Two roles - `admin` and `user`
- **Protected Routes**: All API endpoints (except auth endpoints) require authentication
- **Default Admin Account**: Auto-created on first startup

## User Roles

### Admin Role
- Can add new users (both admin and user roles)
- Can list all users
- Can delete users
- Has full access to all API endpoints

### User Role
- Can access all cluster, policy, and report endpoints
- Cannot manage other users
- Cannot create admin accounts

## Authentication Endpoints

### 1. Login
**POST** `/auth/login`

Authenticate and receive a JWT token.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 2. Public Signup
**POST** `/auth/signup`

Create a new regular user account (always creates `user` role).

**Request Body:**
```json
{
  "username": "newuser",
  "password": "password123",
  "role": "user"
}
```

**Response:**
```json
{
  "id": 2,
  "username": "newuser",
  "role": "user",
  "is_active": true,
  "created_at": "2026-03-08T10:30:00",
  "updated_at": "2026-03-08T10:30:00"
}
```

### 3. Add User (Admin Only)
**POST** `/auth/add-user`

Admin-only endpoint to create users with any role.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "username": "newadmin",
  "password": "securepass123",
  "role": "admin"
}
```

### 4. Get Current User
**GET** `/auth/me`

Get information about the currently authenticated user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

### 5. List All Users (Admin Only)
**GET** `/auth/users`

List all users in the system.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

### 6. Delete User (Admin Only)
**DELETE** `/auth/users/{user_id}`

Delete a user account.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

## Using Authentication

### Step 1: Start the Server

The server will automatically create a default admin account on first startup:
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **IMPORTANT**: Change this password immediately after first login!

### Step 2: Login

```bash
curl -X POST "http://localhost:8000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

### Step 3: Use the Token

Include the token in all subsequent requests:

```bash
curl -X GET "http://localhost:8000/clusters" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Step 4: Create Additional Users

As an admin, create new users:

```bash
curl -X POST "http://localhost:8000/auth/add-user" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "developer",
    "password": "devpass123",
    "role": "user"
  }'
```

## Protected Endpoints

All the following endpoints now require authentication:

- **Clusters**: `/clusters/*`
- **Policies**: `/policies/*`
- **Reports**: `/reports/*`

## Public Endpoints

These endpoints do NOT require authentication:

- `POST /auth/login` - Login
- `POST /auth/signup` - Public signup (creates user role only)
- `GET /` - Root endpoint
- `GET /health` - Health check
- `GET /docs` - API documentation
- `GET /api/*` - Documentation endpoints

## Token Details

- **Algorithm**: HS256
- **Expiration**: 24 hours (1440 minutes)
- **Token Type**: Bearer

## Security Configuration

### Important: Change in Production

In `app/services/auth.py`, update the following for production:

```python
# Change this secret key!
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-here")

# Optional: Adjust token expiration
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "1440"))
```

### Environment Variables

Set these environment variables in production:

```bash
JWT_SECRET_KEY=your-very-secure-random-secret-key
TOKEN_EXPIRE_MINUTES=1440
```

## Testing with Swagger UI

1. Navigate to `http://localhost:8000/docs`
2. Click on "Authorize" button (lock icon)
3. Enter: `Bearer <your_jwt_token>`
4. Click "Authorize"
5. All requests will now include the token automatically

## Error Responses

### 401 Unauthorized
```json
{
  "detail": "Could not validate credentials"
}
```

### 403 Forbidden
```json
{
  "detail": "Admin access required"
}
```

### 400 Bad Request
```json
{
  "detail": "Username already registered"
}
```

## Database Schema

### User Table

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Installation

Install the required authentication packages:

```bash
pip install -r requirements.txt
```

New dependencies added:
- `python-jose[cryptography]` - JWT token handling
- `passlib[bcrypt]` - Password hashing
- `bcrypt` - Bcrypt algorithm for password hashing

## Migration Guide

If you have an existing database, run the application once to create the users table automatically. The User model will be picked up by SQLAlchemy's `Base.metadata.create_all()` during startup.

## Best Practices

1. **Never commit the secret key** - Use environment variables
2. **Use strong passwords** - Enforce minimum 6 characters (configurable)
3. **Change default admin password** - Immediately after first login
4. **Use HTTPS in production** - Protect tokens in transit
5. **Implement token refresh** - For long-lived sessions (future enhancement)
6. **Log security events** - Monitor login attempts and failures
7. **Regular security audits** - Review user accounts and permissions

## Troubleshooting

### "Could not validate credentials"
- Token expired (>24 hours old)
- Token malformed or invalid
- User no longer exists
- Solution: Login again to get a new token

### "Admin access required"
- User role is not 'admin'
- Solution: Have an admin create a new admin user or promote existing user

### "Username already registered"
- Username already exists in database
- Solution: Choose a different username

## Future Enhancements

Consider these improvements for production:

1. **Token Refresh**: Implement refresh tokens for better UX
2. **Password Reset**: Email-based password reset flow
3. **Account Lockout**: After N failed login attempts
4. **Multi-Factor Authentication (MFA)**: For enhanced security
5. **OAuth2 Integration**: Google, GitHub, etc.
6. **API Key Authentication**: For service-to-service calls
7. **Audit Logging**: Track all authentication events
