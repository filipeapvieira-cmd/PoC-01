async function testSparql() {
    const query = `
        PREFIX qb: <http://purl.org/linked-data/cube#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX data: <http://statistics.gov.scot/data/>

        SELECT ?refAreaName ?refPeriodName ?measureName ?value
        WHERE {
            ?obs qb:dataSet data:public-transport ;
                 <http://purl.org/linked-data/sdmx/2009/dimension#refArea> ?refArea ;
                 <http://purl.org/linked-data/sdmx/2009/dimension#refPeriod> ?refPeriod ;
                 <http://purl.org/linked-data/cube#measureType> ?measureType .
            
            ?refArea rdfs:label ?refAreaName .
            ?refPeriod rdfs:label ?refPeriodName .
            ?measureType rdfs:label ?measureName .
            ?obs ?measureType ?value .
        } LIMIT 25
    `;

    const url = 'https://statistics.gov.scot/sparql.csv?query=' + encodeURIComponent(query);
    console.log("Fetching: " + url);
    const res = await fetch(url);
    const text = await res.text();
    console.log(text);
}

testSparql().catch(console.error);
