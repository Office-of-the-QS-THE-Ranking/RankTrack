/** Reference directory supplied in ust_directory.csv. Used for filter choices and unit matching. */
import type { OrgUnit } from "./types";

export interface DirectoryEntry {
  key: string;
  parentKey: string | null;
  category: string;
  name: string;
  emails: string[];
}

const directoryName = (name: string) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const LEGACY_KEYS: Record<string, string> = { secgen: "A10", simbahayan: "A19", careers: "A21" };

/** Resolve existing units without combining the three faculties that share a contact email. */
export function matchDirectoryEntry(unit: Pick<OrgUnit, "id" | "name" | "emails" | "directoryKey">): DirectoryEntry | undefined {
  const named = UST_DIRECTORY.find((entry) => entry.key === (unit.directoryKey ?? LEGACY_KEYS[unit.id] ?? unit.id))
    ?? UST_DIRECTORY.find((entry) => directoryName(entry.name) === directoryName(unit.name));
  if (named) return named;
  const byEmail = UST_DIRECTORY.filter((entry) => unit.emails?.some((email) => entry.emails.some((other) => other.toLowerCase() === email.toLowerCase())));
  return byEmail.length === 1 ? byEmail[0] : undefined;
}

export const UST_DIRECTORY: DirectoryEntry[] = [
  {"key": "C01", "parentKey": null, "category": "College/Faculty", "name": "Faculty of Sacred Theology", "emails": ["ecclesiastical.office@ust.edu.ph"]},
  {"key": "C02", "parentKey": null, "category": "College/Faculty", "name": "Faculty of Philosophy", "emails": ["ecclesiastical.office@ust.edu.ph"]},
  {"key": "C03", "parentKey": null, "category": "College/Faculty", "name": "Faculty of Canon Law", "emails": ["ecclesiastical.office@ust.edu.ph"]},
  {"key": "C04", "parentKey": null, "category": "College/Faculty", "name": "Faculty of Civil Law", "emails": ["civillaw@ust.edu.ph"]},
  {"key": "C05", "parentKey": null, "category": "College/Faculty", "name": "Faculty of Medicine and Surgery", "emails": ["fms@ust.edu.ph"]},
  {"key": "C06", "parentKey": null, "category": "College/Faculty", "name": "Faculty of Pharmacy", "emails": ["pharmacy@ust.edu.ph"]},
  {"key": "C07", "parentKey": null, "category": "College/Faculty", "name": "Faculty of Arts and Letters", "emails": ["office.ab@ust.edu.ph"]},
  {"key": "C08", "parentKey": null, "category": "College/Faculty", "name": "Faculty of Engineering", "emails": ["engineering.office@ust.edu.ph"]},
  {"key": "C09", "parentKey": null, "category": "College/Faculty", "name": "College of Education", "emails": ["education@ust.edu.ph"]},
  {"key": "C10", "parentKey": null, "category": "College/Faculty", "name": "College of Science", "emails": ["ustscience@ust.edu.ph"]},
  {"key": "C11", "parentKey": null, "category": "College/Faculty", "name": "College of Architecture", "emails": ["office.archi@ust.edu.ph"]},
  {"key": "C12", "parentKey": null, "category": "College/Faculty", "name": "College of Commerce and Business Administration", "emails": ["office.commerce@ust.edu.ph"]},
  {"key": "C13", "parentKey": null, "category": "College/Faculty", "name": "Graduate School", "emails": ["graduateschool@ust.edu.ph"]},
  {"key": "C14", "parentKey": null, "category": "College/Faculty", "name": "Conservatory of Music", "emails": ["music@ust.edu.ph"]},
  {"key": "C15", "parentKey": null, "category": "College/Faculty", "name": "College of Nursing", "emails": ["nursing@ust.edu.ph", "nursing.office@ust.edu.ph"]},
  {"key": "C16", "parentKey": null, "category": "College/Faculty", "name": "College of Rehabilitation Sciences", "emails": ["office.crs@ust.edu.ph"]},
  {"key": "C17", "parentKey": null, "category": "College/Faculty", "name": "College of Fine Arts and Design", "emails": ["cfad@ust.edu.ph"]},
  {"key": "C18", "parentKey": null, "category": "College/Faculty", "name": "Institute of Physical Education and Athletics", "emails": ["ipea@ust.edu.ph"]},
  {"key": "C19", "parentKey": null, "category": "College/Faculty", "name": "Alfredo M. Velayo College of Accountancy", "emails": ["college.accountancy@ust.edu.ph"]},
  {"key": "C20", "parentKey": null, "category": "College/Faculty", "name": "College of Tourism and Hospitality Management", "emails": ["cthm@ust.edu.ph"]},
  {"key": "C21", "parentKey": null, "category": "College/Faculty", "name": "College of Information and Computing Sciences", "emails": ["cics@ust.edu.ph"]},
  {"key": "C22", "parentKey": null, "category": "College/Faculty", "name": "Graduate School of Law", "emails": ["gslaw@ust.edu.ph"]},
  {"key": "C23", "parentKey": null, "category": "Basic Education", "name": "Senior High School", "emails": ["office.shs@ust.edu.ph"]},
  {"key": "C24", "parentKey": null, "category": "Basic Education", "name": "Junior High School", "emails": ["jhs@ust.edu.ph"]},
  {"key": "C25", "parentKey": null, "category": "Basic Education", "name": "Education High School", "emails": ["ehs@ust.edu.ph"]},
  {"key": "P001", "parentKey": "C06", "category": "Program/Department", "name": "Department of Biochemistry", "emails": ["biochem-pharmacy@ust.edu.ph"]},
  {"key": "P002", "parentKey": "C06", "category": "Program/Department", "name": "Department of Medical Technology", "emails": ["medtech-pharmacy@ust.edu.ph"]},
  {"key": "P003", "parentKey": "C07", "category": "Program/Department", "name": "Department of English", "emails": ["english.department@ust.edu.ph"]},
  {"key": "P004", "parentKey": "C07", "category": "Program/Department", "name": "Department of Journalism", "emails": ["journalism.ab@ust.edu.ph"]},
  {"key": "P005", "parentKey": "C07", "category": "Program/Department", "name": "Department of Literature", "emails": ["literature-ab@ust.edu.ph"]},
  {"key": "P006", "parentKey": "C07", "category": "Program/Department", "name": "Department of Modern Languages", "emails": ["modernlanguages-ab@ust.edu.ph"]},
  {"key": "P007", "parentKey": "C07", "category": "Program/Department", "name": "Department of Philosophy", "emails": ["philosophy-ab@ust.edu.ph"]},
  {"key": "P008", "parentKey": "C07", "category": "Program/Department", "name": "Department of Political Science", "emails": ["polsci-ab@ust.edu.ph"]},
  {"key": "P009", "parentKey": "C07", "category": "Program/Department", "name": "Department of Sociology", "emails": ["socio-ab@ust.edu.ph"]},
  {"key": "P010", "parentKey": "C08", "category": "Program/Department", "name": "Department of Chemical Engineering", "emails": ["chemical.eng@ust.edu.ph"]},
  {"key": "P011", "parentKey": "C08", "category": "Program/Department", "name": "Department of Civil Engineering", "emails": ["civil.eng@ust.edu.ph"]},
  {"key": "P012", "parentKey": "C08", "category": "Program/Department", "name": "Department of Electrical Engineering", "emails": ["electrical.eng@ust.edu.ph"]},
  {"key": "P013", "parentKey": "C08", "category": "Program/Department", "name": "Department of Electronics Engineering", "emails": ["ece.eng@ust.edu.ph"]},
  {"key": "P014", "parentKey": "C08", "category": "Program/Department", "name": "Department of Industrial Engineering", "emails": ["industrial.eng@ust.edu.ph"]},
  {"key": "P015", "parentKey": "C08", "category": "Program/Department", "name": "Department of Mechanical Engineering", "emails": ["me.eng@ust.edu.ph"]},
  {"key": "P016", "parentKey": "C09", "category": "Program/Department", "name": "Department of Filipino", "emails": ["fil.educ@ust.edu.ph"]},
  {"key": "P017", "parentKey": "C10", "category": "Program/Department", "name": "Department of Biological Sciences", "emails": ["biology.sci@ust.edu.ph"]},
  {"key": "P018", "parentKey": "C10", "category": "Program/Department", "name": "Department of Chemistry", "emails": ["chemistry.sci@ust.edu.ph"]},
  {"key": "P019", "parentKey": "C10", "category": "Program/Department", "name": "Department of Psychology", "emails": ["psychology.sci@ust.edu.ph"]},
  {"key": "P020", "parentKey": "C11", "category": "Program/Department", "name": "BS Architecture (Admissions)", "emails": ["bs.architecture.admission@ust.edu.ph"]},
  {"key": "P021", "parentKey": "C21", "category": "Program/Department", "name": "Department of Information Systems", "emails": ["is-chair.cics@ust.edu.ph", "ISenrollAdvise.cics@ust.edu.ph"]},
  {"key": "P022", "parentKey": "C22", "category": "Program/Department", "name": "Graduate School of Law Admissions", "emails": ["admissions.gslaw@ust.edu.ph"]},
  {"key": "A01", "parentKey": null, "category": "Administrative Office", "name": "Office of the Rector", "emails": ["rector.office@ust.edu.ph"]},
  {"key": "A02", "parentKey": null, "category": "Administrative Office", "name": "Office of the Vice-Rector", "emails": ["ovr.office@ust.edu.ph"]},
  {"key": "A03", "parentKey": null, "category": "Administrative Office", "name": "Office of the Vice-Rector for Academic Affairs", "emails": ["ovraa@ust.edu.ph"]},
  {"key": "A04", "parentKey": null, "category": "Administrative Office", "name": "Office of the Vice-Rector for Research and Innovation", "emails": ["ovrri@ust.edu.ph"]},
  {"key": "A05", "parentKey": null, "category": "Administrative Office", "name": "Office of the Vice-Rector for Religious Affairs", "emails": ["religiousaffairs@ust.edu.ph"]},
  {"key": "A06", "parentKey": null, "category": "Administrative Office", "name": "Office of the Vice-Rector for Finance", "emails": ["vrfinance@ust.edu.ph"]},
  {"key": "A07", "parentKey": "A06", "category": "Administrative Office", "name": "Finance - Payroll", "emails": ["payroll@ust.edu.ph"]},
  {"key": "A08", "parentKey": "A06", "category": "Administrative Office", "name": "Finance - Student Accounts", "emails": ["studentaccounts@ust.edu.ph"]},
  {"key": "A09", "parentKey": "A06", "category": "Administrative Office", "name": "Finance - Treasury Department", "emails": ["treasury@ust.edu.ph"]},
  {"key": "A10", "parentKey": null, "category": "Administrative Office", "name": "Office of the Secretary-General", "emails": ["secgen@ust.edu.ph"]},
  {"key": "A11", "parentKey": null, "category": "Administrative Office", "name": "Office for Student Affairs", "emails": ["osa@ust.edu.ph"]},
  {"key": "A12", "parentKey": null, "category": "Administrative Office", "name": "Office of the Registrar", "emails": ["registrar.office@ust.edu.ph"]},
  {"key": "A13", "parentKey": null, "category": "Administrative Office", "name": "Office for Admissions", "emails": ["ofad@ust.edu.ph"]},
  {"key": "A14", "parentKey": null, "category": "Administrative Office", "name": "Office of Alumni Relations", "emails": ["alumnirelations@ust.edu.ph"]},
  {"key": "A15", "parentKey": null, "category": "Administrative Office", "name": "Archives of the University of Santo Tomas", "emails": ["archives@ust.edu.ph"]},
  {"key": "A16", "parentKey": null, "category": "Administrative Office", "name": "Boletín Eclesiástico de Filipinas", "emails": ["boletin.eclesiastico@ust.edu.ph"]},
  {"key": "A17", "parentKey": null, "category": "Administrative Office", "name": "Center for Campus Ministry", "emails": ["campus.ministry@ust.edu.ph"]},
  {"key": "A18", "parentKey": null, "category": "Administrative Office", "name": "Communications Bureau", "emails": ["cb.communications@ust.edu.ph"]},
  {"key": "A19", "parentKey": null, "category": "Administrative Office", "name": "Community Development (SIMBAHAYAN)", "emails": ["simbahayan@ust.edu.ph", "simbahayan.office@ust.edu.ph"]},
  {"key": "A20", "parentKey": null, "category": "Administrative Office", "name": "National Service Training Program (NSTP)", "emails": ["office.nstp@ust.edu.ph"]},
  {"key": "A21", "parentKey": null, "category": "Administrative Office", "name": "Career Services and Placement Office", "emails": ["careerservices.placement@ust.edu.ph"]},
  {"key": "A22", "parentKey": null, "category": "Administrative Office", "name": "Guidance and Counseling Center", "emails": ["counseling.career.center@ust.edu.ph", "ccc.careerservices@ust.edu.ph"]},
  {"key": "A23", "parentKey": null, "category": "Administrative Office", "name": "Santo Tomas e-Service Providers (STePs) - Network Operations Center", "emails": ["steps@ust.edu.ph"]},
  {"key": "A24", "parentKey": "A23", "category": "Administrative Office", "name": "STePs - Software Development and Applications Office", "emails": ["stepshelpdesk@ust.edu.ph"]},
  {"key": "A25", "parentKey": "A23", "category": "Administrative Office", "name": "STePs - ID Room", "emails": ["idroom@ust.edu.ph"]},
  {"key": "A26", "parentKey": null, "category": "Administrative Office", "name": "Educational Technology Center", "emails": ["edtech.center@ust.edu.ph"]},
  {"key": "A27", "parentKey": null, "category": "Administrative Office", "name": "Facilities Management Office", "emails": ["facilities.management.office@ust.edu.ph"]},
  {"key": "A28", "parentKey": null, "category": "Administrative Office", "name": "Office for Faculty Evaluation and Development", "emails": ["ofed.office@ust.edu.ph"]},
  {"key": "A29", "parentKey": null, "category": "Administrative Office", "name": "Office for Grants, Endowments, and Partnerships in Higher Education", "emails": ["grants@ust.edu.ph"]},
  {"key": "A30", "parentKey": null, "category": "Administrative Office", "name": "Health Service", "emails": ["healthservice@ust.edu.ph"]},
  {"key": "A31", "parentKey": null, "category": "Administrative Office", "name": "Human Resource Department", "emails": ["hrd.office@ust.edu.ph", "hrd@ust.edu.ph"]},
  {"key": "A32", "parentKey": null, "category": "Administrative Office", "name": "Office of Information and Communications Technology", "emails": ["office.ict@ust.edu.ph"]},
  {"key": "A33", "parentKey": null, "category": "Administrative Office", "name": "TOMASinno Center", "emails": ["tomasinnocenter@ust.edu.ph"]},
  {"key": "A34", "parentKey": null, "category": "Administrative Office", "name": "Center for Innovative Teaching and Educational Delivery (CITED)", "emails": ["cited.office@ust.edu.ph"]},
  {"key": "A35", "parentKey": null, "category": "Administrative Office", "name": "Office of International Relations and Programs", "emails": ["international@ust.edu.ph"]},
  {"key": "A36", "parentKey": null, "category": "Administrative Office", "name": "Laboratory Equipment and Supplies Office (LESO)", "emails": ["leso@ust.edu.ph", "isc.leso@ust.edu.ph"]},
  {"key": "A37", "parentKey": null, "category": "Administrative Office", "name": "Miguel de Benavides Library", "emails": ["library@ust.edu.ph"]},
  {"key": "A38", "parentKey": null, "category": "Administrative Office", "name": "UST Museum", "emails": ["museum@ust.edu.ph"]},
  {"key": "A39", "parentKey": null, "category": "Administrative Office", "name": "Philippiniana Sacra", "emails": ["philippiniana.sacra@ust.edu.ph"]},
  {"key": "A40", "parentKey": null, "category": "Administrative Office", "name": "Office of Planning and Quality Management", "emails": ["opqm@ust.edu.ph", "iso-opqm@ust.edu.ph"]},
  {"key": "A41", "parentKey": null, "category": "Administrative Office", "name": "Office of the Property Custodian", "emails": ["propertycustodian.office@ust.edu.ph"]},
  {"key": "A42", "parentKey": null, "category": "Administrative Office", "name": "Office of Public Affairs", "emails": ["opa@ust.edu.ph"]},
  {"key": "A43", "parentKey": null, "category": "Administrative Office", "name": "Publishing House", "emails": ["publishing.bookstore@ust.edu.ph"]},
  {"key": "A44", "parentKey": null, "category": "Administrative Office", "name": "Purchasing Office", "emails": ["purchasing@ust.edu.ph"]},
  {"key": "A45", "parentKey": null, "category": "Administrative Office", "name": "Office of QS/THE Rankings", "emails": ["office.theranking@ust.edu.ph"]},
  {"key": "A46", "parentKey": null, "category": "Administrative Office", "name": "Institute of Religion", "emails": ["institute.religion@ust.edu.ph"]},
  {"key": "S01", "parentKey": "A11", "category": "Student Government", "name": "UST Central Student Council", "emails": ["csc@ust.edu.ph"]},
  {"key": "S02", "parentKey": "A11", "category": "Student Government", "name": "Student Organizations Coordinating Council (SOCC)", "emails": ["socc@ust.edu.ph"]},
  {"key": "S03", "parentKey": "A11", "category": "Student Government", "name": "UST Central Commission on Elections (COMELEC)", "emails": ["comelec@ust.edu.ph"]},
];
