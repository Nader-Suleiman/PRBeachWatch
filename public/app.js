const $ = (id) =>
    document.getElementById(id);


/* =========================================================
   STATE
   ========================================================= */

let payload = null;

let selectedId = null;

let selectedIndex = 0;

let isLoadingConditions = false;

let lastConditionsLoadAt = 0;


/* =========================================================
   AUTO REFRESH
   ========================================================= */

const AUTO_REFRESH_MS =
    5 * 60 * 1000;


/* =========================================================
   MAP
   ========================================================= */

const PR_BOUNDS = {

    minLat: 17.88,

    maxLat: 18.55,

    minLon: -67.35,

    maxLon: -65.55

};


const SVG_WIDTH =
    1200;


const SVG_HEIGHT =
    430;


const ISLAND_COAST = [

    [75, 209],
    [112, 177],
    [170, 166],
    [210, 142],
    [274, 143],
    [337, 118],
    [402, 123],
    [462, 101],
    [535, 113],
    [611, 92],
    [684, 110],
    [754, 95],
    [819, 119],
    [895, 116],
    [952, 139],
    [1024, 149],
    [1080, 177],
    [1131, 198],
    [1118, 226],
    [1072, 243],
    [1009, 256],
    [940, 272],
    [874, 278],
    [802, 303],
    [727, 302],
    [651, 319],
    [573, 313],
    [500, 325],
    [425, 312],
    [352, 321],
    [282, 299],
    [209, 297],
    [146, 275],
    [97, 255]

];


const DRAWN_BOUNDS = {

    left: 75,

    right: 1131,

    top: 92,

    bottom: 325

};


/* =========================================================
   CLOCK
   ========================================================= */

function updateClock() {

    $("clock").textContent =

        new Intl.DateTimeFormat(

            "en-US",

            {

                hour:
                    "numeric",

                minute:
                    "2-digit",

                timeZone:
                    "America/Puerto_Rico"

            }

        ).format(
            new Date()
        );

}


updateClock();


setInterval(

    updateClock,

    30_000

);


/* =========================================================
   HELPERS
   ========================================================= */

function clamp(
    value,
    minimum,
    maximum
) {

    return Math.min(

        maximum,

        Math.max(

            minimum,

            value

        )

    );

}


function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


/* =========================================================
   MAP POSITIONING
   ========================================================= */

function nearestPointOnSegment(

    px,
    py,

    ax,
    ay,

    bx,
    by

) {

    const dx =
        bx - ax;


    const dy =
        by - ay;


    const lengthSquared =

        dx * dx

        +

        dy * dy;


    let t =
        0;


    if (
        lengthSquared !==
        0
    ) {

        t =

            (
                (
                    px - ax
                )

                *
                dx

                +

                (
                    py - ay
                )

                *
                dy
            )

            /

            lengthSquared;

    }


    t = clamp(

        t,

        0,

        1

    );


    const x =

        ax

        +

        t * dx;


    const y =

        ay

        +

        t * dy;


    const distanceSquared =

        (
            px - x
        ) ** 2

        +

        (
            py - y
        ) ** 2;


    return {

        x,

        y,

        distanceSquared

    };

}


function nearestPointOnCoast(

    targetX,

    targetY

) {

    let bestPoint =
        null;


    for (

        let i = 0;

        i <
        ISLAND_COAST.length;

        i++

    ) {


        const current =

            ISLAND_COAST[i];


        const next =

            ISLAND_COAST[
                (
                    i + 1
                )

                %

                ISLAND_COAST.length
            ];


        const candidate =

            nearestPointOnSegment(

                targetX,

                targetY,

                current[0],

                current[1],

                next[0],

                next[1]

            );


        if (

            bestPoint ===
            null

            ||

            candidate.distanceSquared <
            bestPoint.distanceSquared

        ) {

            bestPoint =
                candidate;

        }

    }


    return bestPoint;

}


function toMapPosition(

    lat,

    lon

) {

    const xPercent =

        clamp(

            (
                lon -
                PR_BOUNDS.minLon
            )

            /

            (
                PR_BOUNDS.maxLon -
                PR_BOUNDS.minLon
            ),

            0,

            1

        );


    const yPercent =

        clamp(

            1 -

            (
                (
                    lat -
                    PR_BOUNDS.minLat
                )

                /

                (
                    PR_BOUNDS.maxLat -
                    PR_BOUNDS.minLat
                )
            ),

            0,

            1

        );


    const targetX =

        DRAWN_BOUNDS.left

        +

        xPercent

        *

        (
            DRAWN_BOUNDS.right -
            DRAWN_BOUNDS.left
        );


    const targetY =

        DRAWN_BOUNDS.top

        +

        yPercent

        *

        (
            DRAWN_BOUNDS.bottom -
            DRAWN_BOUNDS.top
        );


    const coastalPoint =

        nearestPointOnCoast(

            targetX,

            targetY

        );


    return {

        left:

            `${
                (
                    coastalPoint.x /
                    SVG_WIDTH
                )
                *
                100
            }%`,


        top:

            `${
                (
                    coastalPoint.y /
                    SVG_HEIGHT
                )
                *
                100
            }%`

    };

}


/* =========================================================
   STATUS CLASS
   ========================================================= */

function getStatusClass(
    beach
) {

    const value =

        String(

            beach.status?.code

            ||

            beach.status?.label

            ||

            ""

        ).toLowerCase();


    if (

        value.includes(
            "water"
        )

        ||

        value.includes(
            "advisory"
        )

        ||

        value.includes(
            "avoid"
        )

    ) {

        return "advisory";

    }


    if (
        value.includes(
            "high"
        )
    ) {

        return "high";

    }


    if (

        value.includes(
            "moderate"
        )

        ||

        value.includes(
            "caution"
        )

    ) {

        return "caution";

    }


    if (
        value.includes(
            "low"
        )
    ) {

        return "low";

    }


    return "unknown";

}


/* =========================================================
   MAP MARKERS
   ========================================================= */

function renderMarkers() {

    const container =
        $("markers");


    container.innerHTML =
        "";


    if (
        !payload
    ) {

        return;

    }


    for (
        const beach
        of payload.conditions
    ) {


        if (

            typeof beach.lat !==
            "number"

            ||

            typeof beach.lon !==
            "number"

        ) {

            continue;

        }


        const marker =

            document.createElement(
                "button"
            );


        marker.type =
            "button";


        marker.className =

            `marker ${
                getStatusClass(
                    beach
                )
            }`;


        if (
            beach.id ===
            selectedId
        ) {

            marker.classList.add(
                "selected"
            );

        }


        const beachName =

            beach.shortName

            ||

            beach.name

            ||

            "Beach";


        marker.title =

            `${beachName} — ${
                beach.status?.label
                ||
                "Check conditions"
            }`;


        marker.setAttribute(

            "aria-label",

            marker.title

        );


        const position =

            toMapPosition(

                beach.lat,

                beach.lon

            );


        marker.style.left =
            position.left;


        marker.style.top =
            position.top;


        marker.addEventListener(

            "click",

            () =>

                selectBeach(
                    beach.id
                )

        );


        container.appendChild(
            marker
        );

    }

}


/* =========================================================
   DISPLAY TIMES
   ========================================================= */

function niceTime(
    isoDate
) {

    if (
        !isoDate
    ) {

        return "Unknown";

    }


    const date =

        new Date(
            isoDate
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Unknown";

    }


    return new Intl.DateTimeFormat(

        "en-US",

        {

            hour:
                "numeric",

            minute:
                "2-digit",

            timeZone:
                "America/Puerto_Rico"

        }

    ).format(
        date
    );

}


/*
  Used for NWS issue time and app checked time.

  Example:

  Sep 24, 4:15 PM
*/

function niceDateTime(
    isoDate
) {

    if (
        !isoDate
    ) {

        return "Unknown";

    }


    const date =

        new Date(
            isoDate
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Unknown";

    }


    return new Intl.DateTimeFormat(

        "en-US",

        {

            month:
                "short",

            day:
                "numeric",

            hour:
                "numeric",

            minute:
                "2-digit",

            timeZone:
                "America/Puerto_Rico"

        }

    ).format(
        date
    );

}


/*
  Used for DRNA sample/notice dates.

  Example:

  Sep 16, 2026
*/

function niceDateOnly(

    isoDate,

    fallbackText = null

) {

    if (

        isoDate

        &&

        /^\d{4}-\d{2}-\d{2}$/.test(
            isoDate
        )

    ) {

        const date =

            new Date(

                `${isoDate}T12:00:00-04:00`

            );


        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {

            return new Intl.DateTimeFormat(

                "en-US",

                {

                    month:
                        "short",

                    day:
                        "numeric",

                    year:
                        "numeric",

                    timeZone:
                        "America/Puerto_Rico"

                }

            ).format(
                date
            );

        }

    }


    return fallbackText

        ||

        "Unknown";

}


/* =========================================================
   CURRENT BEACH
   ========================================================= */

function getSelectedBeach() {

    if (
        !payload
    ) {

        return null;

    }


    return (

        payload.conditions.find(

            beach =>

                beach.id ===
                selectedId

        )

        ||

        null

    );

}


/* =========================================================
   SELECT BEACH
   ========================================================= */

function selectBeach(
    id
) {

    if (
        !payload
    ) {

        return;

    }


    const index =

        payload.conditions.findIndex(

            beach =>

                beach.id ===
                id

        );


    if (
        index ===
        -1
    ) {

        return;

    }


    selectedIndex =
        index;


    selectedId =
        id;


    const beach =

        payload.conditions[
            index
        ];


    const times =

        beach.sourceTimes

        ||

        {};


    $("beachName").textContent =

        beach.shortName

        ||

        beach.name

        ||

        "Beach";


    $("status").textContent =

        beach.status?.label

        ||

        "CHECK CONDITIONS";


    $("status").className =

        `main-status ${
            getStatusClass(
                beach
            )
        }`;


    $("rip").textContent =

        beach.ripCurrent

        ||

        "Unknown";


    $("surf").textContent =

        beach.surfHeight

        ||

        "Unknown";


    $("water").textContent =

        beach.waterQuality

        ||

        "Unknown";


    /*
      Official NWS publication time.
    */

    $("nwsIssued").textContent =

        times.nwsForecastIssuedAt

            ?

            niceDateTime(
                times.nwsForecastIssuedAt
            )

            :

            (
                times.nwsForecastIssueText

                ||

                "Unknown"
            );


    /*
      Actual DRNA sample collection date.
    */

    $("drnaSample").textContent =

        niceDateOnly(

            times.drnaSampleDateISO,

            times.drnaSampleDate

        );


    /*
      Actual DRNA notice publication date.
    */

    $("drnaNotice").textContent =

        niceDateOnly(

            times.drnaNoticeDateISO,

            times.drnaNoticeDate

        );


    /*
      When PR Beach Watch itself checked.
    */

    $("checked").textContent =

        niceDateTime(

            times.appCheckedAt

            ||

            payload.generatedAt

        );


    renderMarkers();

}


/* =========================================================
   NEXT / PREVIOUS
   ========================================================= */

function selectNextBeach() {

    if (

        !payload

        ||

        !payload.conditions.length

    ) {

        return;

    }


    selectedIndex++;


    if (

        selectedIndex >=
        payload.conditions.length

    ) {

        selectedIndex =
            0;

    }


    selectBeach(

        payload.conditions[
            selectedIndex
        ].id

    );

}


function selectPreviousBeach() {

    if (

        !payload

        ||

        !payload.conditions.length

    ) {

        return;

    }


    selectedIndex--;


    if (
        selectedIndex <
        0
    ) {

        selectedIndex =

            payload.conditions.length
            -
            1;

    }


    selectBeach(

        payload.conditions[
            selectedIndex
        ].id

    );

}


/* =========================================================
   LOAD CONDITIONS
   ========================================================= */

async function loadConditions(
    silent = false
) {

    if (
        isLoadingConditions
    ) {

        return;

    }


    isLoadingConditions =
        true;


    try {


        const response =

            await fetch(

                "/api/conditions",

                {

                    cache:
                        "no-store"

                }

            );


        if (
            !response.ok
        ) {

            throw new Error(

                `Server returned ${response.status}`

            );

        }


        const newPayload =

            await response.json();


        if (
            !Array.isArray(
                newPayload.conditions
            )
        ) {

            throw new Error(

                "Beach condition data is missing."

            );

        }


        payload =
            newPayload;


        lastConditionsLoadAt =
            Date.now();


        if (
            selectedId
        ) {

            const exists =

                payload.conditions.some(

                    beach =>

                        beach.id ===
                        selectedId

                );


            if (
                !exists
            ) {

                selectedId =
                    null;

            }

        }


        if (

            !selectedId

            &&

            payload.conditions.length

        ) {


            const crashBoat =

                payload.conditions.find(

                    beach =>

                        beach.stationId ===
                        "RW-16"

                        ||

                        beach.id ===
                        "rw16"

                );


            selectedId =

                crashBoat?.id

                ||

                payload.conditions[0].id;

        }


        renderMarkers();


        if (
            selectedId
        ) {

            selectBeach(
                selectedId
            );

        }


    }


    catch (
        error
    ) {


        console.error(

            "Could not refresh conditions:",

            error

        );


        if (

            !silent

            ||

            !payload

        ) {


            $("status").textContent =
                "DATA UNAVAILABLE";


            $("status").className =
                "main-status unknown";


            $("rip").textContent =
                "Unknown";


            $("surf").textContent =
                "Unknown";


            $("water").textContent =
                "Unknown";


            $("nwsIssued").textContent =
                "Unknown";


            $("drnaSample").textContent =
                "Unknown";


            $("drnaNotice").textContent =
                "Unknown";


            $("checked").textContent =
                "Failed";

        }

    }


    finally {

        isLoadingConditions =
            false;

    }

}


/* =========================================================
   MAP BUTTON
   ========================================================= */

function showMap() {

    $("mapSection").scrollIntoView({

        behavior:
            "smooth",

        block:
            "start"

    });

}


/* =========================================================
   STATUS BUTTON
   ========================================================= */

function showStatus() {

    const beach =
        getSelectedBeach();


    if (
        !beach
    ) {


        $("modalContent").innerHTML =

            `
            <h2>
                BEACH STATUS
            </h2>

            <p>
                Beach information is still loading.
            </p>
            `;


        $("modal").showModal();


        return;

    }


    const times =

        beach.sourceTimes

        ||

        {};


    const freshness =

        beach.sourceFreshness

        ||

        {};


    $("modalContent").innerHTML =

        `
        <h2>
            ${
                escapeHTML(
                    beach.shortName
                    ||
                    beach.name
                )
            }
        </h2>


        <p>
            <strong>
                ${
                    escapeHTML(
                        beach.status?.label
                        ||
                        "CHECK CONDITIONS"
                    )
                }
            </strong>
        </p>


        <p>
            ${
                escapeHTML(
                    beach.status?.reason
                    ||
                    "No additional status explanation is available."
                )
            }
        </p>


        <p>
            <strong>
                Rip Current:
            </strong>

            ${
                escapeHTML(
                    beach.ripCurrent
                    ||
                    "Unknown"
                )
            }
        </p>


        <p>
            <strong>
                Surf:
            </strong>

            ${
                escapeHTML(
                    beach.surfHeight
                    ||
                    "Unknown"
                )
            }
        </p>


        <p>
            <strong>
                Water Quality:
            </strong>

            ${
                escapeHTML(
                    beach.waterQuality
                    ||
                    "Unknown"
                )
            }
        </p>


        <p>
            <strong>
                NWS Forecast Zone:
            </strong>

            ${
                escapeHTML(
                    beach.nwsZoneName
                    ||
                    beach.nwsZoneCode
                    ||
                    "Not identified"
                )
            }
        </p>


        <p>
            <strong>
                NWS Forecast Period:
            </strong>

            ${
                escapeHTML(
                    beach.forecastPeriod
                    ||
                    "Unknown"
                )
            }
        </p>


        <p>
            <strong>
                NWS Forecast Issued:
            </strong>

            ${
                escapeHTML(

                    times.nwsForecastIssuedAt

                        ?

                        niceDateTime(
                            times.nwsForecastIssuedAt
                        )

                        :

                        (
                            times.nwsForecastIssueText
                            ||
                            "Unknown"
                        )

                )
            }
        </p>


        <p>
            <strong>
                NWS Forecast Fresh:
            </strong>

            ${
                freshness.nwsSurfFresh === true

                    ?

                    "Yes"

                    :

                    freshness.nwsSurfFresh === false

                        ?

                        "No — older than 24 hours"

                        :

                        "Could not verify timestamp"
            }
        </p>


        <p>
            <strong>
                DRNA Sample Date:
            </strong>

            ${
                escapeHTML(

                    niceDateOnly(

                        times.drnaSampleDateISO,

                        times.drnaSampleDate

                    )

                )
            }
        </p>


        <p>
            <strong>
                DRNA Notice Date:
            </strong>

            ${
                escapeHTML(

                    niceDateOnly(

                        times.drnaNoticeDateISO,

                        times.drnaNoticeDate

                    )

                )
            }
        </p>


        <p>
            <strong>
                PR Beach Watch Checked:
            </strong>

            ${
                escapeHTML(

                    niceDateTime(

                        times.appCheckedAt

                        ||

                        payload.generatedAt

                    )

                )
            }
        </p>


        <p>
            <strong>
                Municipality:
            </strong>

            ${
                escapeHTML(
                    beach.municipality
                    ||
                    "Unknown"
                )
            }
        </p>


        <p>
            <strong>
                DRNA Station:
            </strong>

            ${
                escapeHTML(
                    beach.stationId
                    ||
                    "Unknown"
                )
            }
        </p>
        `;


    $("modal").showModal();

}


/* =========================================================
   ALERTS
   ========================================================= */

function showAlerts() {

    if (
        !payload
    ) {

        return;

    }


    const allAlerts =

        payload.conditions.flatMap(

            beach =>

                (
                    beach.alerts
                    ||
                    []
                ).map(

                    alert => ({

                        ...alert,

                        beach:

                            beach.shortName

                            ||

                            beach.name

                    })

                )

        );


    const unique =

        [
            ...new Map(

                allAlerts.map(

                    alert => [

                        `${
                            alert.headline
                            ||
                            alert.event
                        }-${
                            alert.expires
                        }`,

                        alert

                    ]

                )

            ).values()
        ];


    if (
        unique.length ===
        0
    ) {


        $("modalContent").innerHTML =

            `
            <h2>
                ACTIVE COASTAL ALERTS
            </h2>

            <p>
                No matching active NWS coastal alerts
                are currently being returned for the
                monitored beach areas.
            </p>
            `;

    }


    else {


        $("modalContent").innerHTML =

            `
            <h2>
                ACTIVE COASTAL ALERTS
            </h2>

            ${
                unique.map(

                    alert =>

                    `
                    <p>

                        <strong>
                            ${
                                escapeHTML(
                                    alert.event
                                    ||
                                    "Alert"
                                )
                            }
                        </strong>

                        <br>

                        ${
                            escapeHTML(
                                alert.headline
                                ||
                                ""
                            )
                        }

                        <br><br>

                        <small>
                            ${
                                escapeHTML(
                                    alert.areaDesc
                                    ||
                                    ""
                                )
                            }
                        </small>

                    </p>
                    `

                ).join("")
            }
            `;

    }


    $("modal").showModal();

}


/* =========================================================
   INFO
   ========================================================= */

function showInfo() {

    $("modalContent").innerHTML =

        `
        <h2>
            PR BEACH WATCH
        </h2>


        <p>
            Rip-current risk and surf height come
            from the NWS San Juan Surf Zone Forecast.
            These are zone forecasts, not sensors
            located at each individual beach.
        </p>


        <p>
            Water-quality notices come from Puerto
            Rico DRNA's Beach Monitoring Program.
            The app shows whether the station appears
            in the latest DRNA notice.
        </p>


        <p>
            <strong>NWS Issued</strong>
            is the official NWS forecast publication
            time.
        </p>


        <p>
            <strong>DRNA Sample</strong>
            is when the water sample used in the
            latest DRNA notice was collected.
        </p>


        <p>
            <strong>DRNA Notice</strong>
            is the date DRNA published the notice.
        </p>


        <p>
            <strong>Checked</strong>
            is when PR Beach Watch last requested
            the latest backend data. It does not mean
            NWS or DRNA published new data at that
            exact moment.
        </p>


        <p>
            If the NWS surf forecast becomes more
            than 24 hours old, PR Beach Watch changes
            the beach to
            <strong>CHECK CONDITIONS</strong>
            instead of presenting an old risk level
            as current.
        </p>


        <p>
            Always follow lifeguards, posted flags,
            closures, and official instructions.
        </p>
        `;


    $("modal").showModal();

}


/* =========================================================
   AUTO MONITORING
   ========================================================= */

function startAutomaticMonitoring() {


    setInterval(

        () =>

            loadConditions(
                true
            ),

        AUTO_REFRESH_MS

    );


    document.addEventListener(

        "visibilitychange",

        () => {


            if (
                document.visibilityState !==
                "visible"
            ) {

                return;

            }


            const age =

                Date.now()

                -

                lastConditionsLoadAt;


            if (
                age >=
                AUTO_REFRESH_MS
            ) {

                loadConditions(
                    true
                );

            }

        }

    );

}


/* =========================================================
   EVENTS
   ========================================================= */

$("mapBtn").addEventListener(

    "click",

    showMap

);


$("statusBtn").addEventListener(

    "click",

    showStatus

);


$("alertsBtn").addEventListener(

    "click",

    showAlerts

);


$("infoBtn").addEventListener(

    "click",

    showInfo

);


$("prevBeachBtn").addEventListener(

    "click",

    selectPreviousBeach

);


$("nextBeachBtn").addEventListener(

    "click",

    selectNextBeach

);


$("closeModal").addEventListener(

    "click",

    () =>

        $("modal").close()

);


/* =========================================================
   START
   ========================================================= */

loadConditions(
    true
);


startAutomaticMonitoring();