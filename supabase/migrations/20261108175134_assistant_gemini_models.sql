-- Tried against the live API on 2026-11-09 with a free key: gemini-2.5-flash-lite answers 404 (closed to new users),
-- gemini-3.8-flash took 49 to 235 seconds and sometimes 503, and gemini-3.5-flash-lite answered in under 2 seconds.
-- So Flash-Lite 3.5 becomes the default, 3.8 Flash stays listed but off, and the closed model goes.

update public.assistant_models set is_default = false where is_default;

update public.assistant_models
set id = 'gemini-3.5-flash-lite', label = 'Gemini 3.5 Flash-Lite', input_usd = 0.30, output_usd = 2.50, position = 1, is_default = true, enabled = true, access = 'everyone'
where id = 'gemini-2.5-flash-lite';

update public.assistant_models set position = 2, enabled = false where id = 'gemini-3.8-flash';
