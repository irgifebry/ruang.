-- Remove the AI assistant.
--
-- The assistant page, its API route, and the `ai-providers` / `ai-actions`
-- modules are gone, so nothing reads or writes this table any more. It held a
-- plaintext provider API key per user, so dropping it also removes every stored
-- credential.
--
-- `if exists` because a database provisioned from the current `schema.sql`
-- never had the table in the first place — the two routes through this folder
-- have to both end in the same schema.

drop table if exists public.ai_settings;