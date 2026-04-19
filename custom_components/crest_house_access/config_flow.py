from __future__ import annotations

from typing import Any, Dict, Optional
from urllib.parse import urlparse

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import (
    CONF_API_KEY,
    CONF_NAME,
    CONF_SCAN_INTERVAL,
    CONF_VERIFY_SSL,
)
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import NumberSelector, NumberSelectorConfig

from .api import (
    CrestHouseAccessApiClient,
    CrestHouseAccessCannotConnect,
    CrestHouseAccessInvalidAuth,
    normalize_base_url,
)
from .const import (
    CONF_ENABLE_GATE_SYNC,
    CONF_GATE_COVER_ENTITY_ID,
    DEFAULT_NAME,
    DEFAULT_GATE_COVER_ENTITY_ID,
    DEFAULT_SCAN_INTERVAL_MINUTES,
    DOMAIN,
    MIN_SCAN_INTERVAL_MINUTES,
)

CONF_BASE_URL = "base_url"


async def validate_input(hass: HomeAssistant, data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate the provided credentials."""
    client = CrestHouseAccessApiClient(
        async_get_clientsession(hass),
        data[CONF_BASE_URL],
        data[CONF_API_KEY],
        data[CONF_VERIFY_SSL],
    )
    await client.async_get_status()

    parsed = urlparse(data[CONF_BASE_URL])
    return {"title": data[CONF_NAME].strip() or parsed.netloc}


class CrestHouseAccessConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Crest House Access."""

    VERSION = 1

    async def async_step_user(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        errors: Dict[str, str] = {}

        if user_input is not None:
            cleaned = dict(user_input)

            try:
                cleaned[CONF_BASE_URL] = normalize_base_url(cleaned[CONF_BASE_URL])
                info = await validate_input(self.hass, cleaned)
            except ValueError:
                errors["base"] = "invalid_url"
            except CrestHouseAccessInvalidAuth:
                errors["base"] = "invalid_auth"
            except CrestHouseAccessCannotConnect:
                errors["base"] = "cannot_connect"
            except Exception:
                errors["base"] = "unknown"
            else:
                await self.async_set_unique_id(cleaned[CONF_BASE_URL])
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=info["title"],
                    data=cleaned,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_NAME, default=DEFAULT_NAME): str,
                    vol.Required(CONF_BASE_URL): str,
                    vol.Required(CONF_API_KEY): str,
                    vol.Optional(
                        CONF_SCAN_INTERVAL,
                        default=DEFAULT_SCAN_INTERVAL_MINUTES,
                    ): NumberSelector(
                        NumberSelectorConfig(
                            min=MIN_SCAN_INTERVAL_MINUTES,
                            max=60,
                            step=1,
                            mode="box",
                        )
                    ),
                    vol.Optional(CONF_VERIFY_SSL, default=True): bool,
                }
            ),
            errors=errors,
        )

    @staticmethod
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        return CrestHouseAccessOptionsFlow(config_entry)


class CrestHouseAccessOptionsFlow(config_entries.OptionsFlowWithConfigEntry):
    """Handle Crest House Access options."""

    async def async_step_init(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_SCAN_INTERVAL,
                        default=self.config_entry.options.get(
                            CONF_SCAN_INTERVAL,
                            self.config_entry.data.get(
                                CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL_MINUTES
                            ),
                        ),
                    ): NumberSelector(
                        NumberSelectorConfig(
                            min=MIN_SCAN_INTERVAL_MINUTES,
                            max=60,
                            step=1,
                            mode="box",
                        )
                    ),
                    vol.Optional(
                        CONF_VERIFY_SSL,
                        default=self.config_entry.options.get(
                            CONF_VERIFY_SSL,
                            self.config_entry.data.get(CONF_VERIFY_SSL, True),
                        ),
                    ): bool,
                    vol.Optional(
                        CONF_ENABLE_GATE_SYNC,
                        default=self.config_entry.options.get(
                            CONF_ENABLE_GATE_SYNC, True
                        ),
                    ): bool,
                    vol.Optional(
                        CONF_GATE_COVER_ENTITY_ID,
                        default=self.config_entry.options.get(
                            CONF_GATE_COVER_ENTITY_ID,
                            DEFAULT_GATE_COVER_ENTITY_ID,
                        ),
                    ): str,
                }
            ),
        )
