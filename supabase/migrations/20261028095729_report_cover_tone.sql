-- Saved cover palette for report previews, listings and public report pages.
-- Null preserves the existing automatic color chosen from the report type.
alter table public.documents
  add column cover_tone text
  check (cover_tone in ('night', 'gold', 'stone', 'onyx'));
