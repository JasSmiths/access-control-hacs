from __future__ import annotations

from dataclasses import dataclass
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
    value_fn: Callable[[Dict[str, Any]], int]


SENSORS: Tuple[CrestHouseAccessSensorDescription, ...] = (
    CrestHouseAccessSensorDescription(
        key="on_site",
        translation_key="on_site",
        icon="mdi:badge-account-horizontal",
        value_fn=lambda data: int(data.get("on_site", 0)),
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
    def native_value(self) -> int:
        """Return the current value."""
        return self.entity_description.value_fn(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> Optional[Dict[str, Any]]:
        """Return extra attributes for richer automations."""
        if self.entity_description.key != "on_site":
            return None

        return {
            "generated_at": self.coordinator.data.get("generated_at"),
            "open_sessions": self.coordinator.data.get("open_sessions", []),
        }
