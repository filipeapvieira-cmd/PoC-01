async function getUrls() {
    const res = await fetch('https://www.gov.uk/government/statistical-data-sets/road-traffic-statistics-tra');
    const text = await res.text();
    const urls = text.match(/https:\/\/[^"']+(?:tra8901|tra8902)[^"']*\.ods/ig) || [];
    require('fs').writeFileSync('dft_urls.txt', urls.join('\n'));
    console.log(`Saved ${urls.length} URLs to dft_urls.txt`);
}
getUrls().catch(console.error);
