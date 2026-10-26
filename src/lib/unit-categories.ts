/** Display names shared by Unit Participation and the Organizational Directory. */
export const UNIT_CATEGORY_LABELS = {
  academic: "Faculty/Colleges",
  offices: "University Offices",
  research: "Research Centers",
} as const;

export const UNIT_CATEGORY_TABS = [
  UNIT_CATEGORY_LABELS.academic,
  UNIT_CATEGORY_LABELS.offices,
  UNIT_CATEGORY_LABELS.research,
] as const;
