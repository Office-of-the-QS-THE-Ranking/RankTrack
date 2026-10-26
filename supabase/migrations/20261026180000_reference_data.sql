-- The Hub's reference data, moved out of the source code: the UST directory, the ranking frameworks the Office
-- tracks (families, indicators, dimensions, UST's recorded results), the dictionary, the calendar, the Office's
-- profile, the public website's pictures and copy, the SDGs and the short lists forms offer. The Hub reads it
-- with the project's secret key (src/lib/governance/server/reference.ts), at most once a minute, and the Office
-- edits it here. Pictures live in the R2 public bucket; media_assets names each object and where it came from.
-- Like the governance store, nothing reaches these tables through the public API.

-- ---------- Directory ----------

-- The University's directory as supplied in ust_directory.csv. The live Organizational Directory (the governance
-- store's units) is seeded from it and matched against it; editing a unit in the Hub never changes this table.
create table public.unit_directory (
  key text primary key check (key ~ '^[A-Z][0-9]{2,3}$'),
  parent_key text references public.unit_directory (key) deferrable initially deferred,
  category text not null check (category in ('College/Faculty', 'Basic Education', 'Program/Department', 'Administrative Office', 'Student Government')),
  name text not null,
  emails text[] not null default '{}',
  position integer not null unique
);

-- ---------- Pictures ----------

create table public.media_assets (
  key text primary key check (key ~ '^[a-z0-9-]+$'),
  -- Object key in the R2 public bucket (R2_PUBLIC_BUCKET), served from R2_PUBLIC_URL.
  path text not null unique,
  kind text not null check (kind in ('photo', 'sdg-icon')),
  alt text not null default '',
  -- CSS object-position for crops.
  focus text,
  width integer check (width > 0),
  height integer check (height > 0),
  bytes integer check (bytes > 0),
  -- Provenance and the credit line the footer shows.
  title text,
  creator text,
  creator_url text,
  created_on date,
  license text,
  license_code text,
  license_url text,
  credit_required boolean not null default false,
  source_page text,
  source_url text,
  via text,
  credit text,
  notes text,
  position integer not null
);

-- ---------- Ranking frameworks ----------

create table public.ranking_families (
  key text primary key check (key ~ '^[A-Z]+$'),
  name text not null,
  -- The ranking body (System Configuration) whose switch governs the family's rankings.
  body text not null,
  -- Accent tuned so neighbouring families stay apart for colour-blind readers; always shown beside the name.
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  soft text not null check (soft ~ '^#[0-9A-Fa-f]{6}$'),
  -- CSS background for the family's band: the colour, or a gradient.
  band text not null,
  position integer not null unique
);

create table public.ranking_dimensions (
  name text primary key,
  note text not null,
  position integer not null unique
);

create table public.ranking_frameworks (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  family text not null references public.ranking_families (key),
  -- The Rankings menu groups frameworks under these labels, in the order of their first framework.
  group_label text not null,
  position integer not null unique,
  short text not null unique,
  name text not null,
  message text not null default '',
  interpretation text not null default '',
  measures text not null default '',
  emphasis text[] not null default '{}',
  menu text[] not null default '{}',
  -- Which ranking_dimensions the framework measures.
  dimensions text[] not null default '{}',
  data_sources text[] not null default '{}',
  common_errors text[] not null default '{}',
  methodology_changes text not null default '',
  reporting_period text not null default '',
  -- The data collection deadline new cycles start from; System Configuration holds the confirmed one.
  default_deadline date not null,
  public_note text not null default '',
  photo text references public.media_assets (key),
  -- UST's results, recorded by the Office as each edition is published.
  current_result text not null default '',
  previous_result text not null default '',
  target_result text not null default '',
  direction text not null default 'none' check (direction in ('up', 'down', 'steady', 'new', 'none')),
  strengths text[] not null default '{}',
  gaps text[] not null default '{}',
  opportunities text[] not null default '{}'
);

create table public.ranking_results (
  ranking_slug text not null references public.ranking_frameworks (slug) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  -- Best (lowest) and worst (highest) rank of the band.
  best integer,
  worst integer,
  label text not null,
  primary key (ranking_slug, year)
);

create table public.ranking_indicators (
  ranking_slug text not null references public.ranking_frameworks (slug) on delete cascade,
  position integer not null,
  name text not null,
  weight text not null,
  owner text not null default '',
  definition text not null default '',
  formula text not null default '',
  unit text,
  -- QS Sustainability lenses and lead offices; GreenMetric's reported metrics.
  lenses text[] not null default '{}',
  offices text[] not null default '{}',
  metrics text[] not null default '{}',
  primary key (ranking_slug, position),
  unique (ranking_slug, name)
);

-- ---------- Dictionary and calendar ----------

create table public.dictionary_terms (
  term text primary key,
  definition text not null,
  position integer not null unique
);

create table public.dictionary_links (
  term text not null references public.dictionary_terms (term) on delete cascade on update cascade,
  position integer not null,
  ranking text not null,
  indicator text not null,
  primary key (term, position)
);

create table public.calendar_items (
  position integer primary key,
  month text not null check (month in ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')),
  item text not null
);

-- ---------- The Office ----------

create table public.office_profile (
  id smallint primary key default 1 check (id = 1),
  name text not null,
  reports_to text not null,
  profile_date text not null,
  location text not null,
  landmark text not null,
  phone text not null,
  vision text not null,
  mission text not null,
  summary text not null
);

-- Functions, objectives, deliverables, work plan, team and portfolio, in the order the About page lists them.
create table public.office_entries (
  section text not null check (section in ('function', 'objective', 'deliverable', 'workplan', 'team', 'portfolio')),
  position integer not null,
  title text not null,
  body text not null default '',
  -- Team: the person in the role. Work plan: who carries it out, and when.
  person text,
  owners text,
  timing text,
  -- Portfolio: the framework's page on this site or on the ranking body's.
  href text,
  primary key (section, position)
);

-- ---------- Public website ----------

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  -- The ranking edition the public website and dashboards report.
  latest_edition integer not null check (latest_edition between 2000 and 2100)
);

-- The six stages a contribution passes through, as the home page tells them.
create table public.site_process_stages (
  position integer primary key,
  name text not null,
  body text not null,
  count_label text not null,
  photo text not null references public.media_assets (key)
);

create table public.sdg_goals (
  number integer primary key check (number between 1 and 17),
  name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text references public.media_assets (key)
);

-- Short lists the forms and dashboards offer. `note` and `color` are used where a list needs them.
create table public.reference_lists (
  list text not null check (list in (
    'impact-theme', 'wuri-category', 'report-type', 'subject-quadrant', 'subject-area',
    'impact-ladder', 'contribution-pipeline', 'wuri-pipeline', 'research-funnel'
  )),
  position integer not null,
  value text not null,
  note text,
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  primary key (list, position),
  unique (list, value)
);

-- ---------- Development ----------

-- Developer settings (src/lib/governance/server/dev-access.ts): the access profile one Google address receives at
-- its next sign-in. Only `next dev` reads or writes it.
create table public.hub_dev_access (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null,
  email text not null,
  role_ids text[] not null default '{}',
  unit_id text not null,
  scope text not null check (scope in ('university', 'unit')),
  super_admin boolean not null,
  updated_at timestamptz not null default now()
);

-- ---------- Unit arms move to R2 ----------

-- file_path is now the object key in the R2 public bucket (was a path under public/).
update public.unit_emblems set file_path = 'units/' || lower(unit_key) || '.webp', updated_at = now();
alter table public.unit_emblems add constraint unit_emblems_file_path_key_format check (file_path ~ '^units/[a-z0-9]+\.(webp|png|jpg)$');
comment on column public.unit_emblems.file_path is 'Object key in the R2 public bucket; sha256 is of that object.';

-- ---------- Access ----------

alter table public.unit_directory enable row level security;
alter table public.media_assets enable row level security;
alter table public.ranking_families enable row level security;
alter table public.ranking_dimensions enable row level security;
alter table public.ranking_frameworks enable row level security;
alter table public.ranking_results enable row level security;
alter table public.ranking_indicators enable row level security;
alter table public.dictionary_terms enable row level security;
alter table public.dictionary_links enable row level security;
alter table public.calendar_items enable row level security;
alter table public.office_profile enable row level security;
alter table public.office_entries enable row level security;
alter table public.site_settings enable row level security;
alter table public.site_process_stages enable row level security;
alter table public.sdg_goals enable row level security;
alter table public.reference_lists enable row level security;
alter table public.hub_dev_access enable row level security;

revoke all on table
  public.unit_directory, public.media_assets, public.ranking_families, public.ranking_dimensions,
  public.ranking_frameworks, public.ranking_results, public.ranking_indicators, public.dictionary_terms,
  public.dictionary_links, public.calendar_items, public.office_profile, public.office_entries,
  public.site_settings, public.site_process_stages, public.sdg_goals, public.reference_lists, public.hub_dev_access
from anon, authenticated;

-- ---------- Rows ----------
insert into public.unit_directory (key, parent_key, category, name, emails, position) values
  ('C01', null, 'College/Faculty', 'Faculty of Sacred Theology', array['ecclesiastical.office@ust.edu.ph'], 1),
  ('C02', null, 'College/Faculty', 'Faculty of Philosophy', array['ecclesiastical.office@ust.edu.ph'], 2),
  ('C03', null, 'College/Faculty', 'Faculty of Canon Law', array['ecclesiastical.office@ust.edu.ph'], 3),
  ('C04', null, 'College/Faculty', 'Faculty of Civil Law', array['civillaw@ust.edu.ph'], 4),
  ('C05', null, 'College/Faculty', 'Faculty of Medicine and Surgery', array['fms@ust.edu.ph'], 5),
  ('C06', null, 'College/Faculty', 'Faculty of Pharmacy', array['pharmacy@ust.edu.ph'], 6),
  ('C07', null, 'College/Faculty', 'Faculty of Arts and Letters', array['office.ab@ust.edu.ph'], 7),
  ('C08', null, 'College/Faculty', 'Faculty of Engineering', array['engineering.office@ust.edu.ph'], 8),
  ('C09', null, 'College/Faculty', 'College of Education', array['education@ust.edu.ph'], 9),
  ('C10', null, 'College/Faculty', 'College of Science', array['ustscience@ust.edu.ph'], 10),
  ('C11', null, 'College/Faculty', 'College of Architecture', array['office.archi@ust.edu.ph'], 11),
  ('C12', null, 'College/Faculty', 'College of Commerce and Business Administration', array['office.commerce@ust.edu.ph'], 12),
  ('C13', null, 'College/Faculty', 'Graduate School', array['graduateschool@ust.edu.ph'], 13),
  ('C14', null, 'College/Faculty', 'Conservatory of Music', array['music@ust.edu.ph'], 14),
  ('C15', null, 'College/Faculty', 'College of Nursing', array['nursing@ust.edu.ph', 'nursing.office@ust.edu.ph'], 15),
  ('C16', null, 'College/Faculty', 'College of Rehabilitation Sciences', array['office.crs@ust.edu.ph'], 16),
  ('C17', null, 'College/Faculty', 'College of Fine Arts and Design', array['cfad@ust.edu.ph'], 17),
  ('C18', null, 'College/Faculty', 'Institute of Physical Education and Athletics', array['ipea@ust.edu.ph'], 18),
  ('C19', null, 'College/Faculty', 'Alfredo M. Velayo College of Accountancy', array['college.accountancy@ust.edu.ph'], 19),
  ('C20', null, 'College/Faculty', 'College of Tourism and Hospitality Management', array['cthm@ust.edu.ph'], 20),
  ('C21', null, 'College/Faculty', 'College of Information and Computing Sciences', array['cics@ust.edu.ph'], 21),
  ('C22', null, 'College/Faculty', 'Graduate School of Law', array['gslaw@ust.edu.ph'], 22),
  ('C23', null, 'Basic Education', 'Senior High School', array['office.shs@ust.edu.ph'], 23),
  ('C24', null, 'Basic Education', 'Junior High School', array['jhs@ust.edu.ph'], 24),
  ('C25', null, 'Basic Education', 'Education High School', array['ehs@ust.edu.ph'], 25),
  ('P001', 'C06', 'Program/Department', 'Department of Biochemistry', array['biochem-pharmacy@ust.edu.ph'], 26),
  ('P002', 'C06', 'Program/Department', 'Department of Medical Technology', array['medtech-pharmacy@ust.edu.ph'], 27),
  ('P003', 'C07', 'Program/Department', 'Department of English', array['english.department@ust.edu.ph'], 28),
  ('P004', 'C07', 'Program/Department', 'Department of Journalism', array['journalism.ab@ust.edu.ph'], 29),
  ('P005', 'C07', 'Program/Department', 'Department of Literature', array['literature-ab@ust.edu.ph'], 30),
  ('P006', 'C07', 'Program/Department', 'Department of Modern Languages', array['modernlanguages-ab@ust.edu.ph'], 31),
  ('P007', 'C07', 'Program/Department', 'Department of Philosophy', array['philosophy-ab@ust.edu.ph'], 32),
  ('P008', 'C07', 'Program/Department', 'Department of Political Science', array['polsci-ab@ust.edu.ph'], 33),
  ('P009', 'C07', 'Program/Department', 'Department of Sociology', array['socio-ab@ust.edu.ph'], 34),
  ('P010', 'C08', 'Program/Department', 'Department of Chemical Engineering', array['chemical.eng@ust.edu.ph'], 35),
  ('P011', 'C08', 'Program/Department', 'Department of Civil Engineering', array['civil.eng@ust.edu.ph'], 36),
  ('P012', 'C08', 'Program/Department', 'Department of Electrical Engineering', array['electrical.eng@ust.edu.ph'], 37),
  ('P013', 'C08', 'Program/Department', 'Department of Electronics Engineering', array['ece.eng@ust.edu.ph'], 38),
  ('P014', 'C08', 'Program/Department', 'Department of Industrial Engineering', array['industrial.eng@ust.edu.ph'], 39),
  ('P015', 'C08', 'Program/Department', 'Department of Mechanical Engineering', array['me.eng@ust.edu.ph'], 40),
  ('P016', 'C09', 'Program/Department', 'Department of Filipino', array['fil.educ@ust.edu.ph'], 41),
  ('P017', 'C10', 'Program/Department', 'Department of Biological Sciences', array['biology.sci@ust.edu.ph'], 42),
  ('P018', 'C10', 'Program/Department', 'Department of Chemistry', array['chemistry.sci@ust.edu.ph'], 43),
  ('P019', 'C10', 'Program/Department', 'Department of Psychology', array['psychology.sci@ust.edu.ph'], 44),
  ('P020', 'C11', 'Program/Department', 'BS Architecture (Admissions)', array['bs.architecture.admission@ust.edu.ph'], 45),
  ('P021', 'C21', 'Program/Department', 'Department of Information Systems', array['is-chair.cics@ust.edu.ph', 'ISenrollAdvise.cics@ust.edu.ph'], 46),
  ('P022', 'C22', 'Program/Department', 'Graduate School of Law Admissions', array['admissions.gslaw@ust.edu.ph'], 47),
  ('A01', null, 'Administrative Office', 'Office of the Rector', array['rector.office@ust.edu.ph'], 48),
  ('A02', null, 'Administrative Office', 'Office of the Vice-Rector', array['ovr.office@ust.edu.ph'], 49),
  ('A03', null, 'Administrative Office', 'Office of the Vice-Rector for Academic Affairs', array['ovraa@ust.edu.ph'], 50),
  ('A04', null, 'Administrative Office', 'Office of the Vice-Rector for Research and Innovation', array['ovrri@ust.edu.ph'], 51),
  ('A05', null, 'Administrative Office', 'Office of the Vice-Rector for Religious Affairs', array['religiousaffairs@ust.edu.ph'], 52),
  ('A06', null, 'Administrative Office', 'Office of the Vice-Rector for Finance', array['vrfinance@ust.edu.ph'], 53),
  ('A07', 'A06', 'Administrative Office', 'Finance - Payroll', array['payroll@ust.edu.ph'], 54),
  ('A08', 'A06', 'Administrative Office', 'Finance - Student Accounts', array['studentaccounts@ust.edu.ph'], 55),
  ('A09', 'A06', 'Administrative Office', 'Finance - Treasury Department', array['treasury@ust.edu.ph'], 56),
  ('A10', null, 'Administrative Office', 'Office of the Secretary-General', array['secgen@ust.edu.ph'], 57),
  ('A11', null, 'Administrative Office', 'Office for Student Affairs', array['osa@ust.edu.ph'], 58),
  ('A12', null, 'Administrative Office', 'Office of the Registrar', array['registrar.office@ust.edu.ph'], 59),
  ('A13', null, 'Administrative Office', 'Office for Admissions', array['ofad@ust.edu.ph'], 60),
  ('A14', null, 'Administrative Office', 'Office of Alumni Relations', array['alumnirelations@ust.edu.ph'], 61),
  ('A15', null, 'Administrative Office', 'Archives of the University of Santo Tomas', array['archives@ust.edu.ph'], 62),
  ('A16', null, 'Administrative Office', 'Boletín Eclesiástico de Filipinas', array['boletin.eclesiastico@ust.edu.ph'], 63),
  ('A17', null, 'Administrative Office', 'Center for Campus Ministry', array['campus.ministry@ust.edu.ph'], 64),
  ('A18', null, 'Administrative Office', 'Communications Bureau', array['cb.communications@ust.edu.ph'], 65),
  ('A19', null, 'Administrative Office', 'Community Development (SIMBAHAYAN)', array['simbahayan@ust.edu.ph', 'simbahayan.office@ust.edu.ph'], 66),
  ('A20', null, 'Administrative Office', 'National Service Training Program (NSTP)', array['office.nstp@ust.edu.ph'], 67),
  ('A21', null, 'Administrative Office', 'Career Services and Placement Office', array['careerservices.placement@ust.edu.ph'], 68),
  ('A22', null, 'Administrative Office', 'Guidance and Counseling Center', array['counseling.career.center@ust.edu.ph', 'ccc.careerservices@ust.edu.ph'], 69),
  ('A23', null, 'Administrative Office', 'Santo Tomas e-Service Providers (STePs) - Network Operations Center', array['steps@ust.edu.ph'], 70),
  ('A24', 'A23', 'Administrative Office', 'STePs - Software Development and Applications Office', array['stepshelpdesk@ust.edu.ph'], 71),
  ('A25', 'A23', 'Administrative Office', 'STePs - ID Room', array['idroom@ust.edu.ph'], 72),
  ('A26', null, 'Administrative Office', 'Educational Technology Center', array['edtech.center@ust.edu.ph'], 73),
  ('A27', null, 'Administrative Office', 'Facilities Management Office', array['facilities.management.office@ust.edu.ph'], 74),
  ('A28', null, 'Administrative Office', 'Office for Faculty Evaluation and Development', array['ofed.office@ust.edu.ph'], 75),
  ('A29', null, 'Administrative Office', 'Office for Grants, Endowments, and Partnerships in Higher Education', array['grants@ust.edu.ph'], 76),
  ('A30', null, 'Administrative Office', 'Health Service', array['healthservice@ust.edu.ph'], 77),
  ('A31', null, 'Administrative Office', 'Human Resource Department', array['hrd.office@ust.edu.ph', 'hrd@ust.edu.ph'], 78),
  ('A32', null, 'Administrative Office', 'Office of Information and Communications Technology', array['office.ict@ust.edu.ph'], 79),
  ('A33', null, 'Administrative Office', 'TOMASinno Center', array['tomasinnocenter@ust.edu.ph'], 80),
  ('A34', null, 'Administrative Office', 'Center for Innovative Teaching and Educational Delivery (CITED)', array['cited.office@ust.edu.ph'], 81),
  ('A35', null, 'Administrative Office', 'Office of International Relations and Programs', array['international@ust.edu.ph'], 82),
  ('A36', null, 'Administrative Office', 'Laboratory Equipment and Supplies Office (LESO)', array['leso@ust.edu.ph', 'isc.leso@ust.edu.ph'], 83),
  ('A37', null, 'Administrative Office', 'Miguel de Benavides Library', array['library@ust.edu.ph'], 84),
  ('A38', null, 'Administrative Office', 'UST Museum', array['museum@ust.edu.ph'], 85),
  ('A39', null, 'Administrative Office', 'Philippiniana Sacra', array['philippiniana.sacra@ust.edu.ph'], 86),
  ('A40', null, 'Administrative Office', 'Office of Planning and Quality Management', array['opqm@ust.edu.ph', 'iso-opqm@ust.edu.ph'], 87),
  ('A41', null, 'Administrative Office', 'Office of the Property Custodian', array['propertycustodian.office@ust.edu.ph'], 88),
  ('A42', null, 'Administrative Office', 'Office of Public Affairs', array['opa@ust.edu.ph'], 89),
  ('A43', null, 'Administrative Office', 'Publishing House', array['publishing.bookstore@ust.edu.ph'], 90),
  ('A44', null, 'Administrative Office', 'Purchasing Office', array['purchasing@ust.edu.ph'], 91),
  ('A45', null, 'Administrative Office', 'Office of QS/THE Rankings', array['office.theranking@ust.edu.ph'], 92),
  ('A46', null, 'Administrative Office', 'Institute of Religion', array['institute.religion@ust.edu.ph'], 93),
  ('S01', 'A11', 'Student Government', 'UST Central Student Council', array['csc@ust.edu.ph'], 94),
  ('S02', 'A11', 'Student Government', 'Student Organizations Coordinating Council (SOCC)', array['socc@ust.edu.ph'], 95),
  ('S03', 'A11', 'Student Government', 'UST Central Commission on Elections (COMELEC)', array['comelec@ust.edu.ph'], 96);

insert into public.media_assets (key, path, kind, alt, focus, width, height, bytes, title, creator, creator_url, created_on, license, license_code, license_url, credit_required, source_page, source_url, via, credit, notes, position) values
  ('hero', 'site/photos/main-building-blue-hour.jpg', 'photo', 'The Main Building of the University of Santo Tomas, lit at dusk', '50% 50%', 2560, 1707, 1063526, '400 Year old Beauty', 'Tristantamayo', null, '2012-08-17', 'CC BY-SA 3.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/3.0', true, 'https://commons.wikimedia.org/wiki/File:400_Year_old_Beauty.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/400_Year_old_Beauty.jpg/3840px-400_Year_old_Beauty.jpg', 'Wikimedia Commons', '"400 Year old Beauty" by Tristantamayo, CC BY-SA 3.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 1),
  ('day', 'site/photos/main-building-day.jpg', 'photo', 'The clock tower of the Main Building framed by acacia branches', '50% 30%', 1920, 1483, 962292, 'UST Main Building, Apr 2024', 'Ralff Nestor Nacor', null, '2024-04-07', 'CC BY-SA 4.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/4.0', true, 'https://commons.wikimedia.org/wiki/File:UST_Main_Building,_Apr_2024.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c0/UST_Main_Building%2C_Apr_2024.jpg/1920px-UST_Main_Building%2C_Apr_2024.jpg', 'Wikimedia Commons', '"UST Main Building, Apr 2024" by Ralff Nestor Nacor, CC BY-SA 4.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 2),
  ('aerial', 'site/photos/campus-aerial.jpg', 'photo', 'The Main Building among the trees of the España campus, with Manila beyond', '50% 50%', 1920, 1440, 945940, 'Pic geo photos - ph=mm=manila=sampaloc=españa blvd.=university of santo tomas (ust)=main bldg. - aerial shot from univ. tower -philippines--2015-0622--ls-', 'Patrick Roque', null, '2015-06-22', 'CC BY-SA 3.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/3.0', true, 'https://commons.wikimedia.org/wiki/File:Pic_geo_photos_-_ph%3Dmm%3Dmanila%3Dsampaloc%3Despa%C3%B1a_blvd.%3Duniversity_of_santo_tomas_(ust)%3Dmain_bldg._-_aerial_shot_from_univ._tower_-philippines--2015-0622--ls-.JPG', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/78/Pic_geo_photos_-_ph%3Dmm%3Dmanila%3Dsampaloc%3Despa%C3%B1a_blvd.%3Duniversity_of_santo_tomas_%28ust%29%3Dmain_bldg._-_aerial_shot_from_univ._tower_-philippines--2015-0622--ls-.JPG/1920px-Pic_geo_photos_-_ph%3Dmm%3Dmanila%3Dsampaloc%3Despa%C3%B1a_blvd.%3Duniversity_of_santo_tomas_%28ust%29%3Dmain_bldg._-_aerial_shot_from_univ._tower_-philippines--2015-0622--ls-.JPG', 'Wikimedia Commons', '"Pic geo photos - ph=mm=manila=sampaloc=españa blvd.=university of santo tomas (ust)=main…" by Patrick Roque, CC BY-SA 3.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 3),
  ('field', 'site/photos/field-students.jpg', 'photo', 'Students crossing the open field in front of the Main Building', '40% 50%', 1920, 1440, 625167, 'UST Main Building from the field', 'Ramiltibayan', null, '2007-06-16', 'CC BY-SA 4.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/4.0', true, 'https://commons.wikimedia.org/wiki/File:UST_Main_Building_from_the_field.JPG', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/72/UST_Main_Building_from_the_field.JPG/1920px-UST_Main_Building_from_the_field.JPG', 'Wikimedia Commons', '"UST Main Building from the field" by Ramiltibayan, CC BY-SA 4.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 4),
  ('arch', 'site/photos/arch-of-centuries.jpg', 'photo', 'The Arch of the Centuries, the gate brought from the first campus in Intramuros', '50% 45%', 1920, 1442, 1354735, 'Arch of the Centuries, University of Santo Tomas, Manila', 'Arius1998', 'https://commons.wikimedia.org/wiki/User:Arius1998', null, 'CC BY-SA 4.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/4.0/', true, 'https://commons.wikimedia.org/w/index.php?curid=177245884', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/65/Arch_of_the_Centuries%2C_University_of_Santo_Tomas%2C_Manila.jpg/1920px-Arch_of_the_Centuries%2C_University_of_Santo_Tomas%2C_Manila.jpg', 'Wikimedia Commons', '"Arch of the Centuries, University of Santo Tomas, Manila" by Arius1998, CC BY-SA 4.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 5),
  ('arch-aerial', 'site/photos/arch-aerial.jpg', 'photo', 'The Arch of the Centuries among the campus gardens, seen from above', '50% 50%', 1920, 1440, 836460, 'Pic geo photos - ph=mm=manila=sampaloc=españa blvd.=university of santo tomas (ust)=arch of the centuries - aerial shot from univ. tower -philippines--2015-0622--ls-', 'Patrick Roque', null, null, 'CC BY-SA 3.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/3.0/', true, 'https://commons.wikimedia.org/w/index.php?curid=89317683', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Pic_geo_photos_-_ph%3Dmm%3Dmanila%3Dsampaloc%3Despa%C3%B1a_blvd.%3Duniversity_of_santo_tomas_%28ust%29%3Darch_of_the_centuries_-_aerial_shot_from_univ._tower_-philippines--2015-0622--ls-.jpg/1920px-thumbnail.jpg', 'Wikimedia Commons', '"Pic geo photos - ph=mm=manila=sampaloc=españa blvd.=university of santo tomas (ust)=arch…" by Patrick Roque, CC BY-SA 3.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 6),
  ('benavides', 'site/photos/benavides.jpg', 'photo', 'The monument to Miguel de Benavides, founder of the University, on the España campus', '50% 22%', 1920, 2550, 1797107, 'Miguel de Benavides Monument, UST, Apr 2024', 'Ralff Nestor Nacor', 'https://commons.wikimedia.org/wiki/User:Ralffralff', null, 'CC BY-SA 4.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/4.0/', true, 'https://commons.wikimedia.org/w/index.php?curid=147191792', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c0/Miguel_de_Benavides_Monument%2C_UST%2C_Apr_2024.jpg/1920px-Miguel_de_Benavides_Monument%2C_UST%2C_Apr_2024.jpg', 'Wikimedia Commons', '"Miguel de Benavides Monument, UST, Apr 2024" by Ralff Nestor Nacor, CC BY-SA 4.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 7),
  ('carillon', 'site/photos/carillon.jpg', 'photo', 'The UST Carillon beside a white colonnade on the España campus', '60% 50%', 1920, 1440, 874981, 'University of Santo Tomas UST Carillon', 'Pampi1010', null, '2024-03-24', 'CC BY-SA 4.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/4.0', true, 'https://commons.wikimedia.org/wiki/File:University_of_Santo_Tomas_UST_Carillon.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/University_of_Santo_Tomas_UST_Carillon.jpg/1920px-University_of_Santo_Tomas_UST_Carillon.jpg', 'Wikimedia Commons', '"University of Santo Tomas UST Carillon" by Pampi1010, CC BY-SA 4.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 8),
  ('library', 'site/photos/library-1800s.jpg', 'photo', 'Readers in the University library in the nineteenth century', '50% 50%', 1920, 1334, 374904, 'Library University of Santo Tomas Manila Philippines', 'Francinehihao', 'https://commons.wikimedia.org/w/index.php?title=User:Francinehihao&action=edit&redlink=1', null, 'CC0', 'cc0', 'https://creativecommons.org/publicdomain/zero/1.0/deed.en/', false, 'https://commons.wikimedia.org/w/index.php?curid=164858508', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/Library_University_of_Santo_Tomas_Manila_Philippines.jpg/1920px-Library_University_of_Santo_Tomas_Manila_Philippines.jpg', 'Wikimedia Commons', '"Library University of Santo Tomas Manila Philippines" by Francinehihao, CC0, via Wikimedia Commons', null, 9),
  ('courtyard', 'site/photos/courtyard-1800s.jpg', 'photo', 'Students around the fountain of the main courtyard in the nineteenth century', '50% 50%', 1920, 1331, 333377, 'Main Courtyard University of Santo Tomas Manila Philippines 1800''s', 'Francinehihao', 'https://commons.wikimedia.org/w/index.php?title=User:Francinehihao&action=edit&redlink=1', null, 'CC0', 'cc0', 'https://creativecommons.org/publicdomain/zero/1.0/deed.en/', false, 'https://commons.wikimedia.org/w/index.php?curid=164858250', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/05/Main_Courtyard_University_of_Santo_Tomas_Manila_Philippines_1800%27s.jpg/1920px-Main_Courtyard_University_of_Santo_Tomas_Manila_Philippines_1800%27s.jpg', 'Wikimedia Commons', '"Main Courtyard University of Santo Tomas Manila Philippines 1800''s" by Francinehihao, CC0, via Wikimedia Commons', null, 10),
  ('cabinet', 'site/photos/physics-cabinet-1800s.jpg', 'photo', 'The University''s physics cabinet in the nineteenth century', '50% 50%', 1920, 1331, 375915, 'Physics Cabin University of Santo Tomas Manila Philippines', 'Francinehihao', 'https://commons.wikimedia.org/w/index.php?title=User:Francinehihao&action=edit&redlink=1', null, 'CC0', 'cc0', 'https://creativecommons.org/publicdomain/zero/1.0/deed.en/', false, 'https://commons.wikimedia.org/w/index.php?curid=164858432', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/Physics_Cabin_University_of_Santo_Tomas_Manila_Philippines.jpg/1920px-Physics_Cabin_University_of_Santo_Tomas_Manila_Philippines.jpg', 'Wikimedia Commons', '"Physics Cabin University of Santo Tomas Manila Philippines" by Francinehihao, CC0, via Wikimedia Commons', null, 11),
  ('hospital', 'site/photos/hospital-2024.jpg', 'photo', 'The UST Hospital on the España campus', '50% 50%', 1920, 1446, 527540, 'UST Hospital, Apr 2024', 'Ralff Nestor Nacor', null, '2024-04-07', 'CC BY-SA 4.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/4.0', true, 'https://commons.wikimedia.org/wiki/File:UST_Hospital,_Apr_2024.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/db/UST_Hospital%2C_Apr_2024.jpg/1920px-UST_Hospital%2C_Apr_2024.jpg', 'Wikimedia Commons', '"UST Hospital, Apr 2024" by Ralff Nestor Nacor, CC BY-SA 4.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 12),
  ('hospital1946', 'site/photos/hospital-1946.jpg', 'photo', 'The facade of the 1946 UST Hospital building', '50% 40%', 1600, 1200, 813513, '1946 University of Santo Tomas Hospital', 'Ramiltibayan', null, '2014-06-07', 'CC BY-SA 3.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/3.0', true, 'https://commons.wikimedia.org/wiki/File:1946_University_of_Santo_Tomas_Hospital.jpg', 'https://upload.wikimedia.org/wikipedia/commons/b/bf/1946_University_of_Santo_Tomas_Hospital.jpg', 'Wikimedia Commons', '"1946 University of Santo Tomas Hospital" by Ramiltibayan, CC BY-SA 3.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 13),
  ('night', 'site/photos/main-building-night.jpg', 'photo', 'Lamps reflected on a rain-wet walk behind the Main Building at night', '50% 60%', 1536, 1536, 756990, 'Behind the UST Main Building on a rainy night.', 'Siklab', null, '2012-09-30', 'CC BY-SA 3.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/3.0', true, 'https://commons.wikimedia.org/wiki/File:Behind_the_UST_Main_Building_on_a_rainy_night..jpg', 'https://upload.wikimedia.org/wikipedia/commons/1/18/Behind_the_UST_Main_Building_on_a_rainy_night..jpg', 'Wikimedia Commons', '"Behind the UST Main Building on a rainy night." by Siklab, CC BY-SA 3.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 14),
  ('festive', 'site/photos/main-building-2019.jpg', 'photo', 'The Main Building tower lit at night, with lanterns across the plaza', '50% 40%', 1920, 1440, 647026, 'UST Main Building, Manila (December 2019)', 'Ralff Nestor Nacor', null, '2019-12-11', 'CC BY-SA 4.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/4.0', true, 'https://commons.wikimedia.org/wiki/File:UST_Main_Building,_Manila_(December_2019).jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/42/UST_Main_Building%2C_Manila_%28December_2019%29.jpg/1920px-UST_Main_Building%2C_Manila_%28December_2019%29.jpg', 'Wikimedia Commons', '"UST Main Building, Manila (December 2019)" by Ralff Nestor Nacor, CC BY-SA 4.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 15),
  ('map', 'site/photos/intramuros-1898-map.jpg', 'photo', 'Map of Intramuros, the walled city of Manila, in 1898', '50% 50%', 1727, 1251, 2223330, 'Intramuros Manila 1898', 'Paolobon140', null, '2013-12-23', 'public domain', 'pd', 'https://creativecommons.org/publicdomain/mark/1.0/', false, 'https://commons.wikimedia.org/wiki/File:Intramuros_Manila_1898.jpg', 'https://upload.wikimedia.org/wikipedia/commons/4/45/Intramuros_Manila_1898.jpg', 'Wikimedia Commons', '"Intramuros Manila 1898" by Paolobon140, public domain, via Wikimedia Commons', null, 16),
  ('front', 'site/photos/main-building-front.jpg', 'photo', 'UST Main Building Exterior (Front)', null, 1232, 2048, 1132038, 'UST Main Building Exterior (Front)', 'Siklab', null, '2012-08-27', 'CC BY-SA 3.0', 'by-sa', 'https://creativecommons.org/licenses/by-sa/3.0', true, 'https://commons.wikimedia.org/wiki/File:UST_Main_Building_Exterior_(Front).jpg', 'https://upload.wikimedia.org/wikipedia/commons/3/3b/UST_Main_Building_Exterior_%28Front%29.jpg', 'Wikimedia Commons', '"UST Main Building Exterior (Front)" by Siklab, CC BY-SA 3.0, via Wikimedia Commons', 'Share-alike: an altered version (recoloured, combined with other pictures) must be shared under the same licence.', 17),
  ('sdg-01', 'site/sdg/goal-01.jpg', 'sdg-icon', 'SDG 1: No Poverty', null, 466, 466, 80247, 'SDG 1 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-01.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 18),
  ('sdg-02', 'site/sdg/goal-02.jpg', 'sdg-icon', 'SDG 2: Zero Hunger', null, 466, 466, 60460, 'SDG 2 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-02.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 19),
  ('sdg-03', 'site/sdg/goal-03.jpg', 'sdg-icon', 'SDG 3: Good Health and Well-being', null, 466, 466, 82134, 'SDG 3 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-03.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 20),
  ('sdg-04', 'site/sdg/goal-04.jpg', 'sdg-icon', 'SDG 4: Quality Education', null, 466, 466, 73321, 'SDG 4 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-04.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 21),
  ('sdg-05', 'site/sdg/goal-05.jpg', 'sdg-icon', 'SDG 5: Gender Equality', null, 466, 466, 71606, 'SDG 5 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-05.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 22),
  ('sdg-06', 'site/sdg/goal-06.jpg', 'sdg-icon', 'SDG 6: Clean Water and Sanitation', null, 466, 466, 81935, 'SDG 6 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-06.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 23),
  ('sdg-07', 'site/sdg/goal-07.jpg', 'sdg-icon', 'SDG 7: Affordable and Clean Energy', null, 466, 466, 95073, 'SDG 7 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-07.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 24),
  ('sdg-08', 'site/sdg/goal-08.jpg', 'sdg-icon', 'SDG 8: Decent Work and Economic Growth', null, 466, 466, 90530, 'SDG 8 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-08.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 25),
  ('sdg-09', 'site/sdg/goal-09.jpg', 'sdg-icon', 'SDG 9: Industry, Innovation and Infrastructure', null, 466, 466, 109563, 'SDG 9 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-09.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 26),
  ('sdg-10', 'site/sdg/goal-10.jpg', 'sdg-icon', 'SDG 10: Reduced Inequalities', null, 466, 466, 27913, 'SDG 10 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-10.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 27),
  ('sdg-11', 'site/sdg/goal-11.jpg', 'sdg-icon', 'SDG 11: Sustainable Cities and Communities', null, 466, 466, 105578, 'SDG 11 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-11.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 28),
  ('sdg-12', 'site/sdg/goal-12.jpg', 'sdg-icon', 'SDG 12: Responsible Consumption and Production', null, 466, 466, 106280, 'SDG 12 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-12.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 29),
  ('sdg-13', 'site/sdg/goal-13.jpg', 'sdg-icon', 'SDG 13: Climate Action', null, 466, 466, 72657, 'SDG 13 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-13.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 30),
  ('sdg-14', 'site/sdg/goal-14.jpg', 'sdg-icon', 'SDG 14: Life Below Water', null, 466, 466, 85779, 'SDG 14 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-14.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 31),
  ('sdg-15', 'site/sdg/goal-15.jpg', 'sdg-icon', 'SDG 15: Life on Land', null, 466, 466, 60297, 'SDG 15 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-15.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 32),
  ('sdg-16', 'site/sdg/goal-16.jpg', 'sdg-icon', 'SDG 16: Peace, Justice and Strong Institutions', null, 466, 466, 100035, 'SDG 16 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-16.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 33),
  ('sdg-17', 'site/sdg/goal-17.jpg', 'sdg-icon', 'SDG 17: Partnerships for the Goals', null, 466, 466, 100789, 'SDG 17 icon', 'United Nations', null, null, 'UN SDG communications guidelines', null, 'https://www.un.org/sustainabledevelopment/news/communications-material/', false, 'https://sdgs.un.org/goals', 'https://sdgs.un.org/sites/default/files/goals/E_SDG_Icons-17.jpg', 'United Nations', null, 'Official icon, unaltered: keep its square proportions, colours, symbol and lettering.', 34);

insert into public.ranking_families (key, name, body, color, soft, band, position) values
  ('THE', 'Times Higher Education', 'THE', '#C42A2A', '#FBEBEA', '#C42A2A', 1),
  ('QS', 'QS Quacquarelli Symonds', 'QS', '#5B3DC2', '#EFEBFA', '#5B3DC2', 2),
  ('QSS', 'QS Sustainability', 'QS', '#1A8DB3', '#E4F3F8', 'linear-gradient(90deg, #0E9488 0%, #1A8DB3 55%, #2E6BD1 100%)', 3),
  ('UI', 'UI GreenMetric', 'UI', '#1E6630', '#E6F0E8', '#1E6630', 4),
  ('WURI', 'World''s Universities with Real Impact', 'WURI', '#E2711D', '#FCEEE3', '#E2711D', 5);

insert into public.ranking_dimensions (name, note, position) values
  ('Research', 'Publications, citations and research income feed every framework, so one clean research record serves all eight.', 1),
  ('Teaching and learning', 'Staff ratios, doctorates and sustainability courses count in THE, QS, THE Impact and GreenMetric.', 2),
  ('Reputation', 'Academic and employer surveys carry the most weight in QS and THE, overall and by subject.', 3),
  ('Employability', 'Graduate outcomes count in QS overall, QS by Subject and the social side of QS Sustainability.', 4),
  ('Internationalization', 'International staff, students and co-authorship count in five frameworks.', 5),
  ('Sustainability', 'Environmental and social evidence is shared between THE Impact, QS Sustainability, GreenMetric and WURI.', 6),
  ('Social impact', 'Community outcomes support THE Impact SDGs, QS Sustainability and WURI social responsibility.', 7),
  ('Innovation', 'Industry income, patents and new programmes count in THE, THE Impact, GreenMetric and WURI.', 8),
  ('Campus operations', 'Energy, water, waste and transport data serve GreenMetric, QS Sustainability and THE Impact.', 9);

insert into public.ranking_frameworks (slug, family, group_label, position, short, name, message, interpretation, measures, emphasis, menu, dimensions, data_sources, common_errors, methodology_changes, reporting_period, default_deadline, public_note, photo, current_result, previous_result, target_result, direction, strengths, gaps, opportunities) values
  ('the-wur', 'THE', 'THE Rankings', 1, 'THE WUR', 'THE World University Rankings', 'Build research and international competitiveness', '', 'Teaching, research environment, research quality, industry and international outlook', array['Teaching', 'Research Environment', 'Research Quality', 'Industry', 'International Outlook'], array['THE WUR Overview', 'Teaching', 'Research Environment', 'Research Quality', 'Industry', 'International Outlook', 'Institutional Data', 'Action Plan'], array['Research', 'Teaching and learning', 'Reputation', 'Internationalization', 'Innovation'], array['THE institutional data portal (submitted by UST)', 'Elsevier Scopus bibliometrics', 'THE Academic Reputation Survey'], array['Staff counted by headcount instead of full-time equivalent', 'Income reported in the wrong financial year', 'Affiliation variants splitting UST outputs'], 'WUR 3.0 (from the 2024 edition) added research strength, excellence and influence metrics and rebalanced the five pillars.', 'Financial year 2025; publications 2020–2024', '2027-03-12', '', 'library', '', '', '', 'none', '{}', '{}', '{}'),
  ('the-impact', 'THE', 'THE Rankings', 2, 'THE Impact', 'THE Impact Ratings', 'Demonstrate mission-driven SDG impact', '', 'SDG evidence across research, stewardship, outreach and teaching', array['SDG 17', 'Research', 'Stewardship', 'Outreach', 'Teaching'], array['Impact Overview', 'SDG Dashboard', 'SDG 17', 'Research', 'Stewardship', 'Outreach', 'Teaching', 'Evidence', 'Impact Stories'], array['Research', 'Teaching and learning', 'Sustainability', 'Social impact', 'Innovation', 'Campus operations'], array['THE Impact data portal (submitted by UST)', 'Elsevier SDG-mapped publications', 'Public evidence URLs'], array['Policy documents without approval dates', 'Evidence outside the reporting year', 'Links behind a login'], 'Overall score uses SDG 17 plus the best three other SDGs; evidence must be publicly accessible where requested.', 'Calendar year 2025', '2026-11-20', '', 'hospital', '', '', '', 'none', '{}', '{}', '{}'),
  ('the-subject', 'THE', 'THE Rankings', 3, 'THE by Subject', 'THE WUR by Subject', 'Scale disciplinary strengths', '', 'Discipline portfolio, ranking thresholds and field-specific development', array['Global anchors', 'Emerging strengths', 'Development priorities', 'Monitor'], array['Subject Portfolio', 'Education Studies', 'Medical and Health', 'Life Sciences', 'Social Sciences', 'Emerging Subjects', 'Comparative Analysis', 'Development Plans'], array['Research', 'Teaching and learning', 'Reputation', 'Internationalization'], array['THE institutional data (subject splits)', 'Scopus subject classification'], array['Staff assigned to the wrong subject', 'Unmapped interdisciplinary outputs'], 'Subject tables follow the WUR 3.0 pillars with subject-specific weights.', 'Financial year 2025; publications 2020–2024', '2027-03-12', '', 'cabinet', '', '', '', 'none', '{}', '{}', '{}'),
  ('qs-wur', 'QS', 'QS Rankings', 4, 'QS WUR', 'QS World University Rankings', 'Strengthen research influence while sustaining reputation', '', 'Reputation, citations, employability and internationalization', array['Academic Reputation', 'Employer Reputation', 'Citations per Faculty', 'Faculty–Student Ratio', 'Employment Outcomes', 'International Faculty and Students', 'International Research Network', 'Sustainability'], array['QS WUR Overview', 'Academic Reputation', 'Employer Reputation', 'Research and Citations', 'Faculty and Students', 'Employment Outcomes', 'Internationalization', 'Sustainability', 'Action Plan'], array['Research', 'Teaching and learning', 'Reputation', 'Employability', 'Internationalization', 'Sustainability'], array['QS Hub institutional data (submitted by UST)', 'Elsevier Scopus', 'QS Academic and Employer surveys'], array['Faculty FTE counting researchers without teaching duties', 'Out-of-date employer contact lists', 'Student counts from the wrong census date'], 'From the 2024 edition: Employment Outcomes, International Research Network and Sustainability added; Academic Reputation and Faculty–Student Ratio weights reduced.', 'Academic year 2025–2026; citations 2020–2025', '2027-01-30', '', 'day', '', '', '', 'none', '{}', '{}', '{}'),
  ('qs-sustainability', 'QSS', 'QS Rankings', 5, 'QS Sustainability', 'QS Sustainability Rankings', 'Convert sustainability momentum into measurable outcomes', '', 'Environmental impact, social impact and governance', array['Environmental Impact', 'Social Impact', 'Governance'], array['Sustainability Overview', 'Environmental Impact', 'Social Impact', 'Governance', 'Research', 'Education', 'Operations', 'Evidence and Policies'], array['Research', 'Employability', 'Sustainability', 'Social impact', 'Campus operations'], array['QS Hub sustainability survey', 'Scopus sustainability research', 'Public policy documents'], array['Emissions without a stated method', 'Policies with no approval date'], 'Three categories: Environmental Impact, Social Impact and Governance, with Governance at 10%.', 'Calendar year 2025', '2027-02-15', '', 'night', '', '', '', 'none', '{}', '{}', '{}'),
  ('qs-subject', 'QS', 'QS Rankings', 6, 'QS by Subject', 'QS WUR by Subject', 'Develop globally competitive disciplines', '', 'Academic and employer reputation, citations, H-index and international research network by subject', array['Academic Reputation', 'Employer Reputation', 'Citations', 'H-index', 'International Research Network'], array['Subject Portfolio', 'Medicine', 'Modern Languages', 'Candidate Subjects', 'Reputation', 'Research Performance', 'International Networks', 'Development Plans'], array['Research', 'Reputation', 'Employability', 'Internationalization'], array['QS Academic and Employer surveys', 'Scopus subject data'], array['Outputs not mapped to the right subject area'], 'Five indicators with subject-specific weights; International Research Network added in recent editions.', 'Publications 2020–2025', '2027-01-30', '', 'hospital1946', '', '', '', 'none', '{}', '{}', '{}'),
  ('greenmetric', 'UI', 'UI GreenMetric', 7, 'UI GreenMetric', 'UI GreenMetric World University Rankings', 'Improve measurable campus sustainability', '', 'Campus operations across energy, waste, water and transportation', array['Setting and Infrastructure', 'Energy and Climate Change', 'Waste', 'Water', 'Transportation', 'Education and Research'], array['GreenMetric Overview', 'Setting and Infrastructure', 'Energy and Climate Change', 'Waste', 'Water', 'Transportation', 'Education and Research', 'Campus Sustainability Map'], array['Research', 'Teaching and learning', 'Sustainability', 'Innovation', 'Campus operations'], array['UI GreenMetric questionnaire (submitted by UST)', 'Facilities records', 'Public evidence'], array['Mixed units (litres and cubic metres)', 'Campus area excluding off-site campuses'], 'Six categories; evidence uploads required for most indicators.', 'Calendar year 2025', '2026-10-31', '', 'arch-aerial', '', '', '', 'none', '{}', '{}', '{}'),
  ('wuri', 'WURI', 'WURI', 8, 'WURI', 'World''s Universities with Real Impact', 'Discover and scale Thomasian innovation', '', 'Innovation pipeline, category fit, impact and scalability', array['Industrial Application', 'Value Creation', 'Social Responsibility', 'Student Mobility and Openness'], array['WURI Overview', 'Innovation Pipeline', 'WURI Categories', 'Submitted Projects', 'Recognized Innovations', 'Impact and Scalability', 'Mentorship and Engagement', 'Submit an Innovation'], array['Research', 'Internationalization', 'Sustainability', 'Social impact', 'Innovation'], array['WURI submission dossier', 'Programme evidence and outcome data'], array['Describing activities rather than outcomes', 'No evidence of replication elsewhere'], 'Programmes are evaluated by category within four dimensions.', 'Programmes active 2024–2026', '2027-01-12', '', 'carillon', '', '', '', 'none', '{}', '{}', '{}');

insert into public.ranking_indicators (ranking_slug, position, name, weight, owner, definition, formula, unit, lenses, offices, metrics) values
  ('the-wur', 1, 'Teaching', '29.5%', 'Office of the Vice-Rector for Academic Affairs', 'Learning environment: reputation, staff-to-student ratio, doctorate-to-bachelor ratio, doctorates awarded and institutional income.', 'Weighted composite of five metrics, normalised against all ranked institutions.', null, '{}', '{}', '{}'),
  ('the-wur', 2, 'Research Environment', '29%', 'Office of the Vice-Rector for Research and Innovation', 'Research reputation, research income and research productivity.', 'Reputation survey share, income per academic staff (PPP) and papers per staff.', null, '{}', '{}', '{}'),
  ('the-wur', 3, 'Research Quality', '30%', 'Research Center for the Natural and Applied Sciences', 'Citation impact, research strength, research excellence and research influence.', 'Field-weighted citation impact over five years of publications.', null, '{}', '{}', '{}'),
  ('the-wur', 4, 'International Outlook', '7.5%', 'Office of International Relations and Programs', 'International students, international staff, international co-authorship and studies without borders.', 'Proportions of international students and staff, and share of internationally co-authored papers.', null, '{}', '{}', '{}'),
  ('the-wur', 5, 'Industry', '4%', 'Office for Industry Linkages', 'Industry income and patents citing university research.', 'Research income from industry per academic staff, and patent citations.', null, '{}', '{}', '{}'),
  ('the-impact', 1, 'SDG 17 Partnerships for the Goals', '22% (mandatory)', 'Office of International Relations and Programs', 'Relationships with other countries, best-practice sharing and publication of SDG data.', 'Evidence-based scoring of policies, partnerships and SDG reporting.', null, '{}', '{}', '{}'),
  ('the-impact', 2, 'SDG 3 Good Health and Well-being', '26%', 'Faculty of Medicine and Surgery', 'Research on health, health outcomes of graduates, collaborations and health services.', 'Bibliometric and evidence metrics, normalised.', null, '{}', '{}', '{}'),
  ('the-impact', 3, 'SDG 4 Quality Education', '26%', 'College of Education', 'Research on early-years and lifelong learning, proportion of graduates with teaching qualifications, lifelong learning measures.', 'Bibliometric and evidence metrics, normalised.', null, '{}', '{}', '{}'),
  ('the-impact', 4, 'SDG 11 Sustainable Cities and Communities', '26%', 'College of Architecture', 'Research on sustainable cities, support of arts and heritage, sustainable practices.', 'Bibliometric and evidence metrics, normalised.', null, '{}', '{}', '{}'),
  ('the-subject', 1, 'Education: Research Quality', '27.5%', 'College of Education', 'Citation impact and research excellence within Education.', 'Subject-normalised citation metrics.', null, '{}', '{}', '{}'),
  ('the-subject', 2, 'Medical and Health: Teaching', '28.5%', 'Faculty of Medicine and Surgery', 'Teaching reputation and learning environment for Medical and Health.', 'Subject-weighted teaching pillar.', null, '{}', '{}', '{}'),
  ('the-subject', 3, 'Life Sciences: Output threshold', 'Eligibility', 'College of Science', 'Minimum publication volume for a subject to be ranked.', 'Papers in the subject over five years versus the THE threshold.', '% of threshold', '{}', '{}', '{}'),
  ('qs-wur', 1, 'Academic Reputation', '30%', 'Office of the Rector', 'Survey of academics on the institutions producing the best work in their field.', 'Weighted survey responses over five years.', null, '{}', '{}', '{}'),
  ('qs-wur', 2, 'Employer Reputation', '15%', 'Office for Career Services', 'Survey of employers on the institutions producing the best graduates.', 'Weighted survey responses over five years.', null, '{}', '{}', '{}'),
  ('qs-wur', 3, 'Citations per Faculty', '20%', 'Research Center for the Natural and Applied Sciences', 'Citations to papers published by the institution, divided by faculty count.', 'Five-year citations (excluding self-citations) ÷ faculty FTE, normalised by field.', null, '{}', '{}', '{}'),
  ('qs-wur', 4, 'Faculty–Student Ratio', '10%', 'Human Resource Department', 'Academic staff per student, a proxy for teaching capacity.', 'Faculty FTE ÷ student FTE, normalised.', null, '{}', '{}', '{}'),
  ('qs-wur', 5, 'Employment Outcomes', '5%', 'Office for Career Services', 'Graduate employment rate and alumni impact.', 'Employment rate and alumni outcomes index.', null, '{}', '{}', '{}'),
  ('qs-wur', 6, 'International Faculty Ratio', '5%', 'Human Resource Department', 'Share of faculty who are international.', 'International faculty FTE ÷ total faculty FTE.', null, '{}', '{}', '{}'),
  ('qs-wur', 7, 'International Student Ratio', '5%', 'Office of International Relations and Programs', 'Share of students who are international.', 'International students ÷ total students.', null, '{}', '{}', '{}'),
  ('qs-wur', 8, 'International Research Network', '5%', 'Office of the Vice-Rector for Research and Innovation', 'Diversity of international research partnerships.', 'Inclusiveness index over sustained co-authoring partner institutions.', null, '{}', '{}', '{}'),
  ('qs-wur', 9, 'Sustainability', '5%', 'Office for Sustainability', 'Social and environmental impact, drawn from QS Sustainability.', 'Score inherited from QS Sustainability.', null, '{}', '{}', '{}'),
  ('qs-sustainability', 1, 'Environmental Impact', '45%', 'Facilities Management Office', 'Environmental sustainability, education and research.', 'Sub-lenses on operations, environmental education and research.', null, array['Environmental sustainability', 'Environmental education', 'Environmental research'], array['Facilities Management Office', 'Office for Sustainability'], '{}'),
  ('qs-sustainability', 2, 'Social Impact', '45%', 'Office for Community Development (SIMBAHAYAN)', 'Equality, knowledge exchange, educational impact, employability and health and wellbeing.', 'Sub-lenses scored from data and public evidence.', null, array['Equality', 'Knowledge exchange', 'Impact of education', 'Employability and outcomes', 'Health and wellbeing'], array['SIMBAHAYAN', 'Office for Career Services', 'UST Hospital'], '{}'),
  ('qs-sustainability', 3, 'Governance', '10%', 'Office of the Secretary General', 'Good governance, ethics, transparency and student representation.', 'Evidence of policies and governance practices.', null, array['Good governance'], array['Office of the Secretary General'], '{}'),
  ('qs-subject', 1, 'Medicine: Academic Reputation', '40%', 'Faculty of Medicine and Surgery', 'Reputation among academics in medicine.', 'Survey responses, subject-weighted.', null, '{}', '{}', '{}'),
  ('qs-subject', 2, 'Medicine: Citations per paper', '15%', 'Faculty of Medicine and Surgery', 'Average citations per paper in medicine.', 'Five-year citations ÷ papers.', null, '{}', '{}', '{}'),
  ('qs-subject', 3, 'Medicine: H-index', '15%', 'Research Center for the Natural and Applied Sciences', 'Productivity and impact of published work in the subject.', 'Subject H-index, normalised.', null, '{}', '{}', '{}'),
  ('qs-subject', 4, 'Pharmacy: distance to threshold', 'Eligibility', 'Faculty of Pharmacy', 'Progress toward the papers and reputation thresholds for ranking.', 'Current output ÷ QS threshold.', '% of threshold', '{}', '{}', '{}'),
  ('greenmetric', 1, 'Setting and Infrastructure', '15%', 'Facilities Management Office', 'Campus area, open and green space, and sustainability budget.', 'Ratios of green and forested area to campus area, plus budget share.', '% of category', '{}', '{}', array['Green-space share', 'Sustainability budget']),
  ('greenmetric', 2, 'Energy and Climate Change', '21%', 'Facilities Management Office', 'Energy-efficient appliances, renewable energy, electricity use and carbon footprint.', 'Per-capita electricity, renewable share and emissions programmes.', '% of category', '{}', '{}', array['Electricity per person', 'Renewable share']),
  ('greenmetric', 3, 'Waste', '18%', 'Facilities Management Office', 'Recycling, toxic waste handling, organic and inorganic waste treatment, sewage disposal.', 'Programme coverage and treated waste share.', '% of category', '{}', '{}', array['Waste treated', 'Recycling programme']),
  ('greenmetric', 4, 'Water', '10%', 'Facilities Management Office', 'Water conservation, recycling, efficient appliances and treated water consumed.', 'Programme implementation and recycled water share.', '% of category', '{}', '{}', array['Water recycled', 'Efficient fixtures']),
  ('greenmetric', 5, 'Transportation', '18%', 'Office of the Secretary General', 'Vehicles, shuttle services, zero-emission vehicle policy, parking and pedestrian paths.', 'Ratios of vehicles to campus population and policy coverage.', '% of category', '{}', '{}', array['Zero-emission vehicles', 'Pedestrian path share']),
  ('greenmetric', 6, 'Education and Research', '18%', 'Office of the Vice-Rector for Research and Innovation', 'Sustainability courses, research funding, publications, events and student organisations.', 'Ratios of sustainability courses and research to totals.', '% of category', '{}', '{}', array['Sustainability courses', 'Sustainability publications']),
  ('wuri', 1, 'Industrial Application', 'Dimension', 'Office for Industry Linkages', 'Innovations applied with industry partners.', 'Panel evaluation of submitted programmes.', null, '{}', '{}', '{}'),
  ('wuri', 2, 'Value Creation', 'Dimension', 'Office of the Vice-Rector for Research and Innovation', 'Entrepreneurship, ethics and new value created.', 'Panel evaluation of submitted programmes.', null, '{}', '{}', '{}'),
  ('wuri', 3, 'Social Responsibility', 'Dimension', 'Office for Community Development (SIMBAHAYAN)', 'Programmes serving communities and the common good.', 'Panel evaluation of submitted programmes.', null, '{}', '{}', '{}'),
  ('wuri', 4, 'Student Mobility and Openness', 'Dimension', 'Office of International Relations and Programs', 'Openness, mobility and global engagement of students.', 'Panel evaluation of submitted programmes.', null, '{}', '{}', '{}');

insert into public.dictionary_terms (term, definition, position) values
  ('Citations', 'Times other publications cite UST outputs, usually over five years and normalised by field.', 1),
  ('H-index', 'The largest number h of papers that each have at least h citations.', 2),
  ('Faculty FTE', 'Full-time equivalent academic staff; part-time staff count as fractions.', 3),
  ('International co-authorship', 'Share of publications with at least one author at an institution in another country.', 4),
  ('Employer reputation', 'Survey of employers naming institutions that produce excellent graduates.', 5),
  ('Research income', 'External research funding received in the financial year, converted at purchasing-power parity.', 6),
  ('Water recycled', 'Volume of treated or harvested water reused on campus in the reporting year.', 7),
  ('Carbon emissions', 'Scope 1 and 2 greenhouse-gas emissions in tonnes of CO₂ equivalent.', 8),
  ('Beneficiaries', 'People or communities whose situation changed because of a programme, with how the change was verified.', 9),
  ('Public evidence URL', 'A link anyone can open without signing in, pointing to the approved document.', 10),
  ('Graduate employment', 'Share of graduates employed or in further study within a set period after graduation.', 11),
  ('Innovation programme', 'A programme or practice with documented novelty, outcomes and potential to scale.', 12);

insert into public.dictionary_links (term, position, ranking, indicator) values
  ('Citations', 1, 'QS WUR', 'Citations per Faculty'),
  ('Citations', 2, 'QS by Subject', 'Citations per paper'),
  ('Citations', 3, 'THE WUR', 'Research Quality: citation impact'),
  ('Citations', 4, 'THE by Subject', 'Research Quality'),
  ('Citations', 5, 'QS Sustainability', 'Environmental research'),
  ('Citations', 6, 'WURI', 'Evidence of impact'),
  ('H-index', 1, 'QS by Subject', 'H-index'),
  ('Faculty FTE', 1, 'QS WUR', 'Faculty–Student Ratio, Citations per Faculty'),
  ('Faculty FTE', 2, 'THE WUR', 'Teaching: staff-to-student ratio'),
  ('International co-authorship', 1, 'THE WUR', 'International Outlook'),
  ('International co-authorship', 2, 'QS WUR', 'International Research Network'),
  ('International co-authorship', 3, 'THE Impact', 'SDG 17'),
  ('Employer reputation', 1, 'QS WUR', 'Employer Reputation'),
  ('Employer reputation', 2, 'QS by Subject', 'Employer Reputation'),
  ('Research income', 1, 'THE WUR', 'Research Environment'),
  ('Research income', 2, 'THE WUR', 'Industry'),
  ('Water recycled', 1, 'UI GreenMetric', 'Water'),
  ('Water recycled', 2, 'QS Sustainability', 'Environmental sustainability'),
  ('Water recycled', 3, 'THE Impact', 'SDG 6'),
  ('Carbon emissions', 1, 'UI GreenMetric', 'Energy and Climate Change'),
  ('Carbon emissions', 2, 'QS Sustainability', 'Environmental sustainability'),
  ('Carbon emissions', 3, 'THE Impact', 'SDG 13'),
  ('Beneficiaries', 1, 'THE Impact', 'Outreach metrics'),
  ('Beneficiaries', 2, 'QS Sustainability', 'Social Impact'),
  ('Beneficiaries', 3, 'WURI', 'Social Responsibility'),
  ('Public evidence URL', 1, 'THE Impact', 'All evidence-based metrics'),
  ('Public evidence URL', 2, 'QS Sustainability', 'Governance'),
  ('Graduate employment', 1, 'QS WUR', 'Employment Outcomes'),
  ('Graduate employment', 2, 'QS Sustainability', 'Employability and outcomes'),
  ('Innovation programme', 1, 'WURI', 'All categories'),
  ('Innovation programme', 2, 'THE WUR', 'Industry: patents');

insert into public.calendar_items (position, month, item) values
  (1, 'Oct', 'UI GreenMetric questionnaire closes 31 Oct'),
  (2, 'Nov', 'THE Impact data collection closes 20 Nov'),
  (3, 'Dec', 'QS employer and academic lists due 15 Dec'),
  (4, 'Jan', 'WURI dossier due 12 Jan'),
  (5, 'Jan', 'QS Hub data submission closes 30 Jan'),
  (6, 'Feb', 'QS Sustainability survey closes 15 Feb'),
  (7, 'Mar', 'THE WUR and subject data closes 12 Mar');

insert into public.office_profile (id, name, reports_to, profile_date, location, landmark, phone, vision, mission, summary) values
  (1, 'Office of QS/THE Rankings', 'Office of the Rector', '19 September 2026', 'Main Building, Ground Floor, Room 110', 'Beside the Rector’s Hall', '406-1611 Local 8696', 'To position UST as the premier Catholic university in both the Asia and World university rankings by 2030.', 'Through innovative and comprehensive approaches, the Office promotes shared responsibility, continuous learning and process improvement to prepare UST for success in global university rankings.', 'Under the Office of the Rector, the Office of QS/THE Rankings coordinates UST’s participation in international rankings, consolidates institutional data and works with academic and support units on strategies to strengthen the University’s global standing.');

insert into public.office_entries (section, position, title, body, person, owners, timing, href) values
  ('function', 1, 'Oversee UST’s performance in international rankings, with particular focus on QS and Times Higher Education.', '', null, null, null, null),
  ('function', 2, 'Gather and consolidate ranking data through liaison with academic and support units.', '', null, null, null, null),
  ('function', 3, 'Work with academic units and concerned offices to implement action plans.', '', null, null, null, null),
  ('function', 4, 'Analyze Asia and World ranking results to identify and reinforce UST’s strengths.', '', null, null, null, null),
  ('function', 5, 'Continuously develop strategies to improve the University’s ranking performance.', '', null, null, null, null),
  ('objective', 1, 'Monitoring and reporting', 'Track institutional performance across ranking metrics and provide comprehensive reports to stakeholders.', null, null, null, null),
  ('objective', 2, 'Data analysis', 'Assess strengths and areas for improvement using data from multiple sources to guide strategic planning.', null, null, null, null),
  ('objective', 3, 'Collaboration', 'Support partnerships that strengthen academic and research output, including participation in international conferences and events organized by QS and THE.', null, null, null, null),
  ('objective', 4, 'Transnational engagement', 'Advance transnational higher education (TNHE) and transnational research (TNR) initiatives with global higher education institutions.', null, null, null, null),
  ('deliverable', 1, 'Reputational survey contacts', 'Develop lists of 400 academic partners and 400 employer partners, from the Philippines and abroad, for participation in reputational surveys. These are planning targets, not completed participation counts.', null, null, null, null),
  ('deliverable', 2, 'Performance benchmarking', 'Analyze UST’s results against leading Philippine and selected international universities to identify strengths and areas for improvement.', null, null, null, null),
  ('deliverable', 3, 'Improvement strategies', 'Facilitate discussions and propose strategies based on ranking indicators and rating scales.', null, null, null, null),
  ('deliverable', 4, 'Consolidated submissions', 'Gather data from faculties, colleges, institutes and support offices according to the criteria required for University submissions.', null, null, null, null),
  ('workplan', 1, 'Data collection', '', null, 'Office of QS/THE Rankings; Office of International Relations & Programs; faculties, colleges and institutes.', 'According to the Calendar of Activities.', null),
  ('workplan', 2, 'Operational planning and KPI monitoring', '', null, 'Office of QS/THE Rankings.', 'Quarterly.', null),
  ('workplan', 3, 'Submission review', '', null, 'Office of QS/THE Rankings.', 'According to the Calendar of Activities.', null),
  ('workplan', 4, 'Stakeholder coordination', '', null, 'Office of QS/THE Rankings and Office of International Relations & Programs.', 'As needed.', null),
  ('team', 1, 'Director', 'Leads the Office of QS/THE Rankings under the Office of the Rector.', 'Engr. Nestor R. Ong, MSIE, PIE, ASEAN Eng', null, null, null),
  ('team', 2, 'Office Clerk', 'Reports directly to Engr. Nestor R. Ong.', 'Ms. Eljane G. Gonzales', null, null, null),
  ('team', 3, 'Office Assistant & Senior Ranking Specialist & Integrator', 'Reports directly to the Director and provides functional supervision to the Ranking Specialists.', 'Engr. Rodablas P. Nicolas', null, null, null),
  ('team', 4, 'Ranking Specialist', 'Reports directly to the Director, with functional supervision from Engr. Rodablas P. Nicolas.', 'Engr. Jonas Edwin C. Fonacier', null, null, null),
  ('team', 5, 'Ranking Specialist — to be hired', 'The organizational structure assigns direct reporting to the Director and functional supervision to Engr. Rodablas P. Nicolas.', 'Vacant in the September 2026 office profile', null, null, null),
  ('portfolio', 1, 'QS World University Rankings', '', null, null, null, '/rankings/qs-wur'),
  ('portfolio', 2, 'QS Asia University Rankings', '', null, null, null, 'https://www.topuniversities.com/asia-university-rankings'),
  ('portfolio', 3, 'QS Stars Rating', '', null, null, null, 'https://www.topuniversities.com/qs-stars'),
  ('portfolio', 4, 'THE World University Rankings', '', null, null, null, '/rankings/the-wur'),
  ('portfolio', 5, 'THE Impact Rankings', '', null, null, null, '/rankings/the-impact'),
  ('portfolio', 6, 'THE Interdisciplinary Science Research Rankings', '', null, null, null, 'https://www.timeshighereducation.com/world-university-rankings/interdisciplinary-science-rankings'),
  ('portfolio', 7, 'THE Online Learning Rankings', '', null, null, null, 'https://www.timeshighereducation.com/world-university-rankings/online-learning-rankings-2024-results-announced'),
  ('portfolio', 8, 'AppliedHE Private University Rankings', '', null, null, null, 'https://appliedhe.com/rankings/methodology/private-all-asia-2026/'),
  ('portfolio', 9, 'Clarivate Special Projects', '', null, null, null, 'https://clarivate.com/academia-government/scientific-and-academic-research/research-funding-analytics/academia-government-consulting/'),
  ('portfolio', 10, 'World University Rankings for Innovation (WURI)', '', null, null, null, '/rankings/wuri');

insert into public.site_settings (id, latest_edition) values
  (1, 2026);

insert into public.site_process_stages (position, name, body, count_label, photo) values
  (1, 'Identify', 'A college, centre or office spots work that answers an indicator: a policy, a programme, a measured result.', 'contributions identified', 'courtyard'),
  (2, 'Submit', 'The unit sends the evidence once, for the reporting period it covers, with its owner named.', 'pieces of evidence submitted', 'library'),
  (3, 'Validate', 'Reviewers check the period, the quality and the relevance, and return specific comments when something is missing.', 'validated by reviewers', 'cabinet'),
  (4, 'Map', 'Accepted evidence is mapped to every indicator it supports across the eight rankings, so no unit is asked twice.', 'mapped to indicators', 'aerial'),
  (5, 'Report', 'The Office compiles each institutional submission on the ranking body''s own calendar, from October to March.', 'included in submissions', 'day'),
  (6, 'Credit', 'When a result is published, the Office measures what changed and names every unit whose evidence counted.', 'with results and impact measured', 'field');

insert into public.sdg_goals (number, name, color, icon) values
  (1, 'No Poverty', '#E5243B', 'sdg-01'),
  (2, 'Zero Hunger', '#DDA63A', 'sdg-02'),
  (3, 'Good Health and Well-being', '#4C9F38', 'sdg-03'),
  (4, 'Quality Education', '#C5192D', 'sdg-04'),
  (5, 'Gender Equality', '#FF3A21', 'sdg-05'),
  (6, 'Clean Water and Sanitation', '#26BDE2', 'sdg-06'),
  (7, 'Affordable and Clean Energy', '#FCC30B', 'sdg-07'),
  (8, 'Decent Work and Economic Growth', '#A21942', 'sdg-08'),
  (9, 'Industry, Innovation and Infrastructure', '#FD6925', 'sdg-09'),
  (10, 'Reduced Inequalities', '#DD1367', 'sdg-10'),
  (11, 'Sustainable Cities and Communities', '#FD9D24', 'sdg-11'),
  (12, 'Responsible Consumption and Production', '#BF8B2E', 'sdg-12'),
  (13, 'Climate Action', '#3F7E44', 'sdg-13'),
  (14, 'Life Below Water', '#0A97D9', 'sdg-14'),
  (15, 'Life on Land', '#56C02B', 'sdg-15'),
  (16, 'Peace, Justice and Strong Institutions', '#00689D', 'sdg-16'),
  (17, 'Partnerships for the Goals', '#19486A', 'sdg-17');

insert into public.reference_lists (list, position, value, note, color) values
  ('impact-theme', 1, 'SDG Stories', null, null),
  ('impact-theme', 2, 'Research Impact', null, null),
  ('impact-theme', 3, 'Community Transformation', null, null),
  ('impact-theme', 4, 'Campus Sustainability', null, null),
  ('impact-theme', 5, 'Thomasian Innovations', null, null),
  ('impact-theme', 6, 'International Partnerships', null, null),
  ('impact-theme', 7, 'Replicable Practices', null, null),
  ('wuri-category', 1, 'Entrepreneurial Spirit', null, null),
  ('wuri-category', 2, 'Ethical Value', null, null),
  ('wuri-category', 3, 'Crisis Management', null, null),
  ('wuri-category', 4, 'Student Support and Engagement', null, null),
  ('wuri-category', 5, 'Leadership', null, null),
  ('wuri-category', 6, 'Social Responsibility', null, null),
  ('wuri-category', 7, 'Industrial Application', null, null),
  ('wuri-category', 8, 'Value Creation', null, null),
  ('wuri-category', 9, 'Culture', null, null),
  ('wuri-category', 10, 'Openness', null, null),
  ('wuri-category', 11, 'Global Collaboration', null, null),
  ('wuri-category', 12, 'Student Mobility', null, null),
  ('report-type', 1, 'Executive summary', 'Positions, readiness and top risks on two pages.', null),
  ('report-type', 2, 'Management Review report', 'Quarterly review with action-plan progress.', null),
  ('report-type', 3, 'Indicator report', 'Every indicator with value, target, trend and owner.', null),
  ('report-type', 4, 'Unit compliance report', 'Assignments, completion and revisions by unit.', null),
  ('report-type', 5, 'Evidence gap report', 'Missing and revision-required evidence by deadline.', null),
  ('report-type', 6, 'Historical performance report', 'Five-year trajectory for each ranking.', null),
  ('subject-quadrant', 1, 'Global anchors', 'Already internationally ranked and competitive', null),
  ('subject-quadrant', 2, 'Emerging strengths', 'Near or recently entering a ranking threshold', null),
  ('subject-quadrant', 3, 'Development priorities', 'Has potential but needs targeted intervention', null),
  ('subject-quadrant', 4, 'Monitor', 'Insufficient current evidence or output', null),
  ('subject-area', 1, 'Life sciences and medicine', null, '#1BAF7A'),
  ('subject-area', 2, 'Natural sciences', null, '#2A78D6'),
  ('subject-area', 3, 'Engineering and technology', null, '#EB6834'),
  ('subject-area', 4, 'Social sciences and management', null, '#EDA100'),
  ('subject-area', 5, 'Arts and humanities', null, '#E87BA4'),
  ('impact-ladder', 1, 'Activity documented', null, null),
  ('impact-ladder', 2, 'Output measured', null, null),
  ('impact-ladder', 3, 'Outcome demonstrated', null, null),
  ('impact-ladder', 4, 'Beneficiary change verified', null, null),
  ('impact-ladder', 5, 'Long-term impact established', null, null),
  ('contribution-pipeline', 1, 'Identify contribution', null, null),
  ('contribution-pipeline', 2, 'Submit evidence', null, null),
  ('contribution-pipeline', 3, 'Validate data', null, null),
  ('contribution-pipeline', 4, 'Map to indicators', null, null),
  ('contribution-pipeline', 5, 'Include in submission', null, null),
  ('contribution-pipeline', 6, 'Measure result and impact', null, null),
  ('wuri-pipeline', 1, 'Ideas identified', null, null),
  ('wuri-pipeline', 2, 'Screened', null, null),
  ('wuri-pipeline', 3, 'Developed', null, null),
  ('wuri-pipeline', 4, 'Evidence strengthened', null, null),
  ('wuri-pipeline', 5, 'Submitted', null, null),
  ('wuri-pipeline', 6, 'Recognized', null, null),
  ('wuri-pipeline', 7, 'Replicated', null, null),
  ('research-funnel', 1, 'Research capacity', 'faculty with research load', null),
  ('research-funnel', 2, 'Publications', 'outputs in 2025', null),
  ('research-funnel', 3, 'Indexed outputs', 'in Scopus', null),
  ('research-funnel', 4, 'International collaboration', 'co-authored abroad', null),
  ('research-funnel', 5, 'Citations', 'citations per faculty score', null),
  ('research-funnel', 6, 'QS impact', 'of the overall weight', null);
