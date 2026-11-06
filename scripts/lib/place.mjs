// Decides where an event happens: New York City, near it, elsewhere, online or
// unknown. Every question the site answers depends on this, so the tables live
// here and nowhere else.

const P = (name, lat, lng, re) => ({ name, lat, lng, re });

// Named New York places. A listing often says "Columbia University" and never
// says New York. Checked before anything else.
export const NYC_PLACES = [
  P("Columbia University", 40.8075, -73.9626, /\bcolumbia (?:university|law|journalism|business)\b|\bcolumbia climate school\b/i),
  P("Barnard College", 40.8091, -73.9636, /\bbarnard college\b/i),
  P("New York University", 40.7295, -73.9965, /\bnew york university\b|\bnyu\b/i),
  P("The New School", 40.7354, -73.9971, /\b(?:the )?new school\b/i),
  P("The Cooper Union", 40.7295, -73.9906, /\bcooper union\b/i),
  P("92NY", 40.7829, -73.9527, /\b92ny\b|\b92nd street y\b/i),
  P("The Strand", 40.7332, -73.9907, /\bstrand book ?store\b|\bthe strand\b/i),
  P("McNally Jackson", 40.7234, -73.9960, /\bmcnally jackson\b/i),
  P("Greenlight Bookstore", 40.6868, -73.9744, /\bgreenlight book/i),
  P("Books Are Magic", 40.6838, -73.9968, /\bbooks are magic\b/i),
  P("powerHouse Arena", 40.7029, -73.9893, /\bpowerhouse arena\b/i),
  P("Housing Works Bookstore", 40.7248, -73.9975, /\bhousing works book/i),
  P("The Town Hall", 40.7571, -73.9844, /\bthe town hall,? (?:new york|nyc|123)\b/i),
  P("Bruno Walter Auditorium", 40.7732, -73.9838, /\bbruno walter\b/i),
  P("Lincoln Center", 40.7725, -73.9835, /\blincoln center\b/i),
  P("New York Public Library", 40.7532, -73.9822, /\bnew york public library\b|\bnypl\b/i),
  P("Brooklyn Public Library", 40.6725, -73.9681, /\bbrooklyn public library\b|\bcenter for brooklyn history\b/i),
  P("Brooklyn Academy of Music", 40.6864, -73.9776, /\bbrooklyn academy of music\b/i),
  P("NY Society for Ethical Culture", 40.7727, -73.9783, /\bethical culture\b/i),
  P("CUNY Graduate Center", 40.7484, -73.9835, /\b(?:cuny )?graduate center\b/i),
  P("Hunter College", 40.7685, -73.9648, /\bhunter college\b|\broosevelt house\b/i),
  P("The Explorers Club", 40.7656, -73.9650, /\bexplorers club\b/i),
  P("Asia Society", 40.7699, -73.9645, /\basia society\b/i),
  P("Council on Foreign Relations", 40.7687, -73.9657, /\bcouncil on foreign relations\b/i),
  P("Albertine", 40.7766, -73.9638, /\balbertine\b/i),
  P("Rizzoli Bookstore", 40.7442, -73.9892, /\brizzoli book/i),
  P("Book Culture", 40.8050, -73.9660, /\bbook culture\b/i),
  P("Union Theological Seminary", 40.8111, -73.9620, /\bunion theological\b/i),
  P("The Riverside Church", 40.8116, -73.9630, /\briverside church\b/i),
  P("Judson Memorial Church", 40.7305, -73.9988, /\bjudson memorial\b/i),
  P("Pioneer Works", 40.6787, -74.0127, /\bpioneer works\b/i),
  P("Rubin Museum", 40.7403, -73.9978, /\brubin museum\b/i),
  P("Museum of the City of New York", 40.7925, -73.9519, /\bmuseum of the city of new york\b|\bmcny\b/i),
  P("American Museum of Natural History", 40.7813, -73.9740, /\bamerican museum of natural history\b|\bamnh\b/i),
  P("The Climate Museum", 40.7306, -73.9866, /\bclimate museum\b/i),
  P("United Nations", 40.7489, -73.9680, /\bunited nations headquarters\b/i),
  P("Carnegie Hall", 40.7651, -73.9799, /\bcarnegie hall\b/i),
];

// Phrases that contain a place name and say nothing about where an event is.
const NOT_A_PLACE =
  /\bnew york (?:times|review|magazine|post|daily news|yankees|mets|knicks|rangers|giants|jets|state of mind)\b|\bnew yorker\b/gi;

const NYC_RE = /\bnew york city\b|\bnew york,? (?:ny|n\.y\.)\b|\bnyc\b|\bmanhattan\b|\bbrooklyn\b|\bqueens,? (?:ny|new york)\b|\bthe bronx\b|\bbronx,? (?:ny|new york)\b|\bstaten island\b|\bgovernors island\b|\bnew york\b/i;
const NYC_CENTER = { lat: 40.7306, lng: -73.9866 };

// About two hours away or less: close enough to ask someone to stay a night.
const NEAR = [
  P("Princeton, NJ", 40.3431, -74.6551, /\bprinceton\b/i),
  P("New Haven, CT", 41.3083, -72.9279, /\bnew haven\b|\byale\b/i),
  P("Philadelphia, PA", 39.9526, -75.1652, /\bphiladelphia\b|\buniversity of pennsylvania\b|\bupenn\b/i),
  P("Newark, NJ", 40.7357, -74.1724, /\bnewark,? (?:nj|new jersey)\b/i),
  P("Jersey City, NJ", 40.7178, -74.0431, /\bjersey city\b/i),
  P("Hoboken, NJ", 40.7440, -74.0324, /\bhoboken\b/i),
  P("Montclair, NJ", 40.8259, -74.2090, /\bmontclair\b/i),
  P("New Brunswick, NJ", 40.4862, -74.4518, /\bnew brunswick,? (?:nj|new jersey)\b|\brutgers\b/i),
  P("Westport, CT", 41.1415, -73.3579, /\bwestport\b/i),
  P("Stamford, CT", 41.0534, -73.5387, /\bstamford\b/i),
  P("Hartford, CT", 41.7658, -72.6734, /\bhartford\b/i),
  P("Long Island, NY", 40.7891, -73.1350, /\blong island\b|\bstony brook\b|\bhuntington,? ny\b/i),
  P("Hudson Valley, NY", 41.7004, -73.9210, /\bhudson valley\b|\bpoughkeepsie\b|\bvassar\b|\bbard college\b|\bbeacon,? ny\b|\bkingston,? ny\b|\bgarrison,? ny\b|\bhastings[- ]on[- ]hudson\b|\btarrytown\b|\bwhite plains\b/i),
];
const NEAR_STATE_RE = /,\s*(?:NJ|CT|N\.J\.|New Jersey|Connecticut)\b|\bNew Jersey\b/;

// Cities authors tour through. Case-sensitive on purpose, so "reading" and
// "nice" stay ordinary words.
const CITIES = {
  "Abu Dhabi": [24.4539, 54.3773], Accra: [5.6037, -0.187], Amsterdam: [52.3676, 4.9041], Athens: [37.9838, 23.7275], Atlanta: [33.749, -84.388],
  Auckland: [-36.8509, 174.7645], Austin: [30.2672, -97.7431], Bangalore: [12.9716, 77.5946], Barcelona: [41.3851, 2.1734], Beijing: [39.9042, 116.4074],
  Bellingham: [48.7519, -122.4787], Berkeley: [37.8716, -122.2727], Berlin: [52.52, 13.405], Bogotá: [4.711, -74.0721], Boston: [42.3601, -71.0589],
  Boulder: [40.015, -105.2705], Brussels: [50.8503, 4.3517], Bucharest: [44.4268, 26.1025], "Buenos Aires": [-34.6037, -58.3816], Cambridge: [42.3736, -71.1097],
  "Cape Town": [-33.9249, 18.4241], Chicago: [41.8781, -87.6298], Cologne: [50.9375, 6.9603], Copenhagen: [55.6761, 12.5683], Courtenay: [49.6841, -124.9936], Folkestone: [51.0814, 1.1664], Antwerp: [51.2194, 4.4025], "The Hague": [52.0705, 4.3007], Pavia: [45.1847, 9.1582], Turin: [45.0703, 7.6869], Modena: [44.6471, 10.9252], Dallas: [32.7767, -96.797],
  Delhi: [28.7041, 77.1025], Denver: [39.7392, -104.9903], Detroit: [42.3314, -83.0458], Dublin: [53.3498, -6.2603], Durham: [54.7761, -1.5733],
  Edinburgh: [55.9533, -3.1883], Geneva: [46.2044, 6.1432], Glasgow: [55.8642, -4.2518], Hamburg: [53.5511, 9.9937], Helsinki: [60.1699, 24.9384],
  "Hong Kong": [22.3193, 114.1694], Houston: [29.7604, -95.3698], Istanbul: [41.0082, 28.9784], Kilkenny: [52.6541, -7.2448], Lisbon: [38.7223, -9.1393],
  London: [51.5072, -0.1276], "Los Angeles": [34.0522, -118.2437], Madrid: [40.4168, -3.7038], Melbourne: [-37.8136, 144.9631], "Mexico City": [19.4326, -99.1332],
  Miami: [25.7617, -80.1918], Milan: [45.4642, 9.19], Minneapolis: [44.9778, -93.265], Montreal: [45.5019, -73.5674], Mumbai: [19.076, 72.8777],
  Munich: [48.1351, 11.582], Nairobi: [-1.2921, 36.8219], Oakland: [37.8044, -122.2712], Oslo: [59.9139, 10.7522], Ottawa: [45.4215, -75.6972],
  Oxford: [51.752, -1.2577], Paris: [48.8566, 2.3522], Portland: [45.5152, -122.6784], Prague: [50.0755, 14.4378], Rio: [-22.9068, -43.1729],
  Rome: [41.9028, 12.4964], "San Diego": [32.7157, -117.1611], "San Francisco": [37.7749, -122.4194], "Santa Fe": [35.687, -105.9378], "São Paulo": [-23.5558, -46.6396],
  Seattle: [47.6062, -122.3321], Seoul: [37.5665, 126.978], Shanghai: [31.2304, 121.4737], Sheffield: [53.3811, -1.4701], Singapore: [1.3521, 103.8198], Stanford: [37.4275, -122.1697],
  Stockholm: [59.3293, 18.0686], Sydney: [-33.8688, 151.2093], Taipei: [25.033, 121.5654], "Tel Aviv": [32.0853, 34.7818], Tokyo: [35.6762, 139.6503],
  Toronto: [43.6532, -79.3832], Vancouver: [49.2827, -123.1207], Vienna: [48.2082, 16.3738], "Washington, D.C.": [38.9072, -77.0369], "Washington, DC": [38.9072, -77.0369],
  Zurich: [47.3769, 8.5417],
};
const CITY_LIST = Object.entries(CITIES)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([name, [lat, lng]]) => ({ name, lat, lng, re: new RegExp(`(?<![\\w])${name.replace(/[.,]/g, "\\$&")}(?![\\w])`) }));

// "Collegio Borromeo, Pavia, Italy": a location that ends in a country or a
// US state is elsewhere, even when the town is not in the table above.
const COUNTRY = "Italy|UK|U\\.K\\.|United Kingdom|England|Scotland|Wales|Ireland|France|Germany|Spain|Portugal|Belgium|Netherlands|The Netherlands|Norway|Sweden|Denmark|Finland|Iceland|Switzerland|Austria|Greece|Israel|Canada|Mexico|Brazil|Argentina|Chile|Colombia|Peru|India|China|Japan|South Korea|Korea|Taiwan|Australia|New Zealand|Ghana|Kenya|South Africa|Nigeria|Turkey|Romania|Poland|Hungary|Czech Republic|UAE";
const STATE = "AL|AK|AZ|AR|CA|CO|DC|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NM|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|BC|ON|QC|AB";
const ENDS_ABROAD = new RegExp(`([^,\\n\\d]{2,40},\\s*(?:${COUNTRY}|${STATE}))\\b(?![a-z])`);

const ONLINE_RE = /\b(?:online|virtual(?:ly)?|zoom|webinar|livestream|live stream|google meet)\b/i;
// "Bellingham, WA" or "Rome, Italy": a line that is only a place.
const PLACE_LINE_RE = /^[A-Z][\p{L}.'’ -]{1,34},\s*(?:[A-Z]{2}|[A-Z]\.[A-Z]\.|[A-Z][\p{L}]+(?: [A-Z][\p{L}]+){0,2})\.?$/u;

export const looksLikePlace = (line) => {
  const t = String(line ?? "").trim();
  if (!t || t.length > 40) return false;
  if (PLACE_LINE_RE.test(t) || /^(?:online|virtual)\b/i.test(t)) return true;
  // All-caps city lines, "OAKLAND, CA".
  if (/^[A-Z .'-]+,\s*[A-Z]{2}$/.test(t)) return true;
  return CITY_LIST.some((c) => c.name === t);
};

const titleCase = (s) => (/[a-z]/.test(s) ? s : s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/,\s*(\w\w)$/, (m, st) => `, ${st.toUpperCase()}`));

function test(text, { abroad = true } = {}) {
  // A university's overseas campus is that city, not New York.
  const t = String(text ?? "")
    .replace(/\b(?:nyu|new york university) (abu dhabi|shanghai)\b/gi, (_, city) => city.replace(/\b[a-z]/g, (c) => c.toUpperCase()))
    .replace(NOT_A_PLACE, " ");
  if (!t.trim()) return null;
  for (const p of NYC_PLACES) if (p.re.test(t)) return { region: "nyc", place: p.name, lat: p.lat, lng: p.lng };
  if (NYC_RE.test(t)) return { region: "nyc", place: "New York", ...NYC_CENTER, approx: true };
  for (const p of NEAR) if (p.re.test(t)) return { region: "near", place: p.name, lat: p.lat, lng: p.lng, approx: true };
  if (NEAR_STATE_RE.test(t)) return { region: "near", place: t.match(/[^,\n]{2,40},\s*(?:NJ|CT|N\.J\.|New Jersey|Connecticut)\b/)?.[0]?.trim() ?? "New Jersey", lat: null, lng: null };
  // Any other New York state town is within a few hours.
  if (/,\s*(?:NY|N\.Y\.)\b/.test(t)) return { region: "near", place: t.match(/[^,\n]{2,40},\s*(?:NY|N\.Y\.)\b/)?.[0]?.trim() ?? null, lat: null, lng: null };
  for (const c of CITY_LIST) if (c.re.test(t)) return { region: "elsewhere", place: c.name, lat: c.lat, lng: c.lng, approx: true };
  const ends = abroad && t.match(ENDS_ABROAD);
  if (ends) return { region: "elsewhere", place: titleCase(ends[1].trim()), lat: null, lng: null };
  const line = t.trim();
  if (looksLikePlace(line) && !/^(?:online|virtual)\b/i.test(line)) return { region: "elsewhere", place: titleCase(line), lat: null, lng: null };
  return null;
}

// `location` is the feed's own location field. `text` is the rest of the
// listing, used only when the location says nothing. A location field wins
// because a talk in Rome can mention The New York Review in its title.
export function classify({ location, text, online = false } = {}) {
  if (online) return { region: "online", place: "Online", lat: null, lng: null };
  const byLocation = test(location);
  if (byLocation) return byLocation;
  if (location && ONLINE_RE.test(location)) return { region: "online", place: "Online", lat: null, lng: null };
  // Free text is weaker evidence, so "on Zoom" outranks a stray ", UK time".
  const byText = test(text, { abroad: false });
  if (byText) return byText;
  if (ONLINE_RE.test(text ?? "")) return { region: "online", place: "Online", lat: null, lng: null };
  const loose = test(text);
  if (loose) return loose;
  return { region: "unknown", place: location?.trim() || null, lat: null, lng: null };
}
