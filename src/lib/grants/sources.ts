export type GrantSource = {
  name: string;
  abbreviation: string;
  url: string;
  category: "GOVT_GRANT" | "SCHOLARSHIP" | "RESEARCH_FUND" | "INDUSTRY_GRANT";
};

export const TRUSTED_SOURCES: GrantSource[] = [
  {
    name: "Department of Science and Technology",
    abbreviation: "DST",
    url: "https://www.dst.gov.in",
    category: "RESEARCH_FUND",
  },
  {
    name: "Department of Biotechnology",
    abbreviation: "DBT",
    url: "https://www.dbtindia.gov.in",
    category: "RESEARCH_FUND",
  },
  {
    name: "University Grants Commission",
    abbreviation: "UGC",
    url: "https://www.ugc.gov.in",
    category: "SCHOLARSHIP",
  },
  {
    name: "All India Council for Technical Education",
    abbreviation: "AICTE",
    url: "https://www.aicte-india.org",
    category: "SCHOLARSHIP",
  },
  {
    name: "Indian Council of Medical Research",
    abbreviation: "ICMR",
    url: "https://www.icmr.ac.in",
    category: "RESEARCH_FUND",
  },
  {
    name: "Ministry of Electronics and Information Technology",
    abbreviation: "MeitY",
    url: "https://www.meity.gov.in",
    category: "GOVT_GRANT",
  },
  {
    name: "NITI Aayog",
    abbreviation: "NITI Aayog",
    url: "https://www.niti.gov.in",
    category: "GOVT_GRANT",
  },
  {
    name: "Defence Research and Development Organisation",
    abbreviation: "DRDO",
    url: "https://drdo.gov.in",
    category: "RESEARCH_FUND",
  },
  {
    name: "Indian Space Research Organisation",
    abbreviation: "ISRO",
    url: "https://www.isro.gov.in",
    category: "RESEARCH_FUND",
  },
  {
    name: "Department of Higher Education",
    abbreviation: "DHE",
    url: "https://www.education.gov.in",
    category: "SCHOLARSHIP",
  },
];

export const GRANT_SOURCE_ABBREVIATIONS = TRUSTED_SOURCES.map((s) => s.abbreviation);
