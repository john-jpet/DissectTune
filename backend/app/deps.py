from fastapi import Header, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User


def get_current_user(
    x_user_email: str = Header(default="demo@dissecttune.local"),
    db: Session = Depends(get_db),
) -> User:
    user = db.query(User).filter(User.email == x_user_email).first()
    if user is None:
        user = User(email=x_user_email)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
