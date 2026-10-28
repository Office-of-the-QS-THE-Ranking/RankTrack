-- Digital Forms take the place of Templates & Forms. That shelf held uploaded documents; Digital Forms is a
-- repository of electronic forms (application forms, surveys, e-forms), each with its details, a responder link
-- (/f/<code>), a table of responses and analytics.
--
-- 1. The Workspace's file shelves are Working Documents and the Resource Library. Templates & Forms held nothing
--    when this was written; the check below stops the migration rather than lose anything if that changed.
-- 2. forms: one row per form, part of the governance store (hub_tables), changed only through its commands.
-- 3. form_responses: one row per response, outside the store, written and read directly by the server (service
--    role), so a busy form never rewrites the store. hub_form_submit numbers each form's responses in order.
-- 4. The first form: UST SIMBAHAYAN's Community Development Project Proposal (S040-00-FO21 rev06), generated
--    from src/lib/forms/templates/comdev-proposal.ts by scripts/forms/seed-sql.mts.

do $$
begin
  if exists (select 1 from public.workspace_files where shelf = 'templates')
     or exists (select 1 from public.workspace_folders where shelf = 'templates') then
    raise exception 'Templates & Forms still holds files or folders. Move them to the Resource Library first.';
  end if;
end;
$$;

alter table public.workspace_files drop constraint if exists workspace_files_shelf_check;
alter table public.workspace_files add constraint workspace_files_shelf_check check (shelf in ('working', 'library'));
alter table public.workspace_folders drop constraint if exists workspace_folders_shelf_check;
alter table public.workspace_folders add constraint workspace_folders_shelf_check check (shelf in ('working', 'library'));
alter table public.workspace_files drop column if exists kind;

-- ---------- Forms (governance store) ----------

create table public.forms (
  id text primary key,
  ord integer not null,
  -- Null: one of the Office's forms, which every unit sees.
  unit_id text,
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{3,39}$'),
  prefix text not null check (prefix ~ '^[A-Z]{1,6}$'),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 300),
  kind text not null check (kind in ('application', 'survey', 'eform', 'evaluation', 'registration')),
  reference text check (char_length(reference) <= 80),
  issuer_id text,
  status text not null check (status in ('draft', 'open', 'closed')),
  closes_on date,
  schema jsonb not null check (jsonb_typeof(schema) = 'object' and jsonb_typeof(schema -> 'sections') = 'array'),
  created_by text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by text not null
);
create index forms_unit_idx on public.forms (unit_id);

insert into public.hub_tables (name, position) values ('forms', 62);

alter table public.forms enable row level security;
revoke all on table public.forms from anon, authenticated;

-- ---------- Responses (outside the store) ----------

create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key: restoring the store to an older recovery point must never take responses with it.
  form_id text not null,
  seq integer not null check (seq > 0),
  ref text not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  respondent jsonb not null default '{}'::jsonb,
  review jsonb not null default '{"stages": {}, "fields": {}}'::jsonb,
  status text not null default 'received' check (status in ('received', 'in-review', 'approved', 'returned', 'declined')),
  -- A hash of the sender's network (server/limits.ts clientKey), never the address itself.
  client text,
  -- Milliseconds, as JavaScript reads them, so a review can save over exactly the version it read.
  submitted_at timestamptz not null default date_trunc('milliseconds', now()),
  updated_at timestamptz not null default date_trunc('milliseconds', now()),
  unique (form_id, seq)
);
create index form_responses_form_idx on public.form_responses (form_id, submitted_at desc);

alter table public.form_responses enable row level security;
revoke all on table public.form_responses from anon, authenticated;

-- One response at a time per form, so each takes the next number of its form: CDP-0001, CDP-0002…
create function public.hub_form_submit(p_form_id text, p_prefix text, p_answers jsonb, p_respondent jsonb, p_status text, p_client text)
returns table (ref text, submitted_at timestamptz)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_seq integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('form_responses:' || p_form_id, 0));
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.form_responses as r where r.form_id = p_form_id;
  return query
    insert into public.form_responses as r (form_id, seq, ref, answers, respondent, status, client)
    values (p_form_id, v_seq, p_prefix || '-' || lpad(v_seq::text, 4, '0'), p_answers, coalesce(p_respondent, '{}'::jsonb), p_status, p_client)
    returning r.ref, r.submitted_at;
end;
$$;

-- Each form's responses: all of them, the last seven days', and when the last came.
create function public.hub_form_counts(p_form_ids text[])
returns table (form_id text, total bigint, week bigint, last_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select r.form_id, count(*), count(*) filter (where r.submitted_at > now() - interval '7 days'), max(r.submitted_at)
  from public.form_responses as r
  where r.form_id = any (p_form_ids)
  group by r.form_id;
$$;

revoke execute on function public.hub_form_submit(text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.hub_form_counts(text[]) from public, anon, authenticated;
grant execute on function public.hub_form_submit(text, text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.hub_form_counts(text[]) to service_role;

-- ---------- The first form ----------

insert into public.forms (id, ord, unit_id, code, prefix, title, description, kind, reference, issuer_id, status, closes_on, schema, created_by, created_at, updated_at, updated_by)
values (
  'FM-0001', 0, null, 'comdev-proposal', 'CDP',
  'Community Development Project Proposal',
  'Propose a ComDev project for endorsement and approval.',
  'application', 'UST:S040-00-FO21 rev06 09/23/26', 'simbahayan', 'open', null,
  $form${
  "sections": [
    {
      "id": "project",
      "title": "Project",
      "icon": "flag",
      "fields": [
        {
          "id": "title",
          "type": "text",
          "label": "Project title",
          "required": true,
          "column": true,
          "max": 160
        },
        {
          "id": "lead",
          "type": "text",
          "label": "Lead organization",
          "required": true,
          "column": true,
          "max": 120
        },
        {
          "id": "collaborators",
          "type": "table",
          "label": "Collaborating organizations",
          "help": "Leave empty if none.",
          "columns": [
            {
              "id": "name",
              "label": "Organization",
              "type": "text",
              "required": true,
              "max": 120
            }
          ],
          "max": 10,
          "add": "Add organization"
        },
        {
          "id": "affiliation",
          "type": "choice",
          "label": "Affiliation",
          "required": true,
          "options": [
            {
              "value": "uso",
              "label": "University-wide student organization"
            },
            {
              "value": "nstp",
              "label": "NSTP",
              "hint": "CWTS or LTS"
            },
            {
              "value": "local",
              "label": "Local student organization or academic unit"
            }
          ],
          "other": "Others",
          "display": "cards"
        },
        {
          "id": "academicUnit",
          "type": "unit",
          "label": "Academic unit",
          "required": true,
          "showIf": {
            "field": "affiliation",
            "is": [
              "local"
            ]
          },
          "sections": [
            "academic"
          ]
        },
        {
          "id": "areas",
          "type": "choice",
          "label": "Program areas",
          "help": "Up to 2.",
          "required": true,
          "options": [
            {
              "value": "health",
              "label": "Health and wellness"
            },
            {
              "value": "education",
              "label": "Equitable and inclusive education"
            },
            {
              "value": "governance",
              "label": "Leadership and good governance"
            },
            {
              "value": "enterprise",
              "label": "Employability and social enterprise"
            },
            {
              "value": "pastoral",
              "label": "Socio-pastoral ministry and evangelization"
            },
            {
              "value": "heritage",
              "label": "Culture and heritage"
            },
            {
              "value": "sports",
              "label": "Sports development"
            },
            {
              "value": "environment",
              "label": "Environmental sustainability and action"
            },
            {
              "value": "family",
              "label": "Family and household development"
            }
          ],
          "multiple": true,
          "max": 2,
          "display": "chips"
        },
        {
          "id": "sdgs",
          "type": "sdgs",
          "label": "Target SDGs",
          "help": "Up to 3.",
          "required": true,
          "column": true,
          "max": 3
        }
      ]
    },
    {
      "id": "people",
      "title": "People",
      "icon": "users",
      "fields": [
        {
          "id": "contacts",
          "type": "people",
          "label": "Contact persons",
          "help": "Up to 2.",
          "required": true,
          "ask": [
            "phone",
            "email"
          ],
          "min": 1,
          "max": 2,
          "domain": "ust.edu.ph",
          "noun": "contact person"
        },
        {
          "id": "officers",
          "type": "people",
          "label": "Liquidation officers",
          "help": "They receive the budget and file the expense report.",
          "required": true,
          "ask": [
            "email"
          ],
          "max": 2,
          "domain": "ust.edu.ph",
          "roles": [
            "President",
            "Treasurer"
          ]
        }
      ]
    },
    {
      "id": "schedule",
      "title": "Where and when",
      "icon": "calendar",
      "fields": [
        {
          "id": "community",
          "type": "text",
          "label": "Partner community or institution",
          "help": "Write “Thomasians” if the participants are from UST.",
          "required": true,
          "max": 200
        },
        {
          "id": "participants",
          "type": "counts",
          "label": "Target participants",
          "required": true,
          "rows": [
            {
              "id": "community",
              "label": "Community or institution"
            },
            {
              "id": "students",
              "label": "Thomasian students"
            },
            {
              "id": "faculty",
              "label": "Thomasian academic staff"
            },
            {
              "id": "administrators",
              "label": "Thomasian administrators"
            },
            {
              "id": "support",
              "label": "Thomasian support staff"
            },
            {
              "id": "alumni",
              "label": "UST alumni"
            },
            {
              "id": "guests",
              "label": "Guests"
            }
          ],
          "total": "Total participants"
        },
        {
          "id": "phases",
          "type": "table",
          "label": "Phases",
          "help": "At least 2.",
          "required": true,
          "columns": [
            {
              "id": "name",
              "label": "Name",
              "type": "text",
              "examples": [
                "Preparation",
                "Implementation",
                "Evaluation"
              ],
              "max": 60
            },
            {
              "id": "mode",
              "label": "Mode",
              "type": "choice",
              "required": true,
              "options": [
                {
                  "value": "online",
                  "label": "Online"
                },
                {
                  "value": "campus",
                  "label": "In campus"
                },
                {
                  "value": "offcampus",
                  "label": "Off campus"
                },
                {
                  "value": "hybrid",
                  "label": "Hybrid"
                }
              ]
            },
            {
              "id": "dates",
              "label": "Dates",
              "type": "daterange",
              "required": true
            },
            {
              "id": "venue",
              "label": "Venue or platform",
              "type": "text",
              "required": true,
              "placeholder": "Building, street, barangay, city, province",
              "max": 200,
              "wide": true
            },
            {
              "id": "link",
              "label": "Meeting link",
              "type": "link",
              "placeholder": "https://meet.google.com/…",
              "showIf": {
                "column": "mode",
                "is": [
                  "online",
                  "hybrid"
                ]
              },
              "wide": true
            }
          ],
          "min": 2,
          "max": 6,
          "numbered": "Phase",
          "add": "Add phase"
        }
      ]
    },
    {
      "id": "plan",
      "title": "Plan",
      "icon": "target",
      "fields": [
        {
          "id": "background",
          "type": "paragraph",
          "label": "Why this project",
          "help": "The community’s need it answers. Up to 5 sentences.",
          "required": true,
          "max": 3000,
          "sentences": 5
        },
        {
          "id": "objective",
          "type": "paragraph",
          "label": "General objective",
          "help": "What the project sets out to do. Up to 5 sentences.",
          "required": true,
          "max": 3000,
          "sentences": 5
        },
        {
          "id": "results",
          "type": "table",
          "label": "Expected results",
          "help": "One for each.",
          "required": true,
          "columns": [
            {
              "id": "result",
              "label": "Expected result",
              "type": "paragraph",
              "required": true,
              "max": 600,
              "wide": true
            }
          ],
          "rows": [
            "Project",
            "Implementers",
            "Community"
          ]
        },
        {
          "id": "flow",
          "type": "table",
          "label": "Project flow",
          "help": "Each activity, phase by phase.",
          "required": true,
          "columns": [
            {
              "id": "phase",
              "label": "Phase",
              "type": "choice",
              "required": true,
              "optionsFrom": "phases"
            },
            {
              "id": "time",
              "label": "Time",
              "type": "text",
              "required": true,
              "placeholder": "8:00–9:00 AM",
              "max": 60
            },
            {
              "id": "activity",
              "label": "Activity",
              "type": "text",
              "required": true,
              "max": 120
            },
            {
              "id": "lead",
              "label": "Person in charge",
              "type": "text",
              "required": true,
              "placeholder": "Name, position",
              "max": 120
            },
            {
              "id": "details",
              "label": "Details",
              "type": "paragraph",
              "max": 600,
              "wide": true
            }
          ],
          "min": 1,
          "max": 40,
          "add": "Add activity"
        }
      ]
    },
    {
      "id": "budget",
      "title": "Budget",
      "icon": "wallet",
      "fields": [
        {
          "id": "budget",
          "type": "budget",
          "label": "Budget",
          "help": "Per phase. Totals add up as you go.",
          "hint": "CSF is the Community Service Fund. SIMBAHAYAN contributes to a project but never covers all of it, so show what your organization and the community put in.",
          "required": true,
          "column": true,
          "sources": [
            {
              "id": "csf",
              "label": "CSF"
            },
            {
              "id": "org",
              "label": "Organization"
            },
            {
              "id": "community",
              "label": "Community"
            }
          ],
          "categories": [
            {
              "id": "food",
              "label": "Food",
              "hint": "Rates are fixed.",
              "presets": [
                {
                  "item": "Lunch or dinner",
                  "rate": 175,
                  "locked": true
                },
                {
                  "item": "Snack",
                  "rate": 100,
                  "locked": true
                }
              ]
            },
            {
              "id": "transport",
              "label": "Transportation",
              "presets": [
                {
                  "item": "Van",
                  "hint": "Up to 10 people"
                },
                {
                  "item": "Coaster",
                  "hint": "Up to 25 people"
                },
                {
                  "item": "Bus",
                  "hint": "Up to 45 people"
                }
              ],
              "custom": true
            },
            {
              "id": "materials",
              "label": "Materials and supplies",
              "custom": true,
              "perDay": false
            },
            {
              "id": "others",
              "label": "Others",
              "presets": [
                {
                  "item": "Token",
                  "hint": "Attach the speaker’s CV or bionote."
                },
                {
                  "item": "Honorarium",
                  "hint": "Attach the speaker’s CV or bionote.",
                  "recipient": true
                },
                {
                  "item": "Load (mobile data or SMS)",
                  "hint": "Online activities only."
                }
              ],
              "custom": true
            }
          ],
          "per": "phases"
        },
        {
          "id": "transportPay",
          "type": "choice",
          "label": "Transportation paid through",
          "required": true,
          "showIf": {
            "field": "budget",
            "is": [
              "transport"
            ]
          },
          "options": [
            {
              "value": "cash",
              "label": "Cash"
            },
            {
              "value": "ovrf",
              "label": "Purchasing",
              "hint": "OVRF"
            }
          ],
          "display": "cards"
        },
        {
          "id": "counterpart",
          "type": "budget",
          "label": "Volunteer counterpart",
          "help": "The value of everyone’s time. No funds are released.",
          "required": true,
          "sources": [
            {
              "id": "org",
              "label": "Organization"
            },
            {
              "id": "community",
              "label": "Community"
            }
          ],
          "categories": [
            {
              "id": "volunteers",
              "label": "Volunteers",
              "presets": [
                {
                  "item": "Student volunteers",
                  "rate": 500,
                  "locked": true,
                  "source": "org"
                },
                {
                  "item": "Staff volunteers",
                  "rate": 2000,
                  "locked": true,
                  "source": "org",
                  "hint": "Academic staff, administrators or support staff"
                },
                {
                  "item": "Partner community volunteers",
                  "rate": 1000,
                  "locked": true,
                  "source": "community"
                }
              ]
            }
          ],
          "fixed": true,
          "theoretical": true
        }
      ]
    },
    {
      "id": "safety",
      "title": "Safety",
      "icon": "shield",
      "fields": [
        {
          "id": "emergencyPlan",
          "type": "paragraph",
          "label": "Emergency plan",
          "help": "Protocols for emergencies, health hazards and heat, and your first aider.",
          "required": true,
          "max": 3000
        },
        {
          "id": "hospital",
          "type": "text",
          "label": "Nearest hospital or clinic",
          "help": "For face-to-face activities.",
          "max": 200
        },
        {
          "id": "emergencyContact",
          "type": "people",
          "label": "Emergency contact",
          "help": "From the lead organization.",
          "ask": [
            "phone"
          ],
          "max": 1,
          "noun": "emergency contact"
        },
        {
          "id": "hasSpeakers",
          "type": "yesno",
          "label": "Will you have resource speakers?",
          "required": true
        },
        {
          "id": "speakers",
          "type": "table",
          "label": "Resource speakers",
          "hint": "Requested amounts are subject to SIMBAHAYAN’s approval. For a token or honorarium from the CSF, prepare the speaker’s CV or bionote.",
          "required": true,
          "showIf": {
            "field": "hasSpeakers",
            "is": [
              "yes"
            ]
          },
          "columns": [
            {
              "id": "name",
              "label": "Name",
              "type": "text",
              "required": true,
              "max": 120
            },
            {
              "id": "from",
              "label": "Affiliation",
              "type": "choice",
              "required": true,
              "options": [
                {
                  "value": "staff",
                  "label": "Thomasian · academic staff"
                },
                {
                  "value": "alumni",
                  "label": "Thomasian · alumni"
                },
                {
                  "value": "external",
                  "label": "Non-Thomasian"
                }
              ]
            },
            {
              "id": "education",
              "label": "Highest education",
              "type": "text",
              "required": true,
              "max": 120
            },
            {
              "id": "years",
              "label": "Years of service",
              "type": "number"
            },
            {
              "id": "paid",
              "label": "Token or honorarium from CSF",
              "type": "choice",
              "required": true,
              "options": [
                {
                  "value": "yes",
                  "label": "Yes"
                },
                {
                  "value": "no",
                  "label": "No"
                }
              ]
            },
            {
              "id": "amount",
              "label": "Amount requested",
              "type": "money",
              "showIf": {
                "column": "paid",
                "is": [
                  "yes"
                ]
              }
            }
          ],
          "min": 1,
          "max": 10,
          "add": "Add speaker"
        }
      ]
    },
    {
      "id": "sustain",
      "title": "Sustainability",
      "icon": "tree",
      "fields": [
        {
          "id": "evaluation",
          "type": "link",
          "label": "Evaluation form",
          "help": "With quantitative and qualitative measures.",
          "required": true,
          "placeholder": "https://forms.gle/…"
        },
        {
          "id": "ownership",
          "type": "paragraph",
          "label": "Project sustainability",
          "help": "How the community will carry it on: trained local leaders, a community team, simple guides.",
          "required": true,
          "max": 3000
        },
        {
          "id": "environment",
          "type": "paragraph",
          "label": "Care for creation",
          "help": "How you’ll care for the environment: reusable utensils, your own tumbler.",
          "required": true,
          "max": 3000
        }
      ]
    },
    {
      "id": "sign",
      "title": "Sign",
      "icon": "pen",
      "fields": [
        {
          "id": "declarations",
          "type": "consent",
          "label": "Declarations",
          "required": true,
          "statements": [
            {
              "id": "privacy",
              "text": "We consent to the use of the personal information in this form for documentation and coordination, and to photos and videos for UST SIMBAHAYAN’s reports and promotions.",
              "hint": "In compliance with the Data Privacy Act of 2012 (RA 10173), the personal information collected through this form is used solely for documentation and coordination of the activity. By submitting it, proponents consent to the taking and use of photos and videos for reporting and official promotional materials of UST SIMBAHAYAN."
            },
            {
              "id": "informed",
              "text": "We will tell every collaborator and participant about this consent before the activity starts."
            },
            {
              "id": "links",
              "text": "Every link here opens, and simbahayan.office@ust.edu.ph has Editor access to it."
            },
            {
              "id": "reports",
              "text": "We will submit the terminal and expense reports within 15 working days after the project.",
              "hint": "Submit an expense report only if you receive a CSF or are due a reimbursement, and bring it to the SIMBAHAYAN Office: expense reports sent online aren’t processed."
            }
          ]
        },
        {
          "id": "signLead",
          "type": "signature",
          "label": "Lead organization",
          "required": true,
          "signers": [
            "Lead organization representative"
          ]
        },
        {
          "id": "signCollab",
          "type": "signature",
          "label": "Collaborating organization",
          "required": true,
          "showIf": {
            "field": "collaborators",
            "filled": true
          },
          "signers": [
            "Collaborating organization representative"
          ]
        },
        {
          "id": "signOfficers",
          "type": "signature",
          "label": "Liquidation officers",
          "required": true,
          "signers": [
            "President",
            "Treasurer"
          ]
        }
      ]
    }
  ],
  "review": {
    "stages": [
      {
        "id": "adviser",
        "role": "Student organization adviser",
        "verb": "Noted",
        "showIf": {
          "field": "affiliation",
          "is": [
            "local"
          ]
        }
      },
      {
        "id": "dean",
        "role": "Dean",
        "verb": "Endorsed",
        "showIf": {
          "field": "affiliation",
          "is": [
            "local"
          ]
        }
      },
      {
        "id": "regent",
        "role": "Regent",
        "verb": "Endorsed",
        "showIf": {
          "field": "affiliation",
          "is": [
            "local"
          ]
        }
      },
      {
        "id": "coordinator",
        "role": "ComDev coordinator or NSTP moderator",
        "verb": "Approved"
      },
      {
        "id": "director",
        "role": "UST SIMBAHAYAN Director",
        "verb": "Approved"
      }
    ],
    "fields": [
      {
        "id": "budgetCode",
        "type": "text",
        "label": "Proposed budget code",
        "half": true,
        "max": 60
      },
      {
        "id": "finalBudget",
        "type": "money",
        "label": "Final approved CSF budget",
        "half": true
      },
      {
        "id": "finalCode",
        "type": "text",
        "label": "Final budget code",
        "half": true,
        "max": 60
      },
      {
        "id": "requisition",
        "type": "text",
        "label": "Cash requisition number",
        "half": true,
        "max": 60
      },
      {
        "id": "encodedOn",
        "type": "date",
        "label": "Date of encoding",
        "half": true
      },
      {
        "id": "payableTo",
        "type": "table",
        "label": "CSF payable to",
        "columns": [
          {
            "id": "to",
            "label": "Payable to",
            "type": "choice",
            "options": [
              {
                "value": "scdo",
                "label": "SCDO"
              },
              {
                "value": "purchasing",
                "label": "Purchasing"
              },
              {
                "value": "supplier",
                "label": "Supplier"
              }
            ]
          }
        ],
        "rows": [
          "Food",
          "Transportation",
          "Materials and supplies",
          "Others"
        ]
      },
      {
        "id": "comments",
        "type": "paragraph",
        "label": "Comments",
        "max": 2000
      }
    ]
  },
  "from": {
    "name": "lead",
    "email": "contacts"
  }
}$form$::jsonb,
  'system', now(), now(), 'system'
);

insert into public.id_counters (name, value) values ('form', 1)
on conflict (name) do update set value = greatest(public.id_counters.value, 1);

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
