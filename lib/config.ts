// ── Tunable matching / influence configuration ────────────────────────────────

/** Words stripped from company names before exact/fuzzy comparison. */
export const NAME_STOPWORDS = new Set([
  "ltd", "limited", "llc", "inc", "incorporated", "group", "holdings", "the",
  "plc", "services", "service", "solutions", "solution", "co", "corp",
  "corporation", "company", "pty", "pte", "gmbh", "llp", "lp", "sa", "bv",
  "ab", "nv", "as", "oy", "spa", "srl", "sdn", "bhd", "kk", "intl",
  "international", "uk", "usa",
]);

/** Free / personal email providers — never used for domain matching. */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.com.au",
  "hotmail.com", "hotmail.co.uk", "outlook.com", "outlook.co.uk", "live.com",
  "live.co.uk", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com",
  "protonmail.com", "proton.me", "gmx.com", "gmx.de", "mail.com", "zoho.com",
  "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "rediffmail.com",
  "btinternet.com", "sky.com", "talktalk.net", "virginmedia.com", "ymail.com",
]);

/** Multi-part public suffixes so registrable domains are extracted correctly. */
export const SECOND_LEVEL_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "gov.au", "edu.au",
  "co.nz", "net.nz", "org.nz", "govt.nz",
  "com.sg", "edu.sg", "gov.sg",
  "com.my", "gov.my", "com.hk", "com.cn", "com.tw", "co.jp", "co.kr", "co.in",
  "com.br", "com.mx", "co.za", "com.sa", "com.ae", "com.ph", "com.mo",
]);

/** Country aliases → normalized region code, used only for corroboration. */
export const COUNTRY_ALIASES: Record<string, string> = {
  "united kingdom": "GB", uk: "GB", "great britain": "GB", england: "GB",
  scotland: "GB", wales: "GB", "northern ireland": "GB", britain: "GB",
  "united states": "US", usa: "US", us: "US", "united states of america": "US",
  america: "US", australia: "AU", "new zealand": "NZ", canada: "CA",
  singapore: "SG", malaysia: "MY", china: "CN", "hong kong": "HK",
  ireland: "IE", germany: "DE", france: "FR", netherlands: "NL", belgium: "BE",
  spain: "ES", italy: "IT", india: "IN", japan: "JP", "south korea": "KR",
  "saudi arabia": "SA", uae: "AE", "united arab emirates": "AE",
  "south africa": "ZA", brazil: "BR", mexico: "MX", philippines: "PH",
  indonesia: "ID", thailand: "TH", vietnam: "VN", taiwan: "TW", macau: "MO",
};

/** Minimum fuzzy similarity (0–1) to accept a name match at all. */
export const FUZZY_THRESHOLD = 0.88;
/** Fuzzy similarity at/above which a corroborated match is High-adjacent. */
export const FUZZY_STRONG = 0.95;

/** How many days before deal creation a touch is still considered influential. */
export const LOOKBACK_DAYS = Number(process.env.INFLUENCE_LOOKBACK_DAYS ?? 730);

/** Cap on rows kept in the snapshot for the unmatched-activity audit list. */
export const MAX_UNMATCHED_ROWS = 500;
