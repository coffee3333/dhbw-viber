import httpx
from app.core.logger import get_logger

logger = get_logger("meeting_agent.telegram")


class TelegramNotifier:
    """Sends rich HTML event alerts to team channels or personal user DMs."""

    @staticmethod
    async def send_message(bot_token: str | None, chat_id: str | None, html_text: str) -> bool:
        """Send formatted HTML message via Telegram Bot API."""
        if not bot_token or not chat_id:
            return False

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": html_text,
            "parse_mode": "HTML",
            "disable_web_page_preview": False,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return True
                logger.warning(f"Telegram API warning {res.status_code}: {res.text}")
                return False
        except Exception as e:
            logger.error(f"Failed to send Telegram alert: {e}")
            return False
