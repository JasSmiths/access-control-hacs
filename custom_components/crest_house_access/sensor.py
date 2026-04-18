from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional, Tuple

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .entity import CrestHouseAccessEntity


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


SENSORS: Tuple[CrestHouseAccessSensorDescription, ...] = (
    CrestHouseAccessSensorDescription(
        key="on_site",
        translation_key="on_site",
        icon="mdi:badge-account-horizontal",
        value_fn=lambda data: int(data.get("on_site", 0)),
        attributes_fn=lambda data: {
            "generated_at": data.get("generated_at"),
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
