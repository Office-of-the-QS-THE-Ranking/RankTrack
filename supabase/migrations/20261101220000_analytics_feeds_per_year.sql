-- GreenMetric ED4 asks for a yearly average over three years, ED5 and ED8 for counts per year: the activity
-- register's suggestions now count the latest academic year (or the average), not every year in the window.

update public.analytics_indicators set feeds = $j$[{"kind": "activities", "kinds": ["Advocacy", "Event"], "per": "average", "label": "Activity register: advocacy and events"}]$j$::jsonb where edition_id = 'greenmetric-2026' and code = '6.11';
update public.analytics_indicators set feeds = $j$[{"kind": "activities", "kinds": ["Service learning", "Community development", "Advocacy"], "per": "year", "label": "Activity register"}]$j$::jsonb where edition_id = 'greenmetric-2026' and code = '6.12';
update public.analytics_indicators set feeds = $j$[{"kind": "activities", "kinds": ["Community development", "Service learning"], "per": "year", "label": "Activity register: community development and service learning"}]$j$::jsonb where edition_id = 'greenmetric-2026' and code = '6.15';
