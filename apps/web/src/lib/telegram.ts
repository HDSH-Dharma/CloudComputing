/**
 * Username of the FilamentIQ Telegram bot, without the "@" (ask Maverick, who owns the bot).
 * Leave empty until known: the page then tells users to search for the bot by name
 * instead of showing a t.me link. A username is public, so it is safe to commit.
 */
export const TELEGRAM_BOT_USERNAME = "";

export const LINK_CODE_TTL_MS = 15 * 60 * 1000; // matches telegram_link_tokens.expires_at default

export const startCommand = (code: string) => `/start ${code}`;
export const botLink = (code: string) => (TELEGRAM_BOT_USERNAME ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}` : null);
