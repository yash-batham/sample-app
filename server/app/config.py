from functools import lru_cache
from urllib.parse import quote

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@localhost:5432/postgres"
    # Alternative to database_url: set these instead (e.g. from an AWS
    # Secrets Manager-backed ECS "secrets" mapping) and database_url is
    # assembled from them at startup.
    db_host: str | None = None
    db_port: int = 5432
    db_user: str | None = None
    db_password: str | None = None
    db_name: str | None = None
    db_schema: str = "public"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 12
    cors_origins: list[str] = ["http://localhost:5173"]

    @model_validator(mode="after")
    def _assemble_database_url(self) -> "Settings":
        if self.db_host and self.db_user and self.db_password and self.db_name:
            self.database_url = (
                f"postgresql://{quote(self.db_user)}:{quote(self.db_password)}"
                f"@{self.db_host}:{self.db_port}/{self.db_name}"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
