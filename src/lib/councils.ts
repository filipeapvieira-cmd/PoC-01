// Scottish Council Areas with approximate bounding boxes and centers
export interface CouncilArea {
    code: string;
    name: string;
    lat: number;
    lng: number;
    bbox: string; // south,west,north,east
}

export const SCOTTISH_COUNCILS: CouncilArea[] = [
    { code: 'S12000005', name: 'Clackmannanshire', lat: 56.15, lng: -3.78, bbox: '56.07,-3.90,56.25,-3.65' },
    { code: 'S12000006', name: 'Dumfries and Galloway', lat: 55.07, lng: -3.95, bbox: '54.63,-5.15,55.48,-2.90' },
    { code: 'S12000008', name: 'Dundee City', lat: 56.46, lng: -2.97, bbox: '56.43,-3.10,56.50,-2.83' },
    { code: 'S12000010', name: 'East Lothian', lat: 55.92, lng: -2.75, bbox: '55.82,-3.05,56.05,-2.40' },
    { code: 'S12000011', name: 'East Renfrewshire', lat: 55.77, lng: -4.37, bbox: '55.72,-4.50,55.83,-4.25' },
    { code: 'S12000013', name: 'Na h-Eileanan Siar', lat: 57.76, lng: -7.02, bbox: '56.78,-7.70,58.52,-6.13' },
    { code: 'S12000014', name: 'Falkirk', lat: 56.00, lng: -3.78, bbox: '55.90,-3.95,56.10,-3.55' },
    { code: 'S12000017', name: 'Highland', lat: 57.46, lng: -5.15, bbox: '56.39,-7.06,58.64,-3.05' },
    { code: 'S12000018', name: 'Inverclyde', lat: 55.91, lng: -4.73, bbox: '55.85,-4.90,55.97,-4.60' },
    { code: 'S12000019', name: 'Midlothian', lat: 55.83, lng: -3.12, bbox: '55.73,-3.30,55.92,-2.95' },
    { code: 'S12000020', name: 'Moray', lat: 57.45, lng: -3.40, bbox: '57.19,-3.82,57.68,-2.85' },
    { code: 'S12000021', name: 'North Ayrshire', lat: 55.69, lng: -4.83, bbox: '55.48,-5.30,55.89,-4.50' },
    { code: 'S12000023', name: 'Orkney Islands', lat: 59.00, lng: -3.10, bbox: '58.67,-3.55,59.41,-2.35' },
    { code: 'S12000026', name: 'Scottish Borders', lat: 55.55, lng: -2.79, bbox: '55.21,-3.53,55.94,-2.04' },
    { code: 'S12000027', name: 'Shetland Islands', lat: 60.39, lng: -1.13, bbox: '59.84,-1.77,60.87,-0.72' },
    { code: 'S12000028', name: 'South Ayrshire', lat: 55.35, lng: -4.63, bbox: '55.10,-5.10,55.58,-4.25' },
    { code: 'S12000029', name: 'South Lanarkshire', lat: 55.56, lng: -3.78, bbox: '55.33,-4.10,55.82,-3.40' },
    { code: 'S12000030', name: 'Stirling', lat: 56.12, lng: -4.10, bbox: '55.97,-4.60,56.38,-3.70' },
    { code: 'S12000033', name: 'Aberdeen City', lat: 57.15, lng: -2.09, bbox: '57.08,-2.20,57.20,-2.05' },
    { code: 'S12000034', name: 'Aberdeenshire', lat: 57.28, lng: -2.52, bbox: '56.86,-3.50,57.71,-1.77' },
    { code: 'S12000035', name: 'Argyll and Bute', lat: 56.23, lng: -5.23, bbox: '55.70,-6.40,56.72,-4.55' },
    { code: 'S12000036', name: 'City of Edinburgh', lat: 55.95, lng: -3.19, bbox: '55.87,-3.35,56.01,-3.05' },
    { code: 'S12000038', name: 'Renfrewshire', lat: 55.82, lng: -4.53, bbox: '55.77,-4.65,55.88,-4.35' },
    { code: 'S12000039', name: 'West Dunbartonshire', lat: 55.94, lng: -4.53, bbox: '55.89,-4.65,55.99,-4.35' },
    { code: 'S12000040', name: 'West Lothian', lat: 55.91, lng: -3.54, bbox: '55.82,-3.73,55.99,-3.35' },
    { code: 'S12000041', name: 'Angus', lat: 56.73, lng: -2.92, bbox: '56.55,-3.38,56.90,-2.45' },
    { code: 'S12000042', name: 'East Ayrshire', lat: 55.47, lng: -4.30, bbox: '55.28,-4.55,55.67,-4.05' },
    { code: 'S12000045', name: 'East Dunbartonshire', lat: 55.93, lng: -4.20, bbox: '55.88,-4.35,55.98,-4.05' },
    { code: 'S12000047', name: 'Fife', lat: 56.25, lng: -3.18, bbox: '56.03,-3.75,56.45,-2.50' },
    { code: 'S12000048', name: 'Perth and Kinross', lat: 56.50, lng: -3.55, bbox: '56.20,-4.30,56.80,-2.85' },
    { code: 'S12000049', name: 'Glasgow City', lat: 55.86, lng: -4.25, bbox: '55.82,-4.39,55.91,-4.12' },
    { code: 'S12000050', name: 'North Lanarkshire', lat: 55.86, lng: -3.93, bbox: '55.76,-4.15,55.96,-3.70' },
];

// Major cities for focused queries (smaller bbox = faster + less likely to rate-limit)
export const MAJOR_SCOTTISH_CITIES: CouncilArea[] = SCOTTISH_COUNCILS.filter(c =>
    ['S12000036', 'S12000049', 'S12000033', 'S12000008', 'S12000030', 'S12000047'].includes(c.code)
);

export function getCouncilName(code: string): string {
    return SCOTTISH_COUNCILS.find(c => c.code === code)?.name ?? code;
}

export function getCouncilByCode(code: string): CouncilArea | undefined {
    return SCOTTISH_COUNCILS.find(c => c.code === code);
}

