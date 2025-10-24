"""Rate limiter (slowapi). Apply to sensitive routes like /auth/login."""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=[])
