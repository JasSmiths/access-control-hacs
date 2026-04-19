from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional, Tuple

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .entity import (
    CrestHouseAccessEntity,
    get_last_event_by_type,
    get_off_site_names,
    get_on_site_names,
    get_people,
)


@dataclass(frozen=True, kw_only=True)
class CrestHouseAccessSensorDescription(SensorEntityDescription):
    value_fn: Callable[[Dict[str, Any]], Any]
    attributes_fn: Callable[[Dict[str, Any]], Optional[Dict[str, Any]]] = field(
        default=lambda _: None
    )


def recent_events_attributes(data: Dict[str, Any]) -> Dict[str, Any]:
    recent_events = data.get("recent_events", [])
    latest_event = recent_events[0] if recent_events else None

    return {
        "generated_at": data.get("generated_at"),
        "latest_event": latest_event,
        "recent_events": recent_events,
    }


def last_person_attributes(data: Dict[str, Any], event_type: str) -> Dict[str, Any]:
    event = get_last_event_by_type(data, event_type)
    return {
        "generated_at": data.get("generated_at"),
        "event": event,
        "recent_events": data.get("recent_events", []),
    }


SENSORS: Tuple[CrestHouseAccessSensorDescription, ...] = (
    CrestHouseAccessSensorDescription(
        key="on_site",
        translation_key="on_site",
        icon="mdi:badge-account-horizontal",
        value_fn=lambda data: int(data.get("on_site", 0)),
        attributes_fn=lambda data: {
            "generated_at": data.get("generated_at"),
            "people": data.get("people", []),
            "open_sessions": data.get("open_sessions", []),
            "recent_events": data.get("recent_events", []),
        },
    ),
    CrestHouseAccessSensorDescription(
        key="contractors",
        translation_key="contractors",
        icon="mdi:account-hard-hat",
        value_fn=lambda data: int(data.get("contractors", 0)),
    ),
    CrestHouseAccessSensorDescription(
        key="flagged_today",
        translation_key="flagged_today",
        icon="mdi:alert-outline",
        value_fn=lambda data: int(data.get("flagged_today", 0)),
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    CrestHouseAccessSensorDescription(
        key="heartbeat",
        translation_key="heartbeat",
        icon="mdi:heart-pulse",
        native_unit_of_measurement="ms",
        value_fn=lambda data: (
            int(data["heartbeat_ms"]) if data.get("heartbeat_ms") is not None else None
        ),
        entity_category=EntityCategory.DIAGNOSTIC,
        attributes_fn=lambda data: {
            "generated_at": data.get("generated_at"),
            "heartbeat_measured_at": data.get("heartbeat_measured_at"),
            "heartbeat_source": data.get("heartbeat_source"),
            "latest_gate_signal": data.get("latest_gate_signal"),
        },
    ),
    CrestHouseAccessSensorDescription(
        key="last_event",
        translation_key="last_event",
        icon="mdi:history",
        value_fn=lambda data: (
            data.get("recent_events", [{}])[0].get("event_type", "none")
            if data.get("recent_events")
            else "none"
        ),
        attributes_fn=recent_events_attributes,
    ),
    CrestHouseAccessSensorDescription(
        key="on_site_names",
        translation_key="on_site_names",
        icon="mdi:account-group",
        value_fn=lambda data: ", ".join(get_on_site_names(data)) or "none",
        attributes_fn=lambda data: {
            "generated_at": data.get("generated_at"),
            "names": get_on_site_names(data),
            "count": len(get_on_site_names(data)),
            "off_site_names": get_off_site_names(data),
            "people": get_people(data),
            "open_sessions": data.get("open_sessions", []),
        },
    ),
    CrestHouseAccessSensorDescription(
        key="last_arrived",
        translation_key="last_arrived",
        icon="mdi:login",
        value_fn=lambda data: (
            (get_last_event_by_type(data, "enter") or {}).get("contractor_name")
            or "none"
        ),
        attributes_fn=lambda data: last_person_attributes(data, "enter"),
    ),
    CrestHouseAccessSensorDescription(
        key="last_left",
        translation_key="last_left",
        icon="mdi:logout",
        value_fn=lambda data: (
            (get_last_event_by_type(data, "exit") or {}).get("contractor_name")
            or "none"
        ),
        attributes_fn=lambda data: last_person_attributes(data, "exit"),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        CrestHouseAccessSensor(coordinator, description) for description in SENSORS
    )


class CrestHouseAccessSensor(CrestHouseAccessEntity, SensorEntity):
    """Representation of a Crest House Access sensor."""

    entity_description: CrestHouseAccessSensorDescription

    def __init__(
        self,
        coordinator,
        description: CrestHouseAccessSensorDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{description.key}"

    @property
    def native_value(self) -> Any:
        """Return the current value."""
        return self.entity_description.value_fn(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> Optional[Dict[str, Any]]:
        """Return extra attributes for richer automations."""
        return self.entity_description.attributes_fn(self.coordinator.data)
