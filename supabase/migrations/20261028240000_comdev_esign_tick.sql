-- The ComDev Project Proposal's e-signature is one box to tick, "We sign this proposal electronically, for the lead
-- organization, any collaborating organization and the liquidation officers.", in place of the typed names of the lead
-- organization's representative, the collaborating organization's representative and the liquidation officers.
-- No response had been sent. Brought up to the template (src/lib/forms/templates/comdev-proposal.ts, written by
-- scripts/forms/seed-sql.mts --update).

update public.forms
set schema = $form${
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
          "max": 120,
          "caps": true
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
              "max": 120,
              "caps": true
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
            "phone",
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
          "required": true,
          "max": 3000,
          "sentences": 5
        },
        {
          "id": "objective",
          "type": "paragraph",
          "label": "General objective",
          "required": true,
          "max": 3000,
          "sentences": 5
        },
        {
          "id": "results",
          "type": "table",
          "label": "Expected results",
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
              "type": "name",
              "required": true,
              "wide": true
            },
            {
              "id": "position",
              "label": "Position",
              "type": "text",
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
          "hint": "CSF is the Community Service Fund. SIMBAHAYAN contributes to a project but never covers all of it, so show what your organization and the community put in.",
          "required": true,
          "column": true,
          "sources": [
            {
              "id": "csf",
              "label": "Community Service Fund (CSF)"
            },
            {
              "id": "org",
              "label": "Organizational Counterpart"
            },
            {
              "id": "community",
              "label": "Community Counterpart"
            }
          ],
          "categories": [
            {
              "id": "food",
              "label": "Food",
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
          "id": "csfSummary",
          "type": "budgetsummary",
          "label": "Summary of budget under Community Service Fund (CSF)",
          "help": "Every Community Service Fund line, from all phases. The final approved budget is set after review.",
          "budget": "budget",
          "source": "csf"
        },
        {
          "id": "counterpart",
          "type": "budget",
          "label": "Volunteer counterpart",
          "required": true,
          "sources": [
            {
              "id": "org",
              "label": "Organizational Counterpart"
            },
            {
              "id": "community",
              "label": "Community Counterpart"
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
                  "source": "org"
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
            "phone",
            "email"
          ],
          "emailOptional": true,
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
              "label": "Speaker",
              "type": "name",
              "required": true,
              "wide": true
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
          "id": "esign",
          "type": "consent",
          "label": "E-signature",
          "required": true,
          "statements": [
            {
              "id": "signed",
              "text": "We sign this proposal electronically, for the lead organization, any collaborating organization and the liquidation officers.",
              "hint": "This takes the place of signatures on the paper form. The Hub dates it when the form is sent."
            }
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
        "id": "payableTo",
        "type": "budgetsummary",
        "label": "Summary of budget under Community Service Fund (CSF)",
        "budget": "budget",
        "source": "csf",
        "payee": [
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
  updated_at = now(),
  updated_by = 'system'
where id = 'FM-0001' and code = 'comdev-proposal';

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
