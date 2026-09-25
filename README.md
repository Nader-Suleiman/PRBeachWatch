# PR Beach Watch

🌐 Live Website: https://pr-beach-watch.vercel.app

A retro pixel-art Puerto Rico beach-conditions prototype.

## What is live
- Active alerts: National Weather Service `api.weather.gov`
- Rip-current/surf forecast: NWS San Juan Surf Zone Forecast (`SRF`)
- Water-quality advisories: latest Puerto Rico DRNA beach-monitoring notice

## Important wording
The UI says **LOW RISK**, **CAUTION**, **HIGH RISK**, or **WATER QUALITY ADVISORY**.
Do not promise that a beach is "safe." Conditions can change quickly.

## Run in VS Code

1. Install Node.js 20+ from https://nodejs.org/
2. Open this folder in VS Code.
3. Open the terminal.
4. Run:
   npm install
5. Set your NWS User-Agent:
   - macOS/Linux:
     export NWS_USER_AGENT="PRBeachWatch/1.0 (you@example.com)"
   - PowerShell:
     $env:NWS_USER_AGENT="PRBeachWatch/1.0 (you@example.com)"
6. Run:
   npm run dev
7. Open:
   http://localhost:3000

## Project layout

- `server.js` — backend/data collectors and safety-status engine
- `data/beaches.json` — monitored beaches + DRNA station IDs + coordinates
- `public/index.html` — app screen
- `public/style.css` — retro game visual style
- `public/app.js` — interactive map and live refresh

## Production checklist

Before publishing:
1. Verify every beach/station coordinate against the latest DRNA station list.
2. Test the NWS Surf Zone Forecast parser against several forecast formats.
3. Add automated tests for every risk/status rule.
4. Add source timestamps and stale-data warnings.
5. Add a fallback message when DRNA or NWS is unavailable.
6. Cache upstream requests; do not hit government services on every user tap.
7. Add monitoring/logging so a broken scraper is detected.
8. Add Spanish localization.
9. Add an accessibility pass.
10. Have the safety wording reviewed before public launch.

## Data precedence used by this starter

1. Latest DRNA station advisory -> WATER QUALITY ADVISORY
2. Matching NWS warning/advisory or High rip-current risk -> HIGH RISK
3. Moderate rip-current risk -> CAUTION
4. Low rip-current risk -> LOW RISK
5. Missing data -> CHECK CONDITIONS

This logic is intentionally conservative and should be reviewed before a public safety launch.
