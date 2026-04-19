from __future__ import annotations

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event

from .const import (
    CONF_ENABLE_GATE_SYNC,
    CONF_GATE_COVER_ENTITY_ID,
    DEFAULT_GATE_COVER_ENTITY_ID,
    DOMAIN,
    PLATFORMS,
)
from .coordinator import CrestHouseAccessDataUpdateCoordinator


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the integration namespace."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Crest House Access from a config entry."""
    coordinator = CrestHouseAccessDataUpdateCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})  # Per-entry coordinators live under this domain key.
    hass.data[DOMAIN][entry.entry_id] = coordinator
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    @callback
    def _start_realtime_listener(*_: object) -> None:
        hass.async_create_task(coordinator.async_start_realtime())

    if hass.is_running:
        _start_realtime_listener()
    else:
        entry.async_on_unload(
            hass.bus.async_listen_once(
                EVENT_HOMEASSISTANT_STARTED, _start_realtime_listener
            )
        )

    if entry.options.get(CONF_ENABLE_GATE_SYNC, True):
        gate_entity_id = entry.options.get(
            CONF_GATE_COVER_ENTITY_ID, DEFAULT_GATE_COVER_ENTITY_ID
        )

        @callback
        def _handle_gate_state_change(event) -> None:
            old_state = event.data.get("old_state")
            new_state = event.data.get("new_state")
            if new_state is None:
                return
            if new_state.state not in {"open", "opening"}:
                return
            if old_state is not None and old_state.state == new_state.state:
                return

            occurred_at = new_state.last_changed.isoformat()
            hass.async_create_task(
                coordinator.async_notify_gate_signal(
                    gate_entity_id,
                    new_state.state,
                    occurred_at,
                )
            )

        entry.async_on_unload(
            async_track_state_change_event(
                hass,
                [gate_entity_id],
                _handle_gate_state_change,
            )
        )


    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    coordinator = hass.data[DOMAIN].get(entry.entry_id)
    if coordinator is not None:
        await coordinator.async_stop_realtime()

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload a config entry after options change."""
    await hass.config_entries.async_reload(entry.entry_id)
