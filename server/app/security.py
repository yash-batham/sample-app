from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings
from app.db import get_pool

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(staff_id: int, roles: list[str]) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": str(staff_id), "roles": roles, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def get_current_staff(token: str | None = Depends(oauth2_scheme)) -> dict:
    settings = get_settings()
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_error
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        staff_id = payload.get("sub")
        if staff_id is None:
            raise credentials_error
        staff_id = int(staff_id)
    except (JWTError, ValueError):
        raise credentials_error

    pool = get_pool()
    row = await pool.fetchrow(
        """SELECT s.id, s.name, s.email, s.assigned_court, s.contact,
                  COALESCE(array_agg(sr.role ORDER BY sr.role) FILTER (WHERE sr.role IS NOT NULL), '{}') AS roles
           FROM staff s
           LEFT JOIN staff_roles sr ON sr.staff_id = s.id
           WHERE s.id = $1
           GROUP BY s.id, s.name, s.email, s.assigned_court, s.contact""",
        staff_id,
    )
    if row is None:
        raise credentials_error
    return dict(row)


def require_role(*roles: str):
    async def dependency(current_staff: dict = Depends(get_current_staff)) -> dict:
        if not set(roles) & set(current_staff["roles"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of the following roles: {', '.join(roles)}",
            )
        return current_staff

    return dependency


require_director = require_role("director")
