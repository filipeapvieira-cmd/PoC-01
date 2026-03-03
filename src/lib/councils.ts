// Scottish Council Areas for the geo selector
export const SCOTTISH_COUNCILS = [
    { code: 'S12000005', name: 'Clackmannanshire' },
    { code: 'S12000006', name: 'Dumfries and Galloway' },
    { code: 'S12000008', name: 'Dundee City' },
    { code: 'S12000010', name: 'East Lothian' },
    { code: 'S12000011', name: 'East Renfrewshire' },
    { code: 'S12000013', name: 'Na h-Eileanan Siar' },
    { code: 'S12000014', name: 'Falkirk' },
    { code: 'S12000017', name: 'Highland' },
    { code: 'S12000018', name: 'Inverclyde' },
    { code: 'S12000019', name: 'Midlothian' },
    { code: 'S12000020', name: 'Moray' },
    { code: 'S12000021', name: 'North Ayrshire' },
    { code: 'S12000023', name: 'Orkney Islands' },
    { code: 'S12000026', name: 'Scottish Borders' },
    { code: 'S12000027', name: 'Shetland Islands' },
    { code: 'S12000028', name: 'South Ayrshire' },
    { code: 'S12000029', name: 'South Lanarkshire' },
    { code: 'S12000030', name: 'Stirling' },
    { code: 'S12000033', name: 'Aberdeen City' },
    { code: 'S12000034', name: 'Aberdeenshire' },
    { code: 'S12000035', name: 'Argyll and Bute' },
    { code: 'S12000036', name: 'City of Edinburgh' },
    { code: 'S12000038', name: 'Renfrewshire' },
    { code: 'S12000039', name: 'West Dunbartonshire' },
    { code: 'S12000040', name: 'West Lothian' },
    { code: 'S12000041', name: 'Angus' },
    { code: 'S12000042', name: 'East Ayrshire' },
    { code: 'S12000045', name: 'East Dunbartonshire' },
    { code: 'S12000047', name: 'Fife' },
    { code: 'S12000048', name: 'Perth and Kinross' },
    { code: 'S12000049', name: 'Glasgow City' },
    { code: 'S12000050', name: 'North Lanarkshire' },
];

export function getCouncilName(code: string): string {
    return SCOTTISH_COUNCILS.find(c => c.code === code)?.name ?? code;
}
