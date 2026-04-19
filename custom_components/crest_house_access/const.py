from __future__ import annotations

from datetime import timedelta
from typing import List

from homeassistant.const import Platform

DOMAIN = "crest_house_access"
DEFAULT_NAME = "Crest House Access"
DEFAULT_SCAN_INTERVAL_MINUTES = 1
MIN_SCAN_INTERVAL_MINUTES = 1
STREAM_RECONNECT_DELAY_SECONDS = 5
DEFAULT_GATE_COVER_ENTITY_ID = "cover.top_gate"
CONF_GATE_COVER_ENTITY_ID = "gate_cover_entity_id"
CONF_ENABLE_GATE_SYNC = "enable_gate_sync"

EVENT_PERSON_ARRIVED = "crest_house_access_arrived"
EVENT_PERSON_LEFT = "crest_house_access_left"
EVENT_ACCESS_EVENT = "crest_house_access_event"

PLATFORMS: List[Platform] = [Platform.SENSOR, Platform.BINARY_SENSOR]

COORDINATOR_TIMEOUT_SECONDS = 10
DEFAULT_UPDATE_INTERVAL = timedelta(minutes=DEFAULT_SCAN_INTERVAL_MINUTES)
