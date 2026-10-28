-- 20261028240000_comdev_esign_tick.sql was first applied without moving the store's version, so running servers
-- kept the typed signatures in memory. Servers reload the store when its version moves (a second move is harmless).
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
