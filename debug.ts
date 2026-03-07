async function find() {
    const res = await fetch('https://www.gov.uk/government/statistical-data-sets/road-traffic-statistics-tra');
    const text = await res.text();
    const urls = text.match(/https:\/\/[^"']+\.ods/ig) || [];
    const tra04 = urls.filter(u => u.includes('tra04') || u.includes('tra89'));
    console.log(tra04.map(u => u.split('/').pop()).join('\n'));
}
find().catch(console.error);
