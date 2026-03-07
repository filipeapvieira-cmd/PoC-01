const https = require('https');

https.get('https://www.gov.uk/government/statistical-data-sets/road-traffic-statistics-tra', (resp) => {
    let data = '';

    // A chunk of data has been received.
    resp.on('data', (chunk) => {
        data += chunk;
    });

    // The whole response has been received. Print out the result.
    resp.on('end', () => {
        const matches = data.match(/https:\/\/[^"']*tra8901[^"']*\.ods/ig);
        const matches2 = data.match(/https:\/\/[^"']*tra8904[^"']*\.ods/ig);
        const matches3 = data.match(/https:\/\/[^"']*tra8902[^"']*\.ods/ig);

        console.log("TRA8901:", matches ? [...new Set(matches)] : "None");
        console.log("TRA8904:", matches2 ? [...new Set(matches2)] : "None");
        console.log("TRA8902:", matches3 ? [...new Set(matches3)] : "None");
    });

}).on("error", (err) => {
    console.log("Error: " + err.message);
});
