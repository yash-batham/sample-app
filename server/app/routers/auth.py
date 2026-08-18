from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.db import get_pool
from app.security import create_access_token, get_current_staff, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    name: str
    password: str


class StaffOut(BaseModel):
    id: int
    name: str
    email: str
    roles: list[str]
    assigned_court: str | None = None
    contact: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    staff: StaffOut


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    pool = get_pool()
    row = await pool.fetchrow(
        """SELECT s.id, s.name, s.email, s.password_hash, s.assigned_court, s.contact,
                  COALESCE(array_agg(sr.role ORDER BY sr.role) FILTER (WHERE sr.role IS NOT NULL), '{}') AS roles
           FROM staff s
           LEFT JOIN staff_roles sr ON sr.staff_id = s.id
           WHERE s.name = $1
           GROUP BY s.id, s.name, s.email, s.password_hash, s.assigned_court, s.contact""",
        payload.name,
    )
    if row is None or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid name or password")

    token = create_access_token(row["id"], row["roles"])
    return LoginResponse(
        access_token=token,
        staff=StaffOut(
            id=row["id"], name=row["name"], email=row["email"], roles=row["roles"],
            assigned_court=row["assigned_court"], contact=row["contact"],
        ),
    )


@router.get("/me", response_model=StaffOut)
async def me(current_staff: dict = Depends(get_current_staff)):
    return StaffOut(**current_staff)
