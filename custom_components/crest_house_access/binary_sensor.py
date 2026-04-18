from __future__ import annotations

from typing import Any, Dict

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .entity import CrestHouseAccessEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([CrestHouseAccessOccupiedBinarySensor(coordinator)])


class CrestHouseAccessOccupiedBinarySensor(CrestHouseAccessEntity, BinarySensorEntity):
    """Binary sensor for whether anybody is currently on site."""

    _attr_translation_key = "site_occupied"
    _attr_icon = "mdi:home-account"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_site_occupied"

    @property
    def is_on(self) -> bool:
        """Return true when one or more people are on site."""
        return int(self.coordinator.data.get("on_site", 0)) > 0

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        """Expose the current open sessions."""
        return {
            "generated_at": self.coordinator.data.get("generated_at"),
            "open_sessions": self.coordinator.data.get("open_sessions", []),
            "recent_events": self.coordinator.data.get("recent_events", []),
        }
