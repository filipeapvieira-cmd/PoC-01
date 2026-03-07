import { SCOTTISH_COUNCILS } from './src/lib/councils';
import { fetchAndParseXlsx } from './src/lib/xlsx-fetcher';

function sanitize(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getCouncilName(code: string): string {
    const c = SCOTTISH_COUNCILS.find(x => x.code === code);
    if (!c) return '';
    if (c.name === 'Na h-Eileanan Siar') return 'Na h-Eileanan Siar';
    if (c.name === 'Edinburgh, City of') return 'City of Edinburgh';
    return c.name;
}

async function test() {
    console.log("Analyzing LA Match Rates for 2023...");
    const url = "https://assets.publishing.service.gov.uk/media/68da76d2c487360cc70c9e9d/Renewable_electricity_by_local_authority_2014_-_2024.xlsx";
    const parsed = await fetchAndParseXlsx(url, { timeout: 120_000 });
    const sheet2023 = parsed.sheets["LA - Generation, 2023"] as unknown[][];

    let headerRow = 4; // We know from before it's row 4
    let rCol = 1;      // Region
    let tCol = 17;     // Total

    let matches = 0;
    for (let i = headerRow + 1; i < sheet2023.length; i++) {
        if (!sheet2023[i] || !sheet2023[i][rCol]) continue;

        const regionName = String(sheet2023[i][rCol]).trim();
        const cleanExtracted = sanitize(regionName);

        for (const council of SCOTTISH_COUNCILS) {
            const targetName = getCouncilName(council.code);
            const cleanTarget = sanitize(targetName);

            if (cleanTarget.includes('aberdeen')) {
                if (cleanExtracted.includes('aberdeen')) {
                    console.log(`Checking: Extracted="${cleanExtracted}" vs Target="${cleanTarget}"`);
                }
            }

            if (cleanExtracted === cleanTarget ||
                (cleanExtracted.includes('edinburgh') && cleanTarget.includes('edinburgh')) ||
                // Note: the previous logic for ayrshire was `cleanExtracted === cleanTarget`, let's see why they missed.
                (cleanExtracted.includes(cleanTarget) && cleanTarget.length > 5)) {

                matches++;
                break;
            }
        }
    }
    console.log(`Matched ${matches} out of ${SCOTTISH_COUNCILS.length} councils.`);
}

test().catch(console.error);
