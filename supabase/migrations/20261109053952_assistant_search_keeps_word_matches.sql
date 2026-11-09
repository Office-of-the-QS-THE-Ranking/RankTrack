-- assistant_search cut its results to the nearest p_limit by similarity, which dropped the very passages the word search
-- was added to catch (names like "THE Impact" embed poorly), and let passages a person can't read use up the places.
-- It now returns both lists whole: pickPassages in the app applies the thresholds, levels, permissions and final limit.
create or replace function public.assistant_search(p_embedding extensions.vector(1024), p_query text, p_levels text[], p_limit integer default 12)
returns table (
  id text, source_id text, title text, href text, content text, level text, module text, action text, unit_id text,
  similarity double precision, text_match boolean
)
language sql
stable
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('english', p_query) as t),
  near as (
    select c.id from public.assistant_chunks c
    where c.level = any (p_levels)
    order by c.embedding operator(extensions.<=>) p_embedding
    limit p_limit * 2
  ),
  words as (
    select c.id from public.assistant_chunks c, q
    where c.level = any (p_levels) and c.fts @@ q.t
    order by ts_rank(c.fts, q.t) desc
    limit p_limit
  )
  select c.id, c.source_id, c.title, c.href, c.content, c.level, c.module, c.action, c.unit_id,
    1 - (c.embedding operator(extensions.<=>) p_embedding) as similarity,
    c.fts @@ (select t from q) as text_match
  from public.assistant_chunks c
  where c.id in (select near.id from near union select words.id from words)
  order by similarity desc;
$$;

revoke all on function public.assistant_search(extensions.vector, text, text[], integer) from public, anon, authenticated;
grant execute on function public.assistant_search(extensions.vector, text, text[], integer) to service_role;
