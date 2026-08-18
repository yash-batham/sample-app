from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.db import get_pool
from app.security import get_current_staff, hash_password
from app.sockets import emit

router = APIRouter(prefix="/api/staff", tags=["staff"])


class StaffIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    roles: list[str]
    assigned_court: str | None = None
    contact: str | None = None


class StaffPatch(BaseModel):
    name: str | None = None
    roles: list[str] | None = None
    assigned_court: str | None = None
    contact: str | None = None
    password: str | None = None


class StaffOut(BaseModel):
    id: int
    name: str
    email: str
    roles: list[str]
    assigned_court: str | None = None
    contact: str | None = None


@router.get("", response_model=list[StaffOut])
async def list_staff(_: dict = Depends(get_current_staff)):
    pool = get_pool()
    rows = await pool.fetch(
        """SELECT s.id, s.name, s.email, s.assigned_court, s.contact,
                  COALESCE(array_agg(sr.role ORDER BY sr.role) FILTER (WHERE sr.role IS NOT NULL), '{}') AS roles
           FROM staff s
           LEFT JOIN staff_roles sr ON sr.staff_id = s.id
           GROUP BY s.id, s.name, s.email, s.assigned_court, s.contact
           ORDER BY s.name"""
    )
    return [StaffOut(**dict(r)) for r in rows]


@router.post("", response_model=StaffOut, status_code=201)
async def create_staff(payload: StaffIn, _: dict = Depends(get_current_staff)):
    roles = list(dict.fromkeys(payload.roles))
    if not roles:
        raise HTTPException(status_code=422, detail="At least one role is required")

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO staff (name, email, password_hash, assigned_court, contact)
                   VALUES ($1, $2, $3, $4, $5)
                   RETURNING id, name, email, assigned_court, contact""",
                payload.name, payload.email, hash_password(payload.password),
                payload.assigned_court, payload.contact,
            )
            await conn.executemany(
                "INSERT INTO staff_roles (staff_id, role) VALUES ($1, $2)",
                [(row["id"], r) for r in roles],
            )
    await emit("staff:updated", {"id": row["id"]})
    return StaffOut(**dict(row), roles=roles)


@router.patch("/{staff_id}", response_model=StaffOut)
async def update_staff(staff_id: int, payload: StaffPatch, current_staff: dict = Depends(get_current_staff)):
    if payload.password and "director" not in current_staff["roles"]:
        raise HTTPException(status_code=403, detail="Only a director can change passwords")

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow("SELECT * FROM staff WHERE id = $1", staff_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="Staff not found")

            fields = payload.model_dump(exclude_unset=True, exclude={"password", "roles"})
            password_hash = hash_password(payload.password) if payload.password else None

            updated = dict(existing) | fields
            if password_hash:
                updated["password_hash"] = password_hash

            row = await conn.fetchrow(
                """UPDATE staff SET name=$1, assigned_court=$2, contact=$3, password_hash=$4
                   WHERE id=$5
                   RETURNING id, name, email, assigned_court, contact""",
                updated["name"], updated["assigned_court"], updated["contact"],
                updated["password_hash"], staff_id,
            )

            if payload.roles is not None:
                roles = list(dict.fromkeys(payload.roles))
                if not roles:
                    raise HTTPException(status_code=422, detail="At least one role is required")
                await conn.execute("DELETE FROM staff_roles WHERE staff_id = $1", staff_id)
                await conn.executemany(
                    "INSERT INTO staff_roles (staff_id, role) VALUES ($1, $2)",
                    [(staff_id, r) for r in roles],
                )

            role_rows = await conn.fetch(
                "SELECT role FROM staff_roles WHERE staff_id = $1 ORDER BY role", staff_id
            )
    await emit("staff:updated", {"id": staff_id})
    return StaffOut(**dict(row), roles=[r["role"] for r in role_rows])


@router.delete("/{staff_id}", status_code=204)
async def delete_staff(staff_id: int, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    await pool.execute("DELETE FROM staff WHERE id = $1", staff_id)
    await emit("staff:updated", {"id": staff_id})
