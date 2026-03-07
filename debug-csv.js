const fs = require('fs');
const https = require('https');

async function downloadCSV() {
    const url = 'https://statistics.gov.scot/downloads/cube-table?uri=http%3A%2F%2Fstatistics.gov.scot%2Fdata%2Fpublic-transport';
    console.log("Downloading CSV from: " + url);

    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode !== 200) {
            console.error("HTTP Error", res.statusCode);
            return;
        }
        let data = '';
        res.on('data', chunk => {
            data += chunk;
            if (data.length > 5000) {
                console.log(data.substring(0, 1000));
                req.destroy();
            }
        });
    });
    req.on('error', console.error);
}

downloadCSV();
