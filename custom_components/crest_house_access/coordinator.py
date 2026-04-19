from __future__ import annotations

import asyncio
from contextlib import suppress
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Set

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_SCAN_INTERVAL
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import CrestHouseAccessApiClient, CrestHouseAccessApiError
from .const import (
    DEFAULT_SCAN_INTERVAL_MINUTES,
    DOMAIN,
    EVENT_ACCESS_EVENT,
    EVENT_PERSON_ARRIVED,
    EVENT_PERSON_LEFT,
    STREAM_RECONNECT_DELAY_SECONDS,
)

_LOGGER = logging.getLogger(__name__)


class CrestHouseAccessDataUpdateCoordinator(DataUpdateCoordinator[Dict[str, Any]]):
    """Coordinator for Crest House Access API data."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        self._stream_task: Optional[asyncio.Task] = None
        self._seen_event_ids: Set[int] = set()
        self._seeded_recent_events = False
        self.api = CrestHouseAccessApiClient(
            async_get_clientsession(hass),
            entry.data["base_url"],
            entry.data["api_key"],
            entry.options.get("verify_ssl", entry.data.get("verify_ssl", True)),
        )

        update_minutes = entry.options.get(
            CONF_SCAN_INTERVAL,
            entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL_MINUTES),
        )

        super().__init__(
            hass,
            logger=_LOGGER,
            name=f"{DOMAIN}_{entry.entry_id}",
            update_interval=timedelta(minutes=update_minutes),
        )

    async def _async_update_data(self) -> Dict[str, Any]:
        try:
            payload = await self.api.async_get_status()
            await self._async_process_recent_events(payload)
            await self._async_apply_heartbeat(payload, source="poll")
            return payload
        except CrestHouseAccessApiError as err:
            raise UpdateFailed(str(err) or "Failed to fetch status") from err

    async def async_start_realtime(self) -> None:
        """Start the realtime stream listener."""
        if self._stream_task and not self._stream_task.done():
            return
        self._stream_task = self.hass.async_create_task(self._async_run_stream())

    async def async_stop_realtime(self) -> None:
        """Stop the realtime stream listener."""
        if not self._stream_task:
            return

        self._stream_task.cancel()
        with suppress(asyncio.CancelledError, asyncio.TimeoutError):
            await asyncio.wait_for(self._stream_task, timeout=2)
        self._stream_task = None

    async def _async_handle_snapshot(self, payload: Dict[str, Any]) -> None:
        """Apply a pushed snapshot to the coordinator."""
        await self._async_process_recent_events(payload)
        await self._async_apply_heartbeat(payload, source="stream")
        self.async_set_updated_data(payload)

    async def async_notify_gate_signal(
        self, entity_id: str, state: str, occurred_at: str
    ) -> None:
        """Send a Home Assistant gate-state update to the app."""
        await self.api.async_post_gate_signal(entity_id, state, occurred_at)

    async def _async_run_stream(self) -> None:
        """Maintain a persistent realtime stream."""
        while True:
            try:
                await self.api.async_stream_snapshots(self._async_handle_snapshot)
            except CrestHouseAccessApiError as err:
                _LOGGER.warning("Realtime stream disconnected: %s", err)
            except asyncio.CancelledError:
                raise
            except Exception:  # pragma: no cover - defensive logging
                _LOGGER.exception("Unexpected realtime stream failure")

            await asyncio.sleep(STREAM_RECONNECT_DELAY_SECONDS)

    async def _async_process_recent_events(self, payload: Dict[str, Any]) -> None:
        """Fire Home Assistant events for newly seen access events."""
        recent_events = payload.get("recent_events", [])
        if not isinstance(recent_events, list):
            return

        event_ids = {
            int(event["id"])
            for event in recent_events
            if isinstance(event, dict) and isinstance(event.get("id"), int)
        }

        if not self._seeded_recent_events:
            self._seen_event_ids = event_ids
            self._seeded_recent_events = True
            return

        new_events = [
            event
            for event in reversed(recent_events)
            if isinstance(event, dict)
            and isinstance(event.get("id"), int)
            and int(event["id"]) not in self._seen_event_ids
        ]

        for event in new_events:
            event_id = int(event["id"])
            self._seen_event_ids.add(event_id)

            event_type = str(event.get("event_type", ""))
            payload = {
                "event_id": event_id,
                "contractor_id": event.get("contractor_id"),
                "contractor_name": event.get("contractor_name"),
                "contractor_role": event.get("contractor_role"),
                "vehicle_reg": event.get("vehicle_reg"),
                "event_type": event_type,
                "occurred_at": event.get("occurred_at"),
                "source": event.get("source"),
            }

            self.hass.bus.async_fire(EVENT_ACCESS_EVENT, payload)
            if event_type == "enter":
                self.hass.bus.async_fire(EVENT_PERSON_ARRIVED, payload)
            elif event_type == "exit":
                self.hass.bus.async_fire(EVENT_PERSON_LEFT, payload)

        self._seen_event_ids = {
            int(event["id"])
            for event in recent_events
            if isinstance(event, dict) and isinstance(event.get("id"), int)
        }

    async def _async_apply_heartbeat(
        self, payload: Dict[str, Any], source: str
    ) -> None:
        """Measure snapshot age and report it back to the app."""
        generated_at = payload.get("generated_at")
        if not isinstance(generated_at, str):
            return

        try:
            generated_at_dt = datetime.fromisoformat(
                generated_at.replace("Z", "+00:00")
            )
        except ValueError:
            return

        if generated_at_dt.tzinfo is None:
            generated_at_dt = generated_at_dt.replace(tzinfo=timezone.utc)

        measured_at_dt = datetime.now(timezone.utc)
        heartbeat_ms = max(
            0,
            int((measured_at_dt - generated_at_dt).total_seconds() * 1000),
        )
        measured_at = measured_at_dt.isoformat().replace("+00:00", "Z")

        payload["heartbeat_ms"] = heartbeat_ms
        payload["heartbeat_measured_at"] = measured_at
        payload["heartbeat_source"] = source

        try:
            await self.api.async_post_heartbeat(
                source=source,
                heartbeat_ms=heartbeat_ms,
                snapshot_generated_at=generated_at,
                measured_at=measured_at,
            )
        except CrestHouseAccessApiError as err:
            _LOGGER.debug("Failed to report heartbeat: %s", err)
