/**
 * Office profile supplied by the user: “All About the Office of QS/THE Rankings”,
 * 19 September 2026. Revised wording takes precedence over the slides marked Existing.
 * Profile/functions: p4; vision/mission/objectives: pp6–8; scope: p10;
 * organization/reporting: pp12,14; deliverables: p20; responsibilities: p22.
 * These are office responsibilities and targets, not published ranking results.
 */
export const OFFICE = {
  name: "Office of QS/THE Rankings",
  reportsTo: "Office of the Rector",
  profileDate: "19 September 2026",
  location: "Main Building, Ground Floor, Room 110",
  landmark: "Beside the Rector’s Hall",
  phone: "406-1611 Local 8696",
  vision: "To position UST as the premier Catholic university in both the Asia and World university rankings by 2030.",
  mission: "Through innovative and comprehensive approaches, the Office promotes shared responsibility, continuous learning and process improvement to prepare UST for success in global university rankings.",
  summary: "Under the Office of the Rector, the Office of QS/THE Rankings coordinates UST’s participation in international rankings, consolidates institutional data and works with academic and support units on strategies to strengthen the University’s global standing.",
};

export const OFFICE_FUNCTIONS = [
  "Oversee UST’s performance in international rankings, with particular focus on QS and Times Higher Education.",
  "Gather and consolidate ranking data through liaison with academic and support units.",
  "Work with academic units and concerned offices to implement action plans.",
  "Analyze Asia and World ranking results to identify and reinforce UST’s strengths.",
  "Continuously develop strategies to improve the University’s ranking performance.",
];

export const OFFICE_OBJECTIVES = [
  { title: "Monitoring and reporting", text: "Track institutional performance across ranking metrics and provide comprehensive reports to stakeholders." },
  { title: "Data analysis", text: "Assess strengths and areas for improvement using data from multiple sources to guide strategic planning." },
  { title: "Collaboration", text: "Support partnerships that strengthen academic and research output, including participation in international conferences and events organized by QS and THE." },
  { title: "Transnational engagement", text: "Advance transnational higher education (TNHE) and transnational research (TNR) initiatives with global higher education institutions." },
];

export const OFFICE_DELIVERABLES = [
  { title: "Reputational survey contacts", text: "Develop lists of 400 academic partners and 400 employer partners, from the Philippines and abroad, for participation in reputational surveys. These are planning targets, not completed participation counts." },
  { title: "Performance benchmarking", text: "Analyze UST’s results against leading Philippine and selected international universities to identify strengths and areas for improvement." },
  { title: "Improvement strategies", text: "Facilitate discussions and propose strategies based on ranking indicators and rating scales." },
  { title: "Consolidated submissions", text: "Gather data from faculties, colleges, institutes and support offices according to the criteria required for University submissions." },
];

export const OFFICE_WORKPLAN = [
  { title: "Data collection", owners: "Office of QS/THE Rankings; Office of International Relations & Programs; faculties, colleges and institutes.", timing: "According to the Calendar of Activities." },
  { title: "Operational planning and KPI monitoring", owners: "Office of QS/THE Rankings.", timing: "Quarterly." },
  { title: "Submission review", owners: "Office of QS/THE Rankings.", timing: "According to the Calendar of Activities." },
  { title: "Stakeholder coordination", owners: "Office of QS/THE Rankings and Office of International Relations & Programs.", timing: "As needed." },
];

export const OFFICE_TEAM = [
  { role: "Director", who: "Engr. Nestor R. Ong, MSIE, PIE, ASEAN Eng", focus: "Leads the Office of QS/THE Rankings under the Office of the Rector." },
  { role: "Office Clerk", who: "Ms. Eljane G. Gonzales", focus: "Reports directly to Engr. Nestor R. Ong." },
  { role: "Office Assistant & Senior Ranking Specialist & Integrator", who: "Engr. Rodablas P. Nicolas", focus: "Reports directly to the Director and provides functional supervision to the Ranking Specialists." },
  { role: "Ranking Specialist", who: "Engr. Jonas Edwin C. Fonacier", focus: "Reports directly to the Director, with functional supervision from Engr. Rodablas P. Nicolas." },
  { role: "Ranking Specialist — to be hired", who: "Vacant in the September 2026 office profile", focus: "The organizational structure assigns direct reporting to the Director and functional supervision to Engr. Rodablas P. Nicolas." },
];

/** The ten frameworks in the supplied scope; only existing result pages receive local links. */
export const OFFICE_PORTFOLIO = [
  { name: "QS World University Rankings", href: "/rankings/qs-wur" },
  { name: "QS Asia University Rankings", href: "https://www.topuniversities.com/asia-university-rankings" },
  { name: "QS Stars Rating", href: "https://www.topuniversities.com/qs-stars" },
  { name: "THE World University Rankings", href: "/rankings/the-wur" },
  { name: "THE Impact Rankings", href: "/rankings/the-impact" },
  { name: "THE Interdisciplinary Science Research Rankings", href: "https://www.timeshighereducation.com/world-university-rankings/interdisciplinary-science-rankings" },
  { name: "THE Online Learning Rankings", href: "https://www.timeshighereducation.com/world-university-rankings/online-learning-rankings-2024-results-announced" },
  { name: "AppliedHE Private University Rankings", href: "https://appliedhe.com/rankings/methodology/private-all-asia-2026/" },
  { name: "Clarivate Special Projects", href: "https://clarivate.com/academia-government/scientific-and-academic-research/research-funding-analytics/academia-government-consulting/" },
  { name: "World University Rankings for Innovation (WURI)", href: "/rankings/wuri" },
];
