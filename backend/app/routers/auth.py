"""
Authentication router for login, signup, and user management.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db import get_db
from app.models import User
from app.schemas import UserCreate, UserLogin, UserResponse, Token
from app.services.auth import (
    authenticate_user,
    create_access_token,
    get_password_hash,
    get_current_user,
    get_current_active_admin
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
async def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """
    Login endpoint to authenticate users and return JWT token.
    
    Args:
        user_login: Login credentials (username and password)
        db: Database session
        
    Returns:
        JWT access token
        
    Raises:
        HTTPException: If authentication fails
    """
    user = authenticate_user(db, user_login.username, user_login.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_create: UserCreate, db: Session = Depends(get_db)):
    """
    Public signup endpoint - creates a regular user account.
    Note: Only creates 'user' role accounts. Admins must use /auth/add-user endpoint.
    
    Args:
        user_create: User creation data
        db: Database session
        
    Returns:
        Created user information
        
    Raises:
        HTTPException: If username already exists
    """
    # Check if username already exists
    existing_user = db.query(User).filter(User.username == user_create.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Force role to 'user' for public signup
    new_user = User(
        username=user_create.username,
        hashed_password=get_password_hash(user_create.password),
        role="user",  # Always create as regular user
        is_active=True
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.post("/add-user", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def add_user(
    user_create: UserCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_active_admin)
):
    """
    Admin-only endpoint to add users with any role (admin or user).
    
    Only authenticated admin users can access this endpoint.
    
    Args:
        user_create: User creation data including role
        db: Database session
        current_admin: Current authenticated admin user
        
    Returns:
        Created user information
        
    Raises:
        HTTPException: If username already exists or user is not admin
    """
    # Check if username already exists
    existing_user = db.query(User).filter(User.username == user_create.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Validate role
    if user_create.role not in ["admin", "user"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be either 'admin' or 'user'"
        )
    
    # Create new user with specified role
    new_user = User(
        username=user_create.username,
        hashed_password=get_password_hash(user_create.password),
        role=user_create.role,
        is_active=True
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current authenticated user information.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        Current user information
    """
    return current_user


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_active_admin)
):
    """
    Admin-only endpoint to list all users.
    
    Args:
        db: Database session
        current_admin: Current authenticated admin user
        
    Returns:
        List of all users
    """
    users = db.query(User).all()
    return users


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_active_admin)
):
    """
    Admin-only endpoint to delete a user.
    
    Args:
        user_id: ID of the user to delete
        db: Database session
        current_admin: Current authenticated admin user
        
    Raises:
        HTTPException: If user not found or trying to delete self
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from deleting themselves
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    db.delete(user)
    db.commit()
