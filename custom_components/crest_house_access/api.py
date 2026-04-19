from __future__ import annotations

from json import JSONDecodeError, loads
from typing import Any, Awaitable, Callable, Dict, List
from urllib.parse import urlparse

from aiohttp import ClientError, ClientResponseError, ClientSession, ClientTimeout

from .const import COORDINATOR_TIMEOUT_SECONDS


class CrestHouseAccessApiError(Exception):
    """Base API error."""


class CrestHouseAccessCannotConnect(CrestHouseAccessApiError):
    """Raised when the integration cannot connect."""


class CrestHouseAccessInvalidAuth(CrestHouseAccessApiError):
    """Raised when auth is rejected."""


def normalize_base_url(base_url: str) -> str:
    """Validate and normalize a base URL."""
    cleaned = base_url.strip().rstrip("/")
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("invalid_url")
    return cleaned


class CrestHouseAccessApiClient:
    """Small API client for Crest House Access Control."""

    def __init__(
        self,
        session: ClientSession,
        base_url: str,
        api_key: str,
        verify_ssl: bool,
    ) -> None:
        self._session = session
        self._base_url = normalize_base_url(base_url)
        self._api_key = api_key.strip()
        self._verify_ssl = verify_ssl

    async def async_get_status(self) -> Dict[str, Any]:
        """Fetch the Home Assistant status payload."""
        try:
            async with self._session.get(
                f"{self._base_url}/api/v1/status",
                headers={"Authorization": f"Bearer {self._api_key}"},
                ssl=self._verify_ssl,
                timeout=COORDINATOR_TIMEOUT_SECONDS,
            ) as response:
                if response.status == 401:
                    raise CrestHouseAccessInvalidAuth

                response.raise_for_status()
                payload = await response.json()
        except CrestHouseAccessInvalidAuth:
            raise
        except ClientResponseError as err:
            raise CrestHouseAccessCannotConnect from err
        except ClientError as err:
            raise CrestHouseAccessCannotConnect from err

        if not isinstance(payload, dict) or payload.get("ok") is not True:
            raise CrestHouseAccessCannotConnect

        return payload

    async def async_stream_snapshots(
        self,
        on_snapshot: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> None:
        """Listen for realtime snapshots over the event stream."""
        try:
            async with self._session.get(
                f"{self._base_url}/api/v1/stream",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Accept": "text/event-stream",
                },
                ssl=self._verify_ssl,
                timeout=ClientTimeout(total=None, sock_read=60),
            ) as response:
                if response.status == 401:
                    raise CrestHouseAccessInvalidAuth

                response.raise_for_status()

                event_name = "message"
                data_lines: List[str] = []

                async for raw_line in response.content:
                    line = raw_line.decode("utf-8").strip()

                    if not line:
                        if event_name == "snapshot" and data_lines:
                            try:
                                payload = loads("\n".join(data_lines))
                            except JSONDecodeError as err:
                                raise CrestHouseAccessCannotConnect from err

                            if (
                                isinstance(payload, dict)
                                and payload.get("ok") is True
                            ):
                                await on_snapshot(payload)

                        event_name = "message"
                        data_lines = []
                        continue

                    if line.startswith(":"):
                        continue
                    if line.startswith("event:"):
                        event_name = line[6:].strip()
                        continue
                    if line.startswith("data:"):
                        data_lines.append(line[5:].lstrip())
        except CrestHouseAccessInvalidAuth:
            raise
        except ClientResponseError as err:
            raise CrestHouseAccessCannotConnect from err
        except ClientError as err:
            raise CrestHouseAccessCannotConnect from err

    async def async_post_gate_signal(
        self,
        entity_id: str,
        state: str,
        occurred_at: str,
    ) -> Dict[str, Any]:
        """Send a Home Assistant gate-state signal back to the app."""
        try:
            async with self._session.post(
                f"{self._base_url}/api/v1/gate-signal",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "entity_id": entity_id,
                    "state": state,
                    "occurred_at": occurred_at,
                    "source": "home_assistant",
                },
                ssl=self._verify_ssl,
                timeout=COORDINATOR_TIMEOUT_SECONDS,
            ) as response:
                if response.status == 401:
                    raise CrestHouseAccessInvalidAuth

                response.raise_for_status()
                payload = await response.json()
        except CrestHouseAccessInvalidAuth:
            raise
        except ClientResponseError as err:
            raise CrestHouseAccessCannotConnect from err
        except ClientError as err:
            raise CrestHouseAccessCannotConnect from err

        if not isinstance(payload, dict) or payload.get("ok") is not True:
            raise CrestHouseAccessCannotConnect

        return payload

    async def async_post_heartbeat(
        self,
        source: str,
        heartbeat_ms: int,
        snapshot_generated_at: str,
        measured_at: str,
    ) -> Dict[str, Any]:
        """Send a heartbeat sample back to the app."""
        try:
            async with self._session.post(
                f"{self._base_url}/api/v1/heartbeat",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "source": source,
                    "heartbeat_ms": heartbeat_ms,
                    "snapshot_generated_at": snapshot_generated_at,
                    "measured_at": measured_at,
                },
                ssl=self._verify_ssl,
                timeout=COORDINATOR_TIMEOUT_SECONDS,
            ) as response:
                if response.status == 401:
                    raise CrestHouseAccessInvalidAuth

                response.raise_for_status()
                payload = await response.json()
        except CrestHouseAccessInvalidAuth:
            raise
        except ClientResponseError as err:
            raise CrestHouseAccessCannotConnect from err
        except ClientError as err:
            raise CrestHouseAccessCannotConnect from err

        if not isinstance(payload, dict) or payload.get("ok") is not True:
            raise CrestHouseAccessCannotConnect

        return payload
