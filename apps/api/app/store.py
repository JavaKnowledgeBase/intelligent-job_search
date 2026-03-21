from datetime import UTC, datetime, timedelta
from uuid import uuid4

from .models import SessionState


class MemorySessionStore:
    def __init__(self, ttl_minutes: int = 60) -> None:
        self.ttl_minutes = ttl_minutes
        self._sessions: dict[str, SessionState] = {}

    def create(self) -> SessionState:
        session_id = str(uuid4())
        session = SessionState(
            session_id=session_id,
            expires_at=datetime.now(UTC) + timedelta(minutes=self.ttl_minutes),
        )
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> SessionState | None:
        session = self._sessions.get(session_id)
        if session is None:
            return None
        if session.expires_at < datetime.now(UTC):
            del self._sessions[session_id]
            return None
        return session

    def save(self, session: SessionState) -> SessionState:
        session.expires_at = datetime.now(UTC) + timedelta(minutes=self.ttl_minutes)
        self._sessions[session.session_id] = session
        return session
