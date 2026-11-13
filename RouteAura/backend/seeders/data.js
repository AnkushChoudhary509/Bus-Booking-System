// Static demo data for the seeder. Coordinates and boarding-point names are APPROXIMATE demo data,
// not an official stop list. Operators, passengers and reviews are fictional.

export const CITIES = {
  Delhi: { lat: 28.6139, lng: 77.209, points: [['Kashmere Gate ISBT', 'Next to Kashmere Gate Metro station'], ['Anand Vihar ISBT', 'Opposite Anand Vihar Railway Terminal'], ['Dhaula Kuan', 'Below the flyover, Metro gate 2']] },
  Jaipur: { lat: 26.9124, lng: 75.7873, points: [['Sindhi Camp Bus Stand', 'Near Sindhi Camp Metro station'], ['Narayan Singh Circle', 'Main crossing, tea stall side'], ['Ajmeri Gate', 'Opposite the heritage market']] },
  Mumbai: { lat: 19.076, lng: 72.8777, points: [['Dadar East', 'Near Dadar railway station, bus bay 3'], ['Borivali East', 'Next to the National Park gate'], ['Chembur Naka', 'Under the Eastern Express Highway bridge']] },
  Pune: { lat: 18.5204, lng: 73.8567, points: [['Shivajinagar Bus Stand', 'Opposite the district court'], ['Swargate', 'Platform side, near the ST depot'], ['Hinjewadi Phase 1', 'Main gate of the IT park road']] },
  Bengaluru: { lat: 12.9716, lng: 77.5946, points: [['Majestic (Kempegowda Bus Station)', 'Platform 12, near the metro interchange'], ['Silk Board Junction', 'Service road under the flyover'], ['Madiwala', 'Opposite the police check post']] },
  Chennai: { lat: 13.0827, lng: 80.2707, points: [['Koyambedu CMBT', 'Gate 4 of the bus terminus'], ['Guindy', 'Next to the Guindy railway station'], ['Tambaram', 'Opposite the railway overbridge']] },
  Jammu: { lat: 32.7266, lng: 74.857, points: [['Jammu Bus Stand (Narwal)', 'Main terminal, counter 6'], ['Bahu Plaza', 'Near the plaza parking'], ['Gandhi Nagar', 'Opposite the main market gate']] },
  Amritsar: { lat: 31.634, lng: 74.8723, points: [['Amritsar Bus Stand', 'Platform 9, near the booking office'], ['Majitha Road Bypass', 'Highway pickup, petrol pump side'], ['Hall Gate', 'Near the old city gate']] },
  Jalandhar: { lat: 31.326, lng: 75.5762, points: [['Jalandhar Bus Stand', 'Main bus terminal, bay 5'], ['PAP Chowk', 'Highway crossing, flyover side'], ['BMC Chowk', 'Opposite the commercial complex']] },
  Chandigarh: { lat: 30.7333, lng: 76.7794, points: [['Sector 17 ISBT', 'Platform 14'], ['Sector 43 ISBT', 'Departure bay near the cafeteria'], ['Elante Mall', 'Main entrance, bus pickup lane']] },
  Ludhiana: { lat: 30.901, lng: 75.8573, points: [['Ludhiana Bus Stand', 'Platform 11'], ['Samrala Chowk', 'Highway side pickup'], ['Jagraon Bridge', 'Near the railway crossing']] },
  Ahmedabad: { lat: 23.0225, lng: 72.5714, points: [['Geeta Mandir', 'Main bus station, bay 7'], ['Paldi', 'Near the Paldi crossroads'], ['Naroda Patiya', 'Highway service road']] },
  Surat: { lat: 21.1702, lng: 72.8311, points: [['Surat Railway Station', 'Bus bay on the east exit'], ['Varachha', 'Near the diamond market gate'], ['Kadodara', 'Highway bypass, toll side']] },
  Hyderabad: { lat: 17.385, lng: 78.4867, points: [['MGBS', 'Platform 38, central bus station'], ['Lakdikapul', 'Opposite the metro station'], ['Miyapur Metro', 'Pickup bay below the metro']] },
  Vijayawada: { lat: 16.5062, lng: 80.648, points: [['PNBS Bus Station', 'Platform 14'], ['Benz Circle', 'Flyover service road'], ['Gannavaram', 'Opposite the airport road']] },
  Kolkata: { lat: 22.5726, lng: 88.3639, points: [['Esplanade', 'Bus terminus near the metro gate'], ['Karunamoyee', 'Salt Lake bus stand'], ['Ruby Crossing', 'EM Bypass, petrol pump side']] },
  Bhubaneswar: { lat: 20.2961, lng: 85.8245, points: [['Baramunda ISBT', 'Main terminal, bay 3'], ['Master Canteen', 'Next to the railway station square'], ['Jaydev Vihar', 'Under the flyover']] },
  Lucknow: { lat: 26.8467, lng: 80.9462, points: [['Alambagh Bus Station', 'Platform 8'], ['Charbagh', 'Opposite the railway station'], ['Kaiserbagh', 'Main bus stop near the old market']] },
  Kochi: { lat: 9.9312, lng: 76.2673, points: [['Vyttila Mobility Hub', 'Bus bay 2'], ['Edappally', 'Near the flyover signal'], ['Kaloor', 'Stadium junction']] },
};

// base routes (a reverse route is generated automatically). stops: [name, offset as % of journey duration]
export const BASE_ROUTES = [
  { a: 'Delhi', b: 'Jaipur', km: 280, min: 330, stops: [['Gurugram', 18], ['Behror', 48], ['Kotputli', 70]], ops: ['rajputana', 'himalayan'] },
  { a: 'Mumbai', b: 'Pune', km: 150, min: 195, stops: [['Panvel', 25], ['Lonavala', 60]], ops: ['westcoast', 'rajputana'] },
  { a: 'Bengaluru', b: 'Chennai', km: 350, min: 390, stops: [['Hosur', 15], ['Krishnagiri', 30], ['Vellore', 62]], ops: ['southern', 'westcoast'] },
  { a: 'Jammu', b: 'Amritsar', km: 215, min: 270, stops: [['Kathua', 22], ['Pathankot', 38], ['Gurdaspur', 66]], ops: ['himalayan', 'rajputana'] },
  { a: 'Amritsar', b: 'Jalandhar', km: 80, min: 100, stops: [['Beas', 55]], ops: ['himalayan', 'rajputana'] },
  { a: 'Jalandhar', b: 'Delhi', km: 365, min: 420, stops: [['Ludhiana', 15], ['Ambala', 40], ['Karnal', 70]], ops: ['himalayan', 'rajputana'] },
  { a: 'Chandigarh', b: 'Delhi', km: 245, min: 300, stops: [['Ambala', 25], ['Karnal', 60]], ops: ['himalayan', 'rajputana'] },
  { a: 'Ludhiana', b: 'Chandigarh', km: 100, min: 125, stops: [['Samrala', 45]], ops: ['himalayan', 'rajputana'] },
  { a: 'Ahmedabad', b: 'Mumbai', km: 530, min: 600, stops: [['Vadodara', 22], ['Surat', 55], ['Vapi', 75]], ops: ['westcoast', 'southern'] },
  { a: 'Ahmedabad', b: 'Surat', km: 265, min: 300, stops: [['Vadodara', 40]], ops: ['westcoast', 'southern'] },
  { a: 'Hyderabad', b: 'Bengaluru', km: 570, min: 560, stops: [['Kurnool', 40], ['Anantapur', 70]], ops: ['southern', 'westcoast'] },
  { a: 'Hyderabad', b: 'Vijayawada', km: 275, min: 300, stops: [['Suryapet', 45]], ops: ['southern', 'eastern'] },
  { a: 'Kolkata', b: 'Bhubaneswar', km: 440, min: 540, stops: [['Kharagpur', 25], ['Balasore', 60]], ops: ['eastern', 'southern'] },
  { a: 'Lucknow', b: 'Delhi', km: 555, min: 600, stops: [['Kanpur', 22], ['Agra', 70]], ops: ['rajputana', 'eastern'] },
  { a: 'Kochi', b: 'Bengaluru', km: 550, min: 660, stops: [['Palakkad', 22], ['Coimbatore', 33], ['Salem', 60]], ops: ['southern', 'eastern'] },
];

export const OPERATORS = [
  { key: 'himalayan', org: 'Himalayan Voyager Travels', email: 'operator@routeaura.test', name: 'Harpreet Singh', license: 'JK-OP-2041', buses: 7, approved: true },
  { key: 'rajputana', org: 'Rajputana Roadways', email: 'operator2@routeaura.test', name: 'Vikram Rathore', license: 'RJ-OP-1187', buses: 7, approved: true },
  { key: 'westcoast', org: 'WestCoast Coaches', email: 'operator3@routeaura.test', name: 'Nilesh Patil', license: 'MH-OP-3320', buses: 6, approved: true },
  { key: 'southern', org: 'Southern Cross Travels', email: 'operator4@routeaura.test', name: 'Karthik Raman', license: 'KA-OP-5509', buses: 7, approved: true },
  { key: 'eastern', org: 'Eastern Horizon Lines', email: 'operator5@routeaura.test', name: 'Subhajit Das', license: 'WB-OP-7764', buses: 5, approved: true },
  { key: 'newleaf', org: 'NewLeaf Tours (pending approval demo)', email: 'pending.operator@routeaura.test', name: 'Meera Joshi', license: 'GJ-OP-9001', buses: 0, approved: false },
];

export const PASSENGERS = [
  { email: 'passenger@routeaura.test', name: 'Aarav Sharma', phone: '9876500001' },
  { email: 'simran@routeaura.test', name: 'Simran Kaur', phone: '9876500002' },
  { email: 'rohan@routeaura.test', name: 'Rohan Mehta', phone: '9876500003' },
  { email: 'priya@routeaura.test', name: 'Priya Nair', phone: '9876500004' },
  { email: 'imran@routeaura.test', name: 'Imran Khan', phone: '9876500005' },
];

export const BUS_PROFILES = [
  { type: 'AC Seater', layout: 'seater-2x2', rate: 1.35, amenities: ['charging', 'water', 'cctv', 'live-tracking'] },
  { type: 'Volvo Multi-Axle', layout: 'seater-2x2', rate: 1.7, amenities: ['wifi', 'charging', 'water', 'snacks', 'cctv', 'live-tracking'] },
  { type: 'Semi-Sleeper', layout: 'semi-sleeper-2x2', rate: 1.5, amenities: ['charging', 'blanket', 'water', 'reading-light'] },
  { type: 'AC Sleeper', layout: 'sleeper-2x1', rate: 1.9, amenities: ['wifi', 'charging', 'blanket', 'water', 'reading-light', 'cctv'] },
  { type: 'Non-AC Seater', layout: 'seater-2x2', rate: 1.0, amenities: ['water'] },
];

export const BUS_NAME_PARTS = ['Aura', 'Skyline', 'Meridian', 'Zephyr', 'Horizon', 'Voyager', 'Summit', 'Cascade', 'Nimbus', 'Ember'];

export const COUPONS = [
  { code: 'WELCOME100', description: 'Flat ₹100 off on bookings above ₹500', discountType: 'flat', value: 100, minAmount: 500, usageLimit: 0 },
  { code: 'SAVE10', description: '10% off up to ₹150 on bookings above ₹600', discountType: 'percent', value: 10, maxDiscount: 150, minAmount: 600, usageLimit: 0 },
  { code: 'NIGHTOWL', description: '7% off up to ₹100 (demo offer)', discountType: 'percent', value: 7, maxDiscount: 100, minAmount: 300, usageLimit: 500 },
];

export const REVIEW_COMMENTS = [
  'Smooth ride and the driver was punctual.',
  'Comfortable seats, boarding point was easy to find.',
  'Good value for the fare. Would book again.',
  'Bus was clean, AC worked well all night.',
  'Slight delay at departure but the updates were helpful.',
  'Great legroom in the front row.',
];
