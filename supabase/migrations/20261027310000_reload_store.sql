-- The Hub's servers keep the store in memory and reload it only when hub_meta.version moves (store.ts refresh).
-- 20261027200000_colleges_only and 20261027300000_four_roles_sign_in_gate changed the tables directly without
-- moving it, so servers kept showing departments, programs and the old roles. A migration that edits store
-- tables must move the version too (tests/guards.test.ts checks).
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
