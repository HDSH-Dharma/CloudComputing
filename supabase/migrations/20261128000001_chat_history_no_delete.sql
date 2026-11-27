-- The assistant's rate limits count the user's rows in ai_chat_messages. Deleting a session
-- cascades to its messages, so a user could reset the limits by deleting chats via the API.
-- The web app never deletes chats; account deletion still removes them (owner_id cascade).
drop policy if exists "chat sessions: delete own" on public.ai_chat_sessions;
