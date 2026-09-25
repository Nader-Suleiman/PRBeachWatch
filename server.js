import express from "express";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";

const app = express();

const PORT =
  process.env.PORT || 3000;

const NWS_UA =
  process.env.NWS_USER_AGENT ||
  "PRBeachWatch/1.0 (set-contact-email-in-env)";

const DRNA_CATEGORY =
  "https://www.drna.pr.gov/cat/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/";

const NWS_SRF =
  "https://forecast.weather.gov/product.php?site=NWS&issuedby=SJU&product=SRF&format=CI&version=1&glossary=0";

const NWS_ALERTS =
  "https://api.weather.gov/alerts/active?area=PR";


/* =========================================================
   UPDATE INTERVALS
   ========================================================= */

const NWS_ALERT_INTERVAL =
  5 * 60_000;

const NWS_SURF_INTERVAL =
  15 * 60_000;

const DRNA_INTERVAL =
  60 * 60_000;

const NWS_SURF_MAX_AGE =
  24 * 60 * 60_000;


/* =========================================================
   LOCAL STATIC FILES

   This works locally.

   Vercel serves public/ through its CDN instead.
   ========================================================= */

app.use(
  express.static("public")
);


/* =========================================================
   HOME PAGE

   On Vercel, /index.html is served from public/
   by Vercel's CDN.

   This route fixes "Cannot GET /".
   ========================================================= */

app.get(
  "/",
  (_req, res) => {

    res.redirect(
      302,
      "/index.html"
    );

  }
);


/* =========================================================
   CACHE
   ========================================================= */

const cache =
  new Map();

const pendingLoads =
  new Map();


const sourceStatus = {

  nwsAlerts: {

    intervalMinutes: 5,

    lastAttempt: null,

    lastSuccess: null,

    lastError: null

  },

  nwsSurf: {

    intervalMinutes: 15,

    lastAttempt: null,

    lastSuccess: null,

    lastError: null

  },

  drna: {

    intervalMinutes: 60,

    lastAttempt: null,

    lastSuccess: null,

    lastError: null

  }

};


/* =========================================================
   CACHE HELPERS
   ========================================================= */

async function cached(
  key,
  ttlMs,
  loader,
  force = false
) {

  const hit =
    cache.get(key);


  if (
    !force &&
    hit &&
    Date.now() - hit.time < ttlMs
  ) {

    return hit.value;

  }


  if (
    pendingLoads.has(key)
  ) {

    return pendingLoads.get(key);

  }


  const promise =

    loader()

      .then(
        value => {

          cache.set(

            key,

            {

              time:
                Date.now(),

              value

            }

          );


          return value;

        }
      )

      .finally(
        () => {

          pendingLoads.delete(
            key
          );

        }
      );


  pendingLoads.set(
    key,
    promise
  );


  return promise;

}


function cacheTimeIso(
  key
) {

  const hit =
    cache.get(key);


  return hit

    ?

    new Date(
      hit.time
    ).toISOString()

    :

    null;

}


/* =========================================================
   HTTP
   ========================================================= */

async function getJSON(
  url
) {

  const response =

    await fetch(

      url,

      {

        headers: {

          "User-Agent":
            NWS_UA,

          Accept:
            "application/geo+json"

        }

      }

    );


  if (
    !response.ok
  ) {

    throw new Error(
      `HTTP ${response.status} from ${url}`
    );

  }


  return response.json();

}


async function getText(
  url,
  headers = {}
) {

  const response =

    await fetch(

      url,

      {

        headers: {

          "User-Agent":
            NWS_UA,

          ...headers

        }

      }

    );


  if (
    !response.ok
  ) {

    throw new Error(
      `HTTP ${response.status} from ${url}`
    );

  }


  return response.text();

}


/* =========================================================
   BEACH LIST
   ========================================================= */

async function loadBeaches() {

  const raw =

    await fs.readFile(

      new URL(
        "./data/beaches.json",
        import.meta.url
      ),

      "utf8"

    );


  return JSON.parse(
    raw
  );

}


/* =========================================================
   STRING HELPERS
   ========================================================= */

function normalize(
  value = ""
) {

  return String(
    value
  )

    .normalize(
      "NFD"
    )

    .replace(
      /[\u0300-\u036f]/g,
      ""
    )

    .toLowerCase();

}


function escapeRegExp(
  value = ""
) {

  return String(
    value
  ).replace(

    /[.*+?^${}()|[\]\\]/g,

    "\\$&"

  );

}


function containsWholePhrase(
  haystack = "",
  needle = ""
) {

  const h =
    normalize(
      haystack
    );


  const n =
    normalize(
      needle
    ).trim();


  if (
    !n
  ) {

    return false;

  }


  return new RegExp(

    `(^|[^a-z0-9])${escapeRegExp(n)}([^a-z0-9]|$)`,

    "i"

  ).test(
    h
  );

}


/* =========================================================
   DATE HELPERS
   ========================================================= */

const EN_MONTHS = {

  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11

};


const ES_MONTHS = {

  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11

};


/* =========================================================
   NWS ISSUE TIME
   ========================================================= */

function parseNwsAstIssueTime(
  text = ""
) {

  const match =

    text.match(

      /\b(\d{3,4})\s+(AM|PM)\s+AST\s+(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(20\d{2})\b/i

    );


  if (
    !match
  ) {

    return {

      text:
        null,

      iso:
        null

    };

  }


  const hhmm =
    match[1].padStart(
      4,
      "0"
    );


  let hour =
    Number(
      hhmm.slice(
        0,
        2
      )
    );


  const minute =
    Number(
      hhmm.slice(
        2
      )
    );


  const ampm =
    match[2].toUpperCase();


  const month =
    EN_MONTHS[
      match[3].toLowerCase()
    ];


  const day =
    Number(
      match[4]
    );


  const year =
    Number(
      match[5]
    );


  if (
    ampm === "AM" &&
    hour === 12
  ) {

    hour = 0;

  }


  if (
    ampm === "PM" &&
    hour !== 12
  ) {

    hour += 12;

  }


  const utc =

    Date.UTC(

      year,

      month,

      day,

      hour + 4,

      minute,

      0,

      0

    );


  return {

    text:
      match[0],

    iso:
      new Date(
        utc
      ).toISOString()

  };

}


/* =========================================================
   SPANISH DATE
   ========================================================= */

function parseSpanishDate(
  text = ""
) {

  const match =

    text.match(

      /\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(20\d{2})\b/i

    );


  if (
    !match
  ) {

    return {

      text:
        null,

      isoDate:
        null

    };

  }


  const month =

    ES_MONTHS[
      normalize(
        match[2]
      )
    ];


  if (
    month === undefined
  ) {

    return {

      text:
        match[0],

      isoDate:
        null

    };

  }


  const day =

    String(
      Number(
        match[1]
      )
    ).padStart(
      2,
      "0"
    );


  const monthNumber =

    String(
      month + 1
    ).padStart(
      2,
      "0"
    );


  return {

    text:
      match[0],

    isoDate:
      `${match[3]}-${monthNumber}-${day}`

  };

}


/* =========================================================
   SHORT DATE
   ========================================================= */

function parseEnglishShortDate(
  text = ""
) {

  const match =

    text.match(

      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(20\d{2})\b/i

    );


  if (
    !match
  ) {

    return {

      text:
        null,

      isoDate:
        null

    };

  }


  const month =
    EN_MONTHS[
      match[2].toLowerCase()
    ];


  const day =

    String(
      Number(
        match[1]
      )
    ).padStart(
      2,
      "0"
    );


  const monthNumber =

    String(
      month + 1
    ).padStart(
      2,
      "0"
    );


  return {

    text:
      match[0],

    isoDate:
      `${match[3]}-${monthNumber}-${day}`

  };

}


/* =========================================================
   FRESHNESS
   ========================================================= */

function isRecentIso(
  iso,
  maxAgeMs
) {

  if (
    !iso
  ) {

    return null;

  }


  const timestamp =
    Date.parse(
      iso
    );


  if (
    Number.isNaN(
      timestamp
    )
  ) {

    return null;

  }


  const age =
    Date.now() - timestamp;


  return (

    age >=
    -2 * 60 * 60_000

    &&

    age <=
    maxAgeMs

  );

}


/* =========================================================
   NWS ALERTS
   ========================================================= */

async function fetchNwsAlerts(
  force = false
) {

  return cached(

    "nws-alerts",

    NWS_ALERT_INTERVAL,

    async () => {

      const json =
        await getJSON(
          NWS_ALERTS
        );


      return (

        json.features || []

      ).map(

        feature => ({

          event:
            feature.properties?.event,

          headline:
            feature.properties?.headline,

          severity:
            feature.properties?.severity,

          urgency:
            feature.properties?.urgency,

          sent:
            feature.properties?.sent,

          effective:
            feature.properties?.effective,

          onset:
            feature.properties?.onset,

          expires:
            feature.properties?.expires,

          ends:
            feature.properties?.ends,

          areaDesc:
            feature.properties?.areaDesc,

          description:
            feature.properties?.description,

          instruction:
            feature.properties?.instruction,

          geocode:
            feature.properties?.geocode || null,

          source:
            "NWS San Juan"

        })

      );

    },

    force

  );

}


/* =========================================================
   NWS SURF FORECAST
   ========================================================= */

function parseSurfForecast(
  rawText,
  beaches
) {

  const text =
    rawText.replace(
      /\r/g,
      ""
    );


  const issue =
    parseNwsAstIssueTime(
      text
    );


  const sections =

    text.split(
      /\n(?=PRZ\d{3}-)/
    );


  const byBeach =
    {};


  for (
    const beach
    of beaches
  ) {


    const municipality =
      normalize(
        beach.municipality
      );


    const section =

      sections.find(

        sectionText => {

          const header =

            sectionText

              .split(
                "\n"
              )

              .slice(
                0,
                5
              )

              .join(
                " "
              );


          return normalize(
            header
          ).includes(
            municipality
          );

        }

      );


    if (
      !section
    ) {

      byBeach[
        beach.id
      ] = {

        ripCurrent:
          "Unknown",

        surfHeight:
          "Unknown",

        forecastPeriod:
          null,

        forecastIssuedAt:
          issue.iso,

        forecastIssuedText:
          issue.text,

        zoneCode:
          null,

        zoneName:
          null,

        source:
          "NWS San Juan Surf Zone Forecast"

      };


      continue;

    }


    const lines =

      section

        .split(
          "\n"
        )

        .map(
          line =>
            line.trim()
        )

        .filter(
          Boolean
        );


    const zoneCode =

      lines[0]

        ?.match(
          /^(PRZ\d{3})-/i
        )

        ?.[1]

        ?.toUpperCase()

      ||

      null;


    const zoneName =

      lines[1]

        ?.replace(
          /-$/,
          ""
        )

        .trim()

      ||

      null;


    const periodMatch =

      section.match(

        /\n\.([A-Z][A-Z0-9 /'-]*)\.\.\.([\s\S]*?)(?=\n\.[A-Z][A-Z0-9 /'-]*\.\.\.|\n&&|\n\$\$|$)/

      );


    const block =

      periodMatch

        ?

        periodMatch[2]

        :

        section;


    const forecastPeriod =

      periodMatch

        ?

        periodMatch[1].trim()

        :

        null;


    const rip =

      block.match(

        /Rip Current Risk\*?\.*\s*(Low|Moderate|High)/i

      );


    const surf =

      block.match(

        /Surf Height\.*\s*([^\n]+)/i

      );


    byBeach[
      beach.id
    ] = {

      ripCurrent:

        rip

          ?

          rip[1][0].toUpperCase()

          +

          rip[1]
            .slice(1)
            .toLowerCase()

          :

          "Unknown",

      surfHeight:

        surf

          ?

          surf[1]
            .trim()
            .replace(
              /\s+/g,
              " "
            )

          :

          "Unknown",

      forecastPeriod,

      forecastIssuedAt:
        issue.iso,

      forecastIssuedText:
        issue.text,

      zoneCode,

      zoneName,

      source:
        "NWS San Juan Surf Zone Forecast"

    };

  }


  return byBeach;

}


async function fetchSurfForecast(
  beaches,
  force = false
) {

  return cached(

    "nws-srf",

    NWS_SURF_INTERVAL,

    async () => {

      const html =
        await getText(
          NWS_SRF
        );


      const $ =
        cheerio.load(
          html
        );


      const text =
        $("body").text();


      return parseSurfForecast(
        text,
        beaches
      );

    },

    force

  );

}


/* =========================================================
   DRNA
   ========================================================= */

function parseDrnaArticle(
  html
) {

  const $ =
    cheerio.load(
      html
    );


  const bodyText =

    $("body")

      .text()

      .replace(
        /\u00a0/g,
        " "
      )

      .replace(
        /[ \t]+/g,
        " "
      );


  const negativeAllSafe =

    /no\s+(?:son|se\s+encuentran)\s+aptas?\s+para\s+bañistas/i

      .test(
        bodyText
      );


  const positiveAllSafe =

    /se\s+encuentran\s+aptas?\s+para\s+bañistas|todas\s+las\s+playas[\s\S]{0,160}aptas?\s+para\s+bañistas/i

      .test(
        bodyText
      );


  const allSafe =

    positiveAllSafe

    &&

    !negativeAllSafe;


  const unsafe =
    [];


  $("table tr").each(

    (
      _,
      tr
    ) => {

      const cells =

        $(tr)

          .find(
            "td"
          )

          .map(

            (
              __,
              td
            ) =>

              $(td)
                .text()
                .trim()

          )

          .get();


      if (

        cells.length >= 2

        &&

        /^RW-/i.test(
          cells[0]
        )

      ) {

        unsafe.push({

          stationId:
            cells[0]
              .trim()
              .toUpperCase(),

          name:
            cells[1]?.trim() || "",

          municipality:
            cells[2]?.trim() || ""

        });

      }

    }

  );


  if (
    !unsafe.length &&
    !allSafe
  ) {

    const lines =

      bodyText

        .split(
          /\n+/
        )

        .map(
          line =>
            line.trim()
        )

        .filter(
          Boolean
        );


    const seen =
      new Set();


    for (
      const line
      of lines
    ) {

      const matches =

        [
          ...line.matchAll(
            /\b(RW-[0-9A-Z]+)\b/gi
          )
        ];


      for (
        const match
        of matches
      ) {

        const stationId =
          match[1].toUpperCase();


        if (
          !seen.has(
            stationId
          )
        ) {

          seen.add(
            stationId
          );


          unsafe.push({

            stationId,

            name:
              "",

            municipality:
              ""

          });

        }

      }

    }

  }


  const headingText =

    $("h1, h2, h3")

      .map(

        (
          _,
          element
        ) =>

          $(element)
            .text()
            .trim()

      )

      .get()

      .join(
        " "
      );


  const timeDatetime =

    $("time[datetime]")

      .first()

      .attr(
        "datetime"
      )

    ||

    null;


  const headingDate =
    parseEnglishShortDate(
      headingText
    );


  let noticeDateISO =
    null;


  if (
    timeDatetime
  ) {

    const parsed =
      Date.parse(
        timeDatetime
      );


    if (
      !Number.isNaN(
        parsed
      )
    ) {

      noticeDateISO =

        new Date(
          parsed
        )

          .toISOString()

          .slice(
            0,
            10
          );

    }

  }


  if (
    !noticeDateISO
  ) {

    noticeDateISO =
      headingDate.isoDate;

  }


  const sampleMatch =

    bodyText.match(

      /resultados\s+de\s+los\s+muestreos\s+del\s+(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2})/i

    );


  const sampleDate =

    sampleMatch

      ?

      parseSpanishDate(
        sampleMatch[1]
      )

      :

      {

        text:
          null,

        isoDate:
          null

      };


  return {

    allSafe,

    unsafe,

    noticeDate:
      headingDate.text,

    noticeDateISO,

    sampleDate:
      sampleDate.text,

    sampleDateISO:
      sampleDate.isoDate

  };

}


async function fetchDrnaNotice(
  force = false
) {

  return cached(

    "drna",

    DRNA_INTERVAL,

    async () => {

      const categoryHtml =
        await getText(
          DRNA_CATEGORY
        );


      const $ =
        cheerio.load(
          categoryHtml
        );


      let href =
        null;


      $("a").each(

        (
          _,
          a
        ) => {

          const link =
            $(a).attr(
              "href"
            );


          const text =
            $(a).text();


          if (

            !href

            &&

            link

            &&

            /notificacion-monitoria-de-playas/i.test(
              link
            )

            &&

            /Notificación Monitoria de Playas/i.test(
              text
            )

          ) {

            href =
              link;

          }

        }

      );


      if (
        !href
      ) {

        throw new Error(
          "Could not locate the latest DRNA beach notice."
        );

      }


      const articleUrl =

        new URL(
          href,
          DRNA_CATEGORY
        ).href;


      const articleHtml =
        await getText(
          articleUrl
        );


      return {

        ...parseDrnaArticle(
          articleHtml
        ),

        url:
          articleUrl,

        source:
          "Puerto Rico DRNA"

      };

    },

    force

  );

}


/* =========================================================
   ALERT MATCHING
   ========================================================= */

function areaMatchesBeach(
  areaDesc = "",
  beach
) {

  return containsWholePhrase(
    areaDesc,
    beach.municipality
  );

}


function zoneMatchesAlert(
  alert,
  surfData
) {

  const zoneCode =
    surfData?.zoneCode;


  if (
    !zoneCode
  ) {

    return false;

  }


  const ugc =
    alert.geocode?.UGC;


  return (

    Array.isArray(
      ugc
    )

    &&

    ugc

      .map(
        code =>
          String(
            code
          ).toUpperCase()
      )

      .includes(
        zoneCode.toUpperCase()
      )

  );

}


function relevantAlerts(
  alerts,
  beach,
  surfData
) {

  const marineWords =

    /(rip current|high surf|coastal flood|storm surge|tropical storm|hurricane)/i;


  return alerts.filter(

    alert => {

      const text =

        `${alert.event || ""} ${alert.headline || ""}`;


      if (
        !marineWords.test(
          text
        )
      ) {

        return false;

      }


      return (

        areaMatchesBeach(
          alert.areaDesc,
          beach
        )

        ||

        zoneMatchesAlert(
          alert,
          surfData
        )

      );

    }

  );

}


/* =========================================================
   STATUS
   ========================================================= */

function computeStatus({

  drnaUnsafe,

  ripCurrent,

  alerts,

  nwsSurfStale

}) {


  if (
    drnaUnsafe
  ) {

    return {

      code:
        "avoid",

      label:
        "WATER QUALITY ADVISORY",

      reason:
        "DRNA lists this monitored site as not suitable for bathers in the latest notice."

    };

  }


  const dangerousAlert =

    alerts.some(

      alert =>

        /(Rip Current Statement|High Surf Warning|High Surf Advisory|Coastal Flood Warning|Coastal Flood Advisory|Storm Surge Warning|Hurricane Warning|Tropical Storm Warning)/i

          .test(
            alert.event || ""
          )

    );


  if (
    dangerousAlert
  ) {

    return {

      code:
        "high",

      label:
        "HIGH RISK",

      reason:
        "An active NWS coastal, surf, or tropical hazard applies to this beach area."

    };

  }


  if (
    nwsSurfStale
  ) {

    return {

      code:
        "unknown",

      label:
        "CHECK CONDITIONS",

      reason:
        "The NWS surf forecast available to PR Beach Watch is more than 24 hours old, so it is not being presented as current."

    };

  }


  if (
    ripCurrent === "High"
  ) {

    return {

      code:
        "high",

      label:
        "HIGH RISK",

      reason:
        "NWS reports high rip-current risk for this surf forecast zone."

    };

  }


  if (
    ripCurrent === "Moderate"
  ) {

    return {

      code:
        "caution",

      label:
        "CAUTION",

      reason:
        "NWS reports moderate rip-current risk for this surf forecast zone."

    };

  }


  if (
    ripCurrent === "Low"
  ) {

    return {

      code:
        "low",

      label:
        "LOW RISK",

      reason:
        "NWS reports low rip-current risk for this surf forecast zone. Low risk does not mean no risk."

    };

  }


  return {

    code:
      "unknown",

    label:
      "CHECK CONDITIONS",

    reason:
      "Current structured beach-risk data is unavailable for this beach."

  };

}


/* =========================================================
   MONITORING
   ========================================================= */

async function runMonitorCheck(
  sourceName,
  loader
) {

  const state =
    sourceStatus[
      sourceName
    ];


  state.lastAttempt =
    new Date()
      .toISOString();


  try {

    await loader();


    state.lastSuccess =
      new Date()
        .toISOString();


    state.lastError =
      null;


    console.log(
      `[monitor] ${sourceName} updated successfully at ${state.lastSuccess}`
    );

  }

  catch (
    error
  ) {

    state.lastError =
      error.message;


    console.error(
      `[monitor] ${sourceName} update failed: ${error.message}`
    );

  }

}


async function monitorNwsAlerts() {

  await runMonitorCheck(

    "nwsAlerts",

    () =>
      fetchNwsAlerts(
        true
      )

  );

}


async function monitorNwsSurf() {

  await runMonitorCheck(

    "nwsSurf",

    async () => {

      const beaches =
        await loadBeaches();


      await fetchSurfForecast(
        beaches,
        true
      );

    }

  );

}


async function monitorDrna() {

  await runMonitorCheck(

    "drna",

    () =>
      fetchDrnaNotice(
        true
      )

  );

}


async function startBackgroundMonitoring() {

  console.log("");

  console.log(
    "Starting PR Beach Watch automatic monitoring..."
  );

  console.log(
    "NWS alerts: every 5 minutes"
  );

  console.log(
    "NWS surf/rip current: every 15 minutes"
  );

  console.log(
    "DRNA water quality: every 60 minutes"
  );

  console.log("");


  await Promise.allSettled([

    monitorNwsAlerts(),

    monitorNwsSurf(),

    monitorDrna()

  ]);


  setInterval(
    monitorNwsAlerts,
    NWS_ALERT_INTERVAL
  );


  setInterval(
    monitorNwsSurf,
    NWS_SURF_INTERVAL
  );


  setInterval(
    monitorDrna,
    DRNA_INTERVAL
  );

}


/* =========================================================
   API: BEACHES
   ========================================================= */

app.get(

  "/api/beaches",

  async (
    _req,
    res
  ) => {

    try {

      res.json(
        await loadBeaches()
      );

    }

    catch (
      error
    ) {

      res.status(
        500
      ).json({

        error:
          error.message

      });

    }

  }

);


/* =========================================================
   API: CONDITIONS
   ========================================================= */

app.get(

  "/api/conditions",

  async (
    _req,
    res
  ) => {

    try {


      const beaches =
        await loadBeaches();


      const [
        alerts,
        surf,
        drna
      ] =

        await Promise.all([


          fetchNwsAlerts()

            .catch(
              () => []
            ),


          fetchSurfForecast(
            beaches
          )

            .catch(
              () => ({})
            ),


          fetchDrnaNotice()

            .catch(

              () => ({

                allSafe:
                  false,

                unsafe:
                  [],

                noticeDate:
                  null,

                noticeDateISO:
                  null,

                sampleDate:
                  null,

                sampleDateISO:
                  null,

                url:
                  null,

                source:
                  "Puerto Rico DRNA",

                unavailable:
                  true

              })

            )

        ]);


      const generatedAt =
        new Date()
          .toISOString();


      const nwsSurfCheckedAt =
        cacheTimeIso(
          "nws-srf"
        );


      const nwsAlertsCheckedAt =
        cacheTimeIso(
          "nws-alerts"
        );


      const drnaCheckedAt =
        cacheTimeIso(
          "drna"
        );


      const conditions =

        beaches.map(

          beach => {


            const surfData =

              surf[
                beach.id
              ]

              ||

              {

                ripCurrent:
                  "Unknown",

                surfHeight:
                  "Unknown",

                forecastPeriod:
                  null,

                forecastIssuedAt:
                  null,

                forecastIssuedText:
                  null,

                zoneCode:
                  null,

                zoneName:
                  null,

                source:
                  "NWS San Juan Surf Zone Forecast"

              };


            const nwsSurfFresh =

              isRecentIso(
                surfData.forecastIssuedAt,
                NWS_SURF_MAX_AGE
              );


            const nwsSurfStale =
              nwsSurfFresh === false;


            const ripCurrent =

              nwsSurfStale

                ?

                "Unknown"

                :

                surfData.ripCurrent;


            const surfHeight =

              nwsSurfStale

                ?

                "Unknown"

                :

                surfData.surfHeight;


            const beachAlerts =

              relevantAlerts(
                alerts,
                beach,
                surfData
              );


            const drnaUnsafe =

              drna.unsafe?.some(

                station =>

                  station.stationId
                    ?.toUpperCase()

                  ===

                  beach.stationId
                    ?.toUpperCase()

              )

              ||

              false;


            let waterQuality =
              "Unknown";


            if (
              !drna.unavailable
            ) {


              if (
                drnaUnsafe
              ) {

                waterQuality =
                  "Not suitable for bathers";

              }

              else if (

                drna.noticeDateISO

                ||

                drna.noticeDate

                ||

                drna.allSafe

              ) {

                waterQuality =
                  "No advisory for this station in latest DRNA notice";

              }

            }


            const status =

              computeStatus({

                drnaUnsafe,

                ripCurrent,

                alerts:
                  beachAlerts,

                nwsSurfStale

              });


            return {

              ...beach,

              status,

              ripCurrent,

              surfHeight,

              waterQuality,

              forecastPeriod:
                surfData.forecastPeriod,

              nwsZoneCode:
                surfData.zoneCode,

              nwsZoneName:
                surfData.zoneName,

              alerts:
                beachAlerts,

              sourceFreshness: {

                nwsSurfFresh,

                nwsSurfStale,

                drnaAvailable:
                  !drna.unavailable

              },

              sourceTimes: {

                nwsForecastIssuedAt:
                  surfData.forecastIssuedAt,

                nwsForecastIssueText:
                  surfData.forecastIssuedText,

                nwsSurfCheckedAt,

                nwsAlertsCheckedAt,

                drnaSampleDate:
                  drna.sampleDate,

                drnaSampleDateISO:
                  drna.sampleDateISO,

                drnaNoticeDate:
                  drna.noticeDate,

                drnaNoticeDateISO:
                  drna.noticeDateISO,

                drnaCheckedAt,

                appCheckedAt:
                  generatedAt

              },

              sources: {

                nwsSurf:
                  NWS_SRF,

                nwsAlerts:
                  NWS_ALERTS,

                drna:
                  drna.url

              },

              updatedAt:
                generatedAt

            };

          }

        );


      res.json({

        generatedAt,

        monitoring: {

          automatic:
            true,

          nwsAlertsMinutes:
            5,

          nwsSurfMinutes:
            15,

          drnaMinutes:
            60,

          nwsSurfMaxAgeHours:
            24

        },

        conditions

      });

    }

    catch (
      error
    ) {

      res.status(
        500
      ).json({

        error:
          error.message

      });

    }

  }

);


/* =========================================================
   MONITOR STATUS
   ========================================================= */

app.get(

  "/api/monitor-status",

  (
    _req,
    res
  ) => {

    res.json({

      automaticMonitoring:

        process.env.VERCEL

          ?

          false

          :

          true,


      hostingMode:

        process.env.VERCEL

          ?

          "vercel-request-based"

          :

          "persistent-node-server",


      serverTime:

        new Date()
          .toISOString(),


      intervals: {

        nwsAlertsMinutes:
          5,

        nwsSurfMinutes:
          15,

        drnaMinutes:
          60

      },


      cache: {

        nwsAlertsFetchedAt:
          cacheTimeIso(
            "nws-alerts"
          ),

        nwsSurfFetchedAt:
          cacheTimeIso(
            "nws-srf"
          ),

        drnaFetchedAt:
          cacheTimeIso(
            "drna"
          )

      },


      sources:
        sourceStatus

    });

  }

);


/* =========================================================
   VERCEL

   Vercel imports the Express application directly.
   ========================================================= */

export default app;


/* =========================================================
   LOCAL DEVELOPMENT ONLY

   Vercel must NOT start a permanent HTTP listener.
   ========================================================= */

if (
  !process.env.VERCEL
) {

  app.listen(

    PORT,

    () => {

      console.log(
        `PR Beach Watch running at http://localhost:${PORT}`
      );


      startBackgroundMonitoring()

        .catch(

          error => {

            console.error(
              "Automatic monitoring could not start:",
              error
            );

          }

        );

    }

  );

}