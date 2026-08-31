// Converts the pharmacy dataset (govtech static prototype, 23 Jul 2026, plus
// subsequent Drug Service review amendments) into apps/landing's
// -data/pharmacies.ts. Subsidy status comes from ./active-ppp.ts — the Drug
// Service Active PPP list. Run: node convert-pharmacies.mjs
import { writeFileSync } from 'node:fs'
import { inspect } from 'node:util'
import { ACTIVE_PPP } from './active-ppp.ts'

/* ── Prototype dataset plus reviewed amendments ── */
const PHARMACIES = [
  { id: 'gov-1', name: 'Winston Scott Polyclinic', type: 'government', address: 'Jemmotts Lane, St. Michael', parish: 'St. Michael', phone: '(246) 536-3419', hours: [ { days: [1,2,3,4,5], open: 495, close: 1320 }, { days: [6], open: 495, close: 990 } ], hoursText: 'Mon–Fri 8:15am–10pm · Sat 8:15am–4:30pm', notes: 'Latest-closing government pharmacy. The only one open Saturdays.', routes: 'Routes 11, 12 from Bridgetown Terminal (Probyn St)' },
  { id: 'gov-2', name: 'Branford Taitt Polyclinic', type: 'government', address: 'Black Rock Main Road, St. Michael', parish: 'St. Michael', phone: '(246) 536-3701', hours: [{ days: [1,2,3,4,5], open: 510, close: 990 }], hoursText: 'Mon–Fri 8:30am–4:30pm', notes: '', routes: 'Routes 11, 11A from Bridgetown Terminal' },
  { id: 'gov-3', name: 'Edgar Cochrane Polyclinic', type: 'government', address: 'Wildey, St. Michael', parish: 'St. Michael', phone: '(246) 536-4103', hours: [{ days: [1,2,3,4,5], open: 510, close: 990 }], hoursText: 'Mon–Fri 8:30am–4:30pm', notes: '', routes: 'Routes 11, 22 from Bridgetown' },
  { id: 'gov-4', name: 'Eunice Gibson Polyclinic', type: 'government', address: 'Henry Dunant Road, Warrens, St. Michael', parish: 'St. Michael', phone: '(246) 536-4000', hours: [{ days: [1,2,3,4,5], open: 495, close: 990 }], hoursText: 'Mon–Fri 8:15am–4:30pm', notes: '', routes: 'Routes 11, 11C from Bridgetown' },
  { id: 'gov-5', name: 'Randal Phillips Polyclinic', type: 'government', address: 'Oistins Main Road, Oistins, Christ Church', parish: 'Christ Church', phone: '(246) 536-4300', hours: [ { days: [1], open: 450, close: 990 }, { days: [2,3,5], open: 495, close: 990 }, { days: [4], open: 510, close: 990 } ], hoursText: 'Mon 7:30am–4:30pm · Tue, Wed & Fri 8:15am–4:30pm · Thu 8:30am–4:30pm', notes: '', routes: 'Routes 30, 31 from Bridgetown (Fairchild St Terminal)' },
  { id: 'gov-6', name: 'Frederick Miller Polyclinic', type: 'government', address: 'Glebe, St. George', parish: 'St. George', phone: '(246) 536-3940', hours: [{ days: [1,2,3,4,5], open: 510, close: 990 }], hoursText: 'Mon–Fri 8:30am–4:30pm', notes: '', routes: 'Route 3 from Bridgetown (Fairchild St Terminal)' },
  { id: 'gov-7', name: 'David Thompson Health Complex', type: 'government', address: 'Colleton Road, Glebe, St. John', parish: 'St. John', phone: '(246) 416-7000', hours: [{ days: [1,2,3,4,5], open: 510, close: 990 }], hoursText: 'Mon–Fri 8:30am–4:30pm', notes: '', routes: 'Routes 3B or 5 from Bridgetown' },
  { id: 'gov-8', name: 'Maurice Byer Polyclinic', type: 'government', address: 'Station Hill, St. Peter', parish: 'St. Peter', phone: '(246) 536-3200', hours: [{ days: [1,2,3,4,5], open: 495, close: 990 }], hoursText: 'Mon–Fri 8:15am–4:30pm', notes: '', routes: 'Route 1B from Bridgetown (Lower Green Terminal)' },
  { id: 'gov-9', name: 'St. Philip Polyclinic', type: 'government', address: 'Six Roads, St. Philip', parish: 'St. Philip', phone: '(246) 536-4215', hours: [{ days: [1,2,3,4,5], open: 495, close: 990 }], hoursText: 'Mon–Fri 8:15am–4:30pm', notes: '', routes: 'Route 10 from Bridgetown (Fairchild St Terminal)' },
  { id: 'gov-10', name: 'St. Andrew Outpatient Clinic', type: 'government', address: 'Belleplaine, St. Andrew', parish: 'St. Andrew', phone: '(246) 536-4071', hours: [ { days: [1,3], open: 495, close: 720 } ], hoursText: 'Mon & Wed 8:15am–12pm only', notes: 'Open Mondays and Wednesdays only.', routes: 'Route 2 from Bridgetown (Lower Green Terminal)' },
  { id: 'gov-11', name: 'St. Joseph Outpatient Clinic', type: 'government', address: 'Horse Hill, St. Joseph', parish: 'St. Joseph', phone: '(246) 536-3285', hours: [{ days: [2,3,5], open: 495, close: 990 }], hoursText: 'Tue, Wed & Fri 8:15am–4:30pm only', notes: 'Three days per week.', routes: 'Route 5 from Bridgetown' },
  { id: 'gov-12', name: 'St. Thomas Outpatient Clinic', type: 'government', address: 'Rock Hall, St. Thomas', parish: 'St. Thomas', phone: '(246) 536-4952', hours: [{ days: [2,4,5], open: 495, close: 990 }], hoursText: 'Tue, Thu & Fri 8:15am–4:30pm only', notes: 'Three days per week.', routes: 'Route 6 from Bridgetown' },
  { id: 'priv-1', name: 'iMart Pharmacy — Lanterns Mall', type: 'private-sbs', address: 'Lanterns Mall, Christ Church', parish: 'Christ Church', phone: '(246) 271-0346', hours: [ { days: [1,2,3,4,5,6], open: 480, close: 1200 }, { days: [0], open: 540, close: 840 } ], hoursText: 'Mon–Sat 8am–8pm · Sun 9am–2pm', notes: 'WhatsApp prescription service available.', routes: 'Routes 30, 31 from Bridgetown' },
  { id: 'priv-2', name: 'iMart Pharmacy — Sheraton Mall', type: 'private-sbs', address: "Sheraton Centre, Sargeant's Village, Christ Church", parish: 'Christ Church', phone: '(246) 436-1231', hours: [{ days: [1,2,3,4,5,6], open: 540, close: 1200 }], hoursText: 'Mon–Sat 9am–8pm · Closed Sundays', notes: 'WhatsApp prescription service available.', routes: 'Routes 11, 22 from Bridgetown' },
  { id: 'priv-3', name: 'iMart Pharmacy — Haggatt Hall', type: 'private-sbs', address: 'Haggatt Hall, St. Michael', parish: 'St. Michael', phone: '(246) 271-3784', hours: [ { days: [1,2,3,4,5,6], open: 480, close: 1200 }, { days: [0], open: 540, close: 840 } ], hoursText: 'Mon–Sat 8am–8pm · Sun 9am–2pm', notes: 'WhatsApp prescription service available.', routes: 'Routes 11, 11C from Bridgetown' },
  { id: 'priv-4', name: 'iMart Pharmacy — The Walk, Welches', type: 'private-sbs', address: 'The Walk at Welches, St. Thomas', parish: 'St. Thomas', phone: '(246) 271-3784', hours: [ { days: [1,2,3,4,5,6], open: 480, close: 1200 }, { days: [0], open: 540, close: 840 } ], hoursText: 'Mon–Sat 8am–8pm · Sun 9am–2pm', notes: 'WhatsApp prescription service available.', routes: 'Routes 30, 31 from Bridgetown' },
  { id: 'priv-5', name: 'iMart Pharmacy — Wildey Commercial Centre', type: 'private-sbs', address: 'Wildey, St. Michael', parish: 'St. Michael', phone: '(246) 826-1127', hours: [{ days: [1,2,3,4,5,6], open: 480, close: 1200 }], hoursText: 'Mon–Sat 8am–8pm · Closed Sundays', notes: 'WhatsApp prescription service available.', routes: 'Routes 11, 22 from Bridgetown' },
  { id: 'priv-6', name: 'iMart Pharmacy — Six Roads', type: 'private-sbs', address: 'Emerald Park, Six Cross Roads, St. Philip', parish: 'St. Philip', phone: '(246) 271-3784', hours: [{ days: [1,2,3,4,5,6], open: 480, close: 1200 }], hoursText: 'Mon–Sat 8am–8pm · Bank holidays 10am–2pm', notes: '', routes: 'Route 10 from Bridgetown' },
  { id: 'priv-7', name: 'iMart Pharmacy — The Estates', type: 'private-sbs', address: 'Boarded Hall, St. George', parish: 'St. George', phone: '(246) 422-4156', hours: [ { days: [1,2,3,4,5,6], open: 480, close: 1200 }, { days: [0], open: 540, close: 840 } ], hoursText: 'Mon–Sat 8am–8pm · Sun 9am–2pm · Bank holidays 10am–2pm', notes: '', routes: 'Route 3 from Bridgetown' },
  { id: 'priv-7b', name: 'iMart Pharmacy — W Plaza', type: 'private-sbs', address: 'Welches, St. Thomas', parish: 'St. Thomas', phone: '(246) 271-3784', hours: [{ days: [1,2,3,4,5,6], open: 540, close: 1080 }], hoursText: 'Mon–Sat 9am–6pm', notes: '', routes: 'Route 6 from Bridgetown' },
  { id: 'priv-8', name: 'DASAE Pharmacy (Sparman Clinic)', type: 'private', address: 'Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 624-3278', hours: [ { days: [1,2,3,4,5], open: 0, close: 1020 }, { days: [0,6], open: 0, close: 480 } ], hoursText: 'Mon–Fri midnight–5pm · Sat–Sun midnight–8am', notes: 'This pharmacy serves overnight shift workers: it opens at midnight and closes in the afternoon or morning. If you are visiting in normal daytime hours, note it is closed after 5pm on weekdays and after 8am at weekends. Always call (246) 624-3278 to confirm before visiting.', routes: 'Routes 12, 22 from Bridgetown' },
  { id: 'priv-9', name: 'HealthRite Pharmacy', type: 'private-sbs', address: 'The Specialist Centre, Black Rock Main Road, St. Michael', parish: 'St. Michael', phone: '(246) 421-3499', hours: [], hoursText: 'Call to confirm', notes: 'Blood pressure and glucose testing available.', routes: 'Routes 11, 11A from Bridgetown' },
  { id: 'priv-10', name: 'Pharmaceuticals Plus Inc', type: 'private-sbs', address: 'Omni Mall, Queen Street, Speightstown, St. Peter', parish: 'St. Peter', phone: '(246) 422-1095', hours: [], hoursText: 'Call to confirm', notes: '', routes: 'Route 1B from Bridgetown northbound' },
  { id: 'priv-12', name: 'Felimar Plus Pharmacy', type: 'private-sbs', address: 'Appleby Road, Appleby, St. James', parish: 'St. James', phone: '(246) 538-5685', hours: [], hoursText: 'Call to confirm', notes: 'Drive-through service available.', routes: 'Route 1 from Bridgetown northbound' },
  { id: 'priv-13', name: 'Lewis Drug Mart', type: 'private-sbs', address: 'Rockley Main Road, Rockley, Christ Church', parish: 'Christ Church', phone: '(246) 435-8090', hours: [], hoursText: 'Call to confirm', notes: '25+ years serving Barbadians and visitors. DATA CONFLICT: a Barbados business directory lists Lewis Drug Mart at Carmen, Rockley / Highway 7 — verify with the Drug Service.', routes: 'Routes 30, 31 from Bridgetown' },
  { id: 'priv-14', name: 'Acare Pharmacy', type: 'private-sbs', address: 'Gall Hill Medical Centre, Christ Church', parish: 'Christ Church', phone: '(246) 428-3497', hours: [], hoursText: 'Call to confirm', notes: '', routes: 'Routes 30, 31 from Bridgetown' },
  { id: 'priv-16', name: 'Cosmopolitan Pharmacy', type: 'private-sbs', address: 'Six Roads, St. Philip', parish: 'St. Philip', phone: '(246) 423-6640', hours: [], hoursText: 'Call to confirm', notes: '', routes: 'Route 10 from Bridgetown' },
  { id: 'priv-17', name: 'Market Hill Dispensary', type: 'private', address: 'Bridge Cot, St. George', parish: 'St. George', phone: '(246) 437-9909', hours: [], hoursText: 'Call to confirm', notes: '', routes: 'Route 3 from Bridgetown' },
  { id: 'priv-18', name: 'SWM Pharmacy', type: 'private', address: 'Bank Hall Plaza, Hill Road, Bank Hall, St. Michael', parish: 'St. Michael', phone: '(246) 429-7378', hours: [], hoursText: 'Call to confirm', notes: '', routes: 'Routes 2, 3 from Bridgetown' },
  { id: 'priv-19', name: 'Community Pharmacy', type: 'private-sbs', address: 'Ivy Medical Clinic, Ivy May Road, St. Michael', parish: 'St. Michael', phone: '(246) 431-8762', hours: [], hoursText: 'Call to confirm', notes: '', routes: 'Routes 11, 12 from Bridgetown' },
  { id: 'priv-20', name: 'Rxpharma & Medical Supplies Dispensary', type: 'private-sbs', address: 'Kensington New Road, St. Michael', parish: 'St. Michael', phone: '(246) 237-8374', hours: [ { days: [1,2,3,4,5], open: 480, close: 900 }, { days: [1,2,3,4,5], open: 1125, close: 1260 }, { days: [6], open: 480, close: 810 }, { days: [0], open: 480, close: 750 } ], hoursText: 'Mon–Fri 8am–3pm & 6:45pm–9pm · Sat 8am–1:30pm · Sun 8am–12:30pm', notes: 'Also (246) 237-8992.', routes: '' },
  { id: 'priv-21', name: 'BT Pharmacy', type: 'private-sbs', address: 'Sandy Crest Medical Centre, Holetown, St. James', parish: 'St. James', phone: '(246) 422-0488', hours: [ { days: [1,2,3,4,5,6], open: 480, close: 1140 }, { days: [0], open: 480, close: 960 } ], hoursText: 'Mon–Sat 8am–7pm · Sun 8am–4pm', notes: 'Hours do not change on bank holidays.', routes: 'Route 1 from Bridgetown northbound' },
  { id: 'priv-22', name: 'Top Tier Pharmacy', type: 'private-sbs', address: "Lot 51 Rouen Road, Neil's Tenantry, St. Michael", parish: 'St. Michael', phone: '(246) 547-5674', hours: [ { days: [1,3,5], open: 480, close: 1020 }, { days: [2,4], open: 480, close: 1140 }, { days: [6], open: 540, close: 1020 } ], hoursText: 'Mon, Wed & Fri 8am–5pm · Tue & Thu 8am–7pm · Sat 9am–5pm', notes: '', routes: '' },
  { id: 'priv-23', name: 'OneUp Pharmacy — Wildey Mall', type: 'private-sbs', address: 'Wildey Mall, Wildey, St. Michael', parish: 'St. Michael', phone: '(246) 828-4897', hours: [ { days: [1,2,3,4,5], open: 510, close: 930 }, { days: [6], open: 510, close: 1050 } ], hoursText: 'Mon–Fri 8:30am–3:30pm · Sat 8:30am–4:30pm · Closed Sundays', notes: 'Telephone / WhatsApp +1 (246) 426-6387. oneuppharmacy.com', routes: 'Routes 11, 22 from Bridgetown' },
  { id: 'priv-24', name: 'OneUp Pharmacy — Jemmotts Lane', type: 'private-sbs', address: 'Jemmotts Lane, St. Michael', parish: 'St. Michael', phone: '(246) 426-6387', hours: [ { days: [1,2,3,4,5], open: 480, close: 990 }, { days: [6], open: 480, close: 930 } ], hoursText: 'Mon–Fri 8am–4:30pm · Sat 8am–3:30pm · Closed Sundays', notes: 'Telephone / WhatsApp +1 (246) 426-6387. oneuppharmacy.com', routes: '' },
  { id: 'priv-25', name: 'OneUp Pharmacy — Triad Health', type: 'private-sbs', address: 'Triad Health Centre, St. Michael', parish: 'St. Michael', phone: '(246) 426-6387', hours: [ { days: [1,2,3,4,5], open: 510, close: 990 }, { days: [6], open: 540, close: 810 } ], hoursText: 'Mon–Fri 8:30am–4:30pm · Sat 9am–1:30pm · Closed Sundays', notes: 'Telephone / WhatsApp +1 (246) 426-6387. oneuppharmacy.com', routes: '' },
  { id: 'priv-26', name: 'OneUp Pharmacy — Diagnostic Medical', type: 'private-sbs', address: 'Diagnostic Medical, St. Michael', parish: 'St. Michael', phone: '(246) 426-6387', hours: [ { days: [1,2,3,4,5], open: 480, close: 900 }, { days: [6], open: 480, close: 780 } ], hoursText: 'Mon–Fri 8am–3pm · Sat 8am–1pm · Closed Sundays', notes: 'Telephone / WhatsApp +1 (246) 426-6387. oneuppharmacy.com', routes: '' },
  { id: 'priv-27', name: 'Callies Pharmacy — Bayside', type: 'private-sbs', address: 'Bayside Plaza, Bay Street, St. Michael', parish: 'St. Michael', phone: '(246) 431-9560', hours: [ { days: [1,2,3,4,5], open: 510, close: 990 }, { days: [6], open: 510, close: 840 }, { days: [0], open: 540, close: 780 } ], hoursText: 'Mon–Fri 8:30am–4:30pm · Sat 8:30am–2pm · Sun 9am–1pm · Bank holidays 9am–12pm', notes: '', routes: 'Routes 11, 12 from Bridgetown' },
  { id: 'priv-28', name: 'Callies Pharmacy — Cottage', type: 'private-sbs', address: 'Cottage Plantation, St. George', parish: 'St. George', phone: '(246) 429-9346', hours: [ { days: [1,2,3,4,5], open: 540, close: 900 }, { days: [6], open: 540, close: 780 } ], hoursText: 'Mon–Fri 9am–3pm · Sat 9am–1pm', notes: '', routes: 'Route 3 from Bridgetown' },
  { id: 'priv-29', name: 'Elcourt Pharmacy', type: 'private-sbs', address: 'Maxwell Main Road, Christ Church', parish: 'Christ Church', phone: '(246) 428-5323', hours: [], hoursText: 'Listed as 8am–10pm — call to confirm opening days', notes: 'Address and phone from a Barbados business directory — confirm opening days and whether they offer the government subsidy with the Drug Service.', routes: '' },
  { id: 'priv-30', name: 'Lyte Drug Mart', type: 'private-sbs', address: 'Brittons Cross Roads, St. Michael', parish: 'St. Michael', phone: '(246) 624-4581', hours: [], hoursText: 'Listed as 8am–5:30pm — call to confirm opening days', notes: 'Address, phone and opening days to be confirmed with the Drug Service.', routes: '' },
  { id: 'priv-31', name: 'Palmcourt Dispensary', type: 'private-sbs', address: '28 Pine Road, Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 437-8098', hours: [], hoursText: 'Listed as 8am–4:30pm — call to confirm opening days', notes: 'Address and phone from a Barbados business directory — confirm opening days and whether they offer the government subsidy with the Drug Service.', routes: '' },
  { id: 'unc-12', name: 'Holborn Pharmacy', type: 'private-sbs', address: '36A Pine Road, St. Michael', parish: 'St. Michael', phone: '(246) 430-0675', hours: [{ days: [1,2,3,4,5,6], open: 480, close: 1080 }], hoursText: 'Mon–Sat 8am–6pm', notes: 'Opening days assumed Mon–Sat — confirm with the Drug Service.', routes: '' },
  { id: 'unc-1', name: 'Ace Pharmacy', type: 'private-sbs', address: 'Pine Housing Estate, St. Michael', parish: 'St. Michael', phone: '(246) 228-2026', hours: [], hoursText: 'Call to confirm', notes: 'DATA CONFLICT: a Barbados business directory lists Ace Pharmacy at 3 10th Ave, Belleville — verify with the Drug Service.', routes: '' },
  { id: 'unc-2', name: 'Bayside Pharmacy', type: 'private', address: 'Mall Internationale, Haggatt Hall, St. Michael', parish: 'St. Michael', phone: '(246) 228-2255', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-3', name: 'C S Pharmacy', type: 'private-sbs', address: 'Trident House, Broad Street, Bridgetown', parish: 'St. Michael', phone: '(246) 427-2047', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-4', name: 'Collins Limited', type: 'private-sbs', address: 'Broad Street, Bridgetown', parish: 'St. Michael', phone: '(246) 426-4246', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-5', name: 'Delaware Dispensary', type: 'private-sbs', address: 'Jemmotts Lane, St. Michael', parish: 'St. Michael', phone: '(246) 429-7430', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-6', name: 'Eagle Hall Pharmacy', type: 'private-sbs', address: 'Eagle Hall, St. Michael', parish: 'St. Michael', phone: '(246) 427-2828', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-7', name: 'Elgar Pharmacy', type: 'private-sbs', address: '7 Thorpes, St. James', parish: 'St. James', phone: '(246) 438-5693', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-8', name: 'Family Health Pharmacy', type: 'private-sbs', address: 'Warrens Industrial Park, St. Michael', parish: 'St. Michael', phone: '(246) 421-8245', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-9', name: 'Flanders Pharmacy', type: 'private-sbs', address: '5 Ricketts Street, Bridgetown', parish: 'St. Michael', phone: '(246) 426-7198', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-10', name: 'Friendship Pharmacy', type: 'private', address: '23 Baxters Road, St. Michael', parish: 'St. Michael', phone: '(246) 438-9218', hours: [], hoursText: 'Call to confirm', notes: 'DATA CONFLICT: a Barbados business directory lists Friendship Pharmacy at Manor Lodge Complex, Lodge Hill, and shows 23 Baxters Road as Total Care Pharmacy — this address may be mislabelled. Verify with the Drug Service.', routes: '' },
  { id: 'unc-11', name: 'Grants Pharmacy & Cosmetique', type: 'private', address: 'Fairchild Street, Bridgetown', parish: 'St. Michael', phone: '(246) 228-0496', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-13', name: 'Maxwell Pharmacy', type: 'private-sbs', address: 'Maxwell, Christ Church', parish: 'Christ Church', phone: '(246) 420-2775', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-14', name: 'Medic Aid Dispensary', type: 'private', address: 'Corner Wavell Ave & Black Rock Main Rd, St. Michael', parish: 'St. Michael', phone: '(246) 425-9999', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-15', name: 'Neighbourhood Care Pharmacy', type: 'private-sbs', address: 'Rock Dundo, Cave Hill, St. Michael', parish: 'St. Michael', phone: '(246) 624-5160', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-16', name: 'Pharm-N-Care Pharmacy', type: 'private', address: 'Unit 3, Emperors Court, Worthing, Christ Church', parish: 'Christ Church', phone: '(246) 426-2601', hours: [], hoursText: 'Call to confirm', notes: 'Address, parish and phone from a Barbados business directory — confirm with the Drug Service.', routes: '' },
  { id: 'unc-17', name: 'The Pharmacy Shoppe', type: 'private', address: 'Welchman Hall, St. Thomas', parish: 'St. Thomas', phone: '(246) 438-5926', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-18', name: 'Pharmacy World Inc', type: 'private-sbs', address: 'Peterkin Road, Bank Hall, St. Michael', parish: 'St. Michael', phone: '(246) 429-0334', hours: [], hoursText: 'Call to confirm', notes: 'Address and phone from a Barbados business directory — confirm with the Drug Service.', routes: '' },
  { id: 'unc-19', name: 'Station Hill Medical Complex Pharmacy', type: 'private', address: 'Godding Road, Station Hill, St. Peter', parish: 'St. Peter', phone: '', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-20', name: 'JillAnDeeHLP — Island-wide Delivery', type: 'private', address: 'Island-wide delivery service', parish: 'All parishes', phone: '(246) 264-6768', hours: [], hoursText: 'Contact for schedule', notes: 'Delivery service available island-wide.', routes: '' },
  { id: 'unc-21', name: '1 - Stop Pharmacy', type: 'private', address: 'George Saint Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 426-8771', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-22', name: 'Alpha Pharmacy', type: 'private-sbs', address: 'Sunny Side Complex, Black Rock, St. Michael', parish: 'St. Michael', phone: '(246) 426-3499', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-23', name: 'Apothec Pharmacy', type: 'private-sbs', address: 'Worthing, Christ Church', parish: 'Christ Church', phone: '(246) 436-6337', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-24', name: 'Avis Pharmacy', type: 'private-sbs', address: '28 Thorpes Main Road, St. James', parish: 'St. James', phone: '(246) 438-4444', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-25', name: 'Belleville Dispensary', type: 'private', address: 'Corner George St & 3rd Avenue, St. Michael', parish: 'St. Michael', phone: '(246) 429-5616', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-26', name: 'Brittons Hill Dispensary', type: 'private-sbs', address: 'Corner Flagstaff & Brittons New Road, St. Michael', parish: 'St. Michael', phone: '(246) 429-5461', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-27', name: 'Callies Pharmacy — Garrison', type: 'private', address: 'Brigade House Garrison, St. Michael', parish: 'St. Michael', phone: '', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate. The number listed for this branch was the Cottage Plantation one, so it has been dropped rather than ring the wrong pharmacy.', routes: '' },
  { id: 'unc-28', name: 'Carledon Drug Emporium Inc', type: 'private', address: 'Lr Bay St, St. Michael', parish: 'St. Michael', phone: '(246) 228-2476', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-29', name: 'Carlton Pharmacy', type: 'private', address: 'Carlton Complex, Black Rock Main Road, St. Michael', parish: 'St. Michael', phone: '(246) 425-1604', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-30', name: "Cave's Pharmacy", type: 'private', address: 'Worthing Plaza, Christ Church', parish: 'Christ Church', phone: '(246) 435-7460', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-31', name: "Crayton's Pharmacy", type: 'private', address: 'Gall Hill Medical Centre, Christ Church', parish: 'Christ Church', phone: '(246) 428-3497', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-32', name: 'DNK Pharmacy', type: 'private', address: 'Wildey Main Road, St. Michael', parish: 'St. Michael', phone: '(246) 427-7070', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-33', name: 'E C Gill Drugstore', type: 'private', address: 'Marhill St, St. Michael', parish: 'St. Michael', phone: '(246) 426-2454', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-34', name: 'Eastern Pharmacy', type: 'private', address: 'Church Village, St. Philip', parish: 'St. Philip', phone: '(246) 423-4449', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-35', name: 'Elbethel Pharmacy — 2nd Avenue', type: 'private-sbs', address: '2nd Avenue, Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 437-9261', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-37', name: 'Forde C B Pharmacy Ltd', type: 'private-sbs', address: 'Shoppers Centre Black Rock, St. Michael', parish: 'St. Michael', phone: '(246) 425-9654', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-40', name: "Gill Shirley S (Gill's Pharmacy)", type: 'private', address: 'Chapel St Nr Tudor St', parish: 'St. Michael', phone: '(246) 427-2654', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-42', name: 'Griffiths Reliance Pharmacy Ltd', type: 'private', address: "Lr Dayrell's Road, St. Michael", parish: 'St. Michael', phone: '(246) 426-0438', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-43', name: 'Grosvenor Pharmacy Inc', type: 'private', address: 'Beckles Road, St. Michael', parish: 'St. Michael', phone: '(246) 436-6842', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-44', name: 'Hastings Pharmacy', type: 'private', address: 'Skyway Plaza, Christ Church', parish: 'Christ Church', phone: '(246) 429-8932', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-45', name: 'Health Care Pharmacy', type: 'private-sbs', address: '101 Devlind Lr Black Rock Tel/Fax, St. Michael', parish: 'St. Michael', phone: '(246) 425-2273', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-46', name: "Henley's Pharmacy", type: 'private-sbs', address: 'Charles Rowe Bridge, St. George, Froster Hall', parish: 'St. George', phone: '(246) 436-7417', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-47', name: 'Heritage Pharmacy', type: 'private-sbs', address: 'Spooners Hill, St. Michael', parish: 'St. Michael', phone: '(246) 425-3159', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-49', name: 'Imperial Pharmacy', type: 'private', address: 'Bethesda Black Rock, St. Michael', parish: 'St. Michael', phone: '(246) 436-1744', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-50', name: 'Jems Pharmacy', type: 'private', address: 'Jamestown Clinic Holetown, St. James', parish: 'St. James', phone: '(246) 432-6997', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-52', name: "Joe's Pharmacy", type: 'private-sbs', address: 'Oistins Main Road, Christ Church', parish: 'Christ Church', phone: '(246) 271-8990', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-53', name: 'Jones A P & Co Ltd', type: 'private-sbs', address: 'Drug Store 8 High Street, St. Michael', parish: 'St. Michael', phone: '(246) 426-3241', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-54', name: 'K C B Pharmacy', type: 'private-sbs', address: 'Brittons New Road Brittons Hill, St. Michael', parish: 'St. Michael', phone: '(246) 426-7456', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-55', name: "K O D's Pharmacy", type: 'private', address: 'Fontabelle, St. Michael', parish: 'St. Michael', phone: '(246) 228-5087', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-57', name: 'Maranatha Pharmacy', type: 'private', address: 'Rock Dundo Medical Clinic White Main Road St Michael Tel/Fax', parish: 'St. Michael', phone: '(246) 271-5736', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-59', name: 'Maycare Pharmacy', type: 'private', address: 'Emerald City Supermarket, Six Roads, St. Philip', parish: 'St. Philip', phone: '(246) 423-4937', hours: [], hoursText: 'Call to confirm', notes: 'Directory listing says open until 10pm Mon–Sat — confirm by phone. Location approximate and subsidy status not confirmed with the Drug Service.', routes: '' },
  { id: 'unc-60', name: 'Mayfield Pharmacy', type: 'private-sbs', address: 'Mayfield Medical Centre, 4th Avenue Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 427-6066', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-61', name: "Neil's Pharmacy", type: 'private', address: 'Aberfoyle Black Rock, St. Michael', parish: 'St. Michael', phone: '(246) 427-5762', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-62', name: "O'Hana Pharmacy", type: 'private-sbs', address: 'Gills Terr Speightstown, St. Peter', parish: 'St. Peter', phone: '(246) 422-1800', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-65', name: "Pearson's Pharmacies", type: 'private-sbs', address: 'Upper Collymore Rock Road, St. Michael', parish: 'St. Michael', phone: '(246) 427-5521', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-66', name: 'Pharmaco', type: 'private-sbs', address: 'Church St Speightstown, St. Peter', parish: 'St. Peter', phone: '(246) 422-1908', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-67', name: 'Pickwick Pharmacy', type: 'private', address: 'Peterkin Road Bank Hall, St. Michael', parish: 'St. Michael', phone: '(246) 430-9594', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-68', name: 'Pine Dispensary Inc', type: 'private-sbs', address: 'Pine Medical Centre 3rd Avenue Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 436-8678', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-69', name: 'Prescription Specialist Pharmacy The', type: 'private', address: '4th Avenue Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 437-3684', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-70', name: 'Prescriptions Plus Inc', type: 'private-sbs', address: 'Canary Lane Mall, St George Street, St. Michael', parish: 'St. Michael', phone: '(246) 435-7587', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-71', name: 'River Road Dispensary', type: 'private', address: 'Glendor House River Road, St. Michael', parish: 'St. Michael', phone: '(246) 429-4240', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-72', name: 'Rock Dundo Pharmacy', type: 'private', address: 'Cave Hill, St. Michael', parish: 'St. Michael', phone: '(246) 425-1088', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-73', name: 'Roebuck Pharmacy Ltd', type: 'private-sbs', address: '121 Roebuck, St. Michael', parish: 'St. Michael', phone: '(246) 436-6101', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-74', name: 'S E Well Care Pharmacy', type: 'private', address: 'ARS Medicare 6th Avenue Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 436-1099', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-75', name: 'S K Total Health Pharmacy Inc', type: 'private-sbs', address: "Rendezvous Court R'vous, Christ Church", parish: 'Christ Church', phone: '(246) 436-0140', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-76', name: 'Standard Pharmacy Ltd', type: 'private-sbs', address: 'Corner of Fairfield Road Tweedside Road, St. Michael', parish: 'St. Michael', phone: '(246) 429-3298', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-78', name: 'Total Care Pharmacy', type: 'private', address: '23 Baxters Road Opp Jordans Supermarket, St. Michael', parish: 'St. Michael', phone: '(246) 436-5241', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-80', name: 'Walkers H C Pharmacy', type: 'private-sbs', address: '47 Tudor St', parish: 'St. Michael', phone: '(246) 426-3707', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-82', name: 'Weekes L A Drug Store', type: 'private', address: 'Carlton Black Rock Main Road, St. Michael', parish: 'St. Michael', phone: '(246) 425-1046', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-83', name: 'Welches Dispensary', type: 'private', address: 'Welches, Christ Church', parish: 'Christ Church', phone: '(246) 428-1206', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-84', name: 'Whole Health Pharmacy', type: 'private-sbs', address: 'Queen Saint Speightstown, St. Peter', parish: 'St. Peter', phone: '(246) 422-5207', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-85', name: "Worrell's Pharmacy Inc", type: 'private', address: 'Wildey Shopping Plaza, St. Michael', parish: 'St. Michael', phone: '(246) 427-5468', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-86', name: 'Worthing Pharmacy', type: 'private', address: 'Worthing, Christ Church', parish: 'Christ Church', phone: '(246) 435-7041', hours: [], hoursText: 'Call to confirm', notes: 'From a Barbados business directory — location approximate.', routes: '' },
  { id: 'unc-87', name: 'Massy Pharmacy — Warrens', type: 'private-sbs', address: 'Warrens SuperCentre, St. Michael', parish: 'St. Michael', phone: '(246) 417-5232', hours: [], hoursText: 'Call to confirm', notes: 'Massy Stores pharmacy (formerly Knights) — on the Drug Service subsidised list; pharmacy hours unconfirmed — call to confirm.', routes: '' },
  { id: 'unc-88', name: 'Massy Pharmacy — Sky Mall', type: 'private-sbs', address: 'Sky Mall, Haggatt Hall, St. Michael', parish: 'St. Michael', phone: '(246) 434-1023', hours: [], hoursText: 'Call to confirm', notes: 'Massy Stores pharmacy (formerly Knights) — on the Drug Service subsidised list; pharmacy hours unconfirmed — call to confirm.', routes: '' },
  { id: 'unc-89', name: 'Massy Pharmacy — Sunset Crest', type: 'private-sbs', address: 'Sunset Crest, Holetown, St. James', parish: 'St. James', phone: '(246) 432-1290', hours: [], hoursText: 'Call to confirm', notes: 'Massy Stores pharmacy (formerly Knights) — on the Drug Service subsidised list; pharmacy hours unconfirmed — call to confirm.', routes: '' },
  { id: 'unc-91', name: 'Massy Pharmacy — Six Roads', type: 'private-sbs', address: 'Six Roads, St. Philip', parish: 'St. Philip', phone: '(246) 423-3700', hours: [], hoursText: 'Call to confirm', notes: 'Massy Stores pharmacy (formerly Knights) — on the Drug Service subsidised list; pharmacy hours unconfirmed — call to confirm.', routes: '' },
  { id: 'unc-92', name: 'Massy Pharmacy — Worthing', type: 'private-sbs', address: 'Rendezvous Road, Worthing, Christ Church', parish: 'Christ Church', phone: '(246) 435-0020', hours: [], hoursText: 'Call to confirm', notes: 'Massy Stores pharmacy (formerly Knights) — on the Drug Service subsidised list; pharmacy hours unconfirmed — call to confirm.', routes: '' },
  { id: 'unc-93', name: 'Massy Pharmacy — Oistins', type: 'private-sbs', address: 'Oistins, Christ Church', parish: 'Christ Church', phone: '(246) 428-6057', hours: [], hoursText: 'Call to confirm', notes: 'Massy Stores pharmacy (formerly Knights) — on the Drug Service subsidised list; pharmacy hours unconfirmed — call to confirm.', routes: '' },
  { id: 'unc-94', name: 'Roundhay Pharmacy', type: 'private-sbs', address: 'One Accord Plaza, Warrens Industrial Park, St. Michael', parish: 'St. Michael', phone: '(246) 537-7863', hours: [], hoursText: 'Call to confirm', notes: 'Warrens Healthcare complex.', routes: '' },
  { id: 'unc-95', name: 'Elbethel Pharmacy — 6th Avenue', type: 'private-sbs', address: 'Corner 6th Avenue, Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 622-1405', hours: [], hoursText: 'Call to confirm', notes: 'Second Elbethel branch (Lloyd A Burrowes).', routes: '' },
  { id: 'unc-96', name: 'Aqua Pharmacy', type: 'private-sbs', address: 'Coral Sands Complex, Worthing, Christ Church', parish: 'Christ Church', phone: '(246) 622-2782', hours: [ { days: [1,2,3,4,5], open: 510, close: 1020 }, { days: [6], open: 540, close: 840 } ], hoursText: 'Mon–Fri 8:30am–5pm · Sat 9am–2pm', notes: 'Hours per Aqua Pharmacy.', routes: '' },
  { id: 'unc-97', name: 'BetterLife Pharmacy', type: 'private-sbs', address: 'Building 2, 1 Friendship Drive, Green Hill, St. Michael', parish: 'St. Michael', phone: '(246) 571-3788', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-98', name: 'Get Well Pharmacy', type: 'private-sbs', address: 'Windsor Medical Centre, cnr Government Hill & Pine Plantation Rd, St. Michael', parish: 'St. Michael', phone: '(246) 622-4171', hours: [], hoursText: 'Call to confirm', notes: 'Retail counter at Windsor Medical Centre (also Wildey Industrial Estate). Confirm address and hours by phone.', routes: '' },
  { id: 'unc-99', name: 'City Pharmacy Inc', type: 'private', address: 'Marhill Street, Bridgetown, St. Michael', parish: 'St. Michael', phone: '(246) 426-2454', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'unc-100', name: 'Massy Pharmacy — Coverley', type: 'private-sbs', address: 'The Villages at Coverley, Christ Church', parish: 'Christ Church', phone: '(246) 623-7374', hours: [], hoursText: 'Call to confirm', notes: 'Massy Stores pharmacy (formerly Knights) — on the Drug Service subsidised list. Phone is the store line; pharmacy hours unconfirmed — call to confirm.', routes: '' },
  { id: 'ppp-1', name: 'Advanced Care Pharmacy', type: 'private-sbs', address: 'Harts Gap, Hastings, Christ Church', parish: 'Christ Church', phone: '(246) 228-6453', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-2', name: 'Allington Pharmacy', type: 'private-sbs', address: 'Canewood Business Centre, Canewood, St. Michael', parish: 'St. Michael', phone: '(246) 622-2070', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-3', name: 'Avida Pharmacy', type: 'private-sbs', address: 'Ellerton Building, Welches, Christ Church', parish: 'Christ Church', phone: '(246) 537-0294', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-4', name: 'Bato’s Pharmacy', type: 'private-sbs', address: 'King Street, Bridgetown, St. Michael', parish: 'St. Michael', phone: '(246) 426-1699', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-5', name: 'Belmont Pharmacy', type: 'private-sbs', address: 'Belmont Road, St. Michael', parish: 'St. Michael', phone: '(246) 241-6203', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-6', name: 'Beyond Pharmacy', type: 'private-sbs', address: '11 Dunscombe, St. Thomas', parish: 'St. Thomas', phone: '(246) 571-7640', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-7', name: 'Drugmart', type: 'private-sbs', address: 'Salters, St. George', parish: 'St. George', phone: '(246) 622-4088', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-8', name: 'Elbethel Pharmacy — Prerogative', type: 'private-sbs', address: 'Prerogative, St. George', parish: 'St. George', phone: '(246) 233-2141', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-9', name: 'Elgar Pharmacy — Market Hill', type: 'private-sbs', address: 'Market Hill, St. George', parish: 'St. George', phone: '(246) 435-4919', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-10', name: 'Elitecare Pharmacy', type: 'private-sbs', address: 'Salters Market, Salters, St. George', parish: 'St. George', phone: '(246) 622-1923', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-11', name: 'Enterprise Pharmacy', type: 'private-sbs', address: 'Enterprise Drive, Christ Church', parish: 'Christ Church', phone: '(246) 546-6979', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-12', name: 'Habibi Pharmacy', type: 'private-sbs', address: 'Riverside Medical Clinic, River Road, St. Michael', parish: 'St. Michael', phone: '(246) 826-6622', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-13', name: 'Health Care Pharmacy — Westbury Road', type: 'private-sbs', address: 'Cnr Westbury Road & St. Leonards Ave, St. Michael', parish: 'St. Michael', phone: '(246) 434-0754', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-14', name: 'Health-Sync Pharmacy', type: 'private-sbs', address: '23 Maxwell Main Rd, Christ Church', parish: 'Christ Church', phone: '(246) 258-3639', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-15', name: 'Heritage Pharmacy — Kendal Hill', type: 'private-sbs', address: 'Kendal Hill, Christ Church', parish: 'Christ Church', phone: '(246) 622-2321', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-16', name: 'Jems Pharmacy — Four Roads', type: 'private-sbs', address: 'Four Roads Medical Clinic, Four Roads, St. Philip', parish: 'St. Philip', phone: '(246) 537-0231', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-17', name: 'J & J Pharma-C', type: 'private-sbs', address: '#1 Cnr Sharon & Arthur Seat, St. Thomas', parish: 'St. Thomas', phone: '(246) 537-2099', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-18', name: 'Massy Pharmacy — Sargeants Village', type: 'private-sbs', address: 'Sargeants Village, Christ Church', parish: 'Christ Church', phone: '(246) 429-7107', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-19', name: 'Medshop Pharmacy', type: 'private-sbs', address: '“Hammersmith House” 3rd Ave Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 622-4041', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-20', name: 'Medpro Pharmacy', type: 'private-sbs', address: 'Prerogative House, Wilkinson Road, Prerogative, St. George', parish: 'St. George', phone: '(246) 285-0772', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-21', name: 'Neighbourhood Care Pharmacy — Bank Hall', type: 'private-sbs', address: 'Bank Hall Medical Clinic, Bank Hall, St. Michael', parish: 'St. Michael', phone: '(246) 427-0317', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-22', name: 'Nutripharm Services Inc', type: 'private-sbs', address: 'Blades Hill, St. Philip', parish: 'St. Philip', phone: '(246) 271-2653', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-23', name: 'Phillips Pharmacy', type: 'private-sbs', address: '287 Crystal Heights, St. James', parish: 'St. James', phone: '(246) 232-9069', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-24', name: 'Prescriptions Online', type: 'private-sbs', address: 'Venture #3, St. John', parish: 'St. John', phone: '(246) 433-2048', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-25', name: 'Price Drug Mart', type: 'private-sbs', address: '2nd Ave Godding Rd, Station Hill, St. Michael', parish: 'St. Michael', phone: '(246) 824-1215', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-26', name: 'Rosegate Pharmacy', type: 'private-sbs', address: 'RoseGate Medical Centre, Rosegate, St. John', parish: 'St. John', phone: '(246) 271-2745', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-27', name: 'Strathclyde Pharmacy & Health Shop', type: 'private-sbs', address: 'Peterkin Rd, Bank Hall, St. Michael', parish: 'St. Michael', phone: '(246) 622-1970', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-28', name: 'TDL Pharmacy', type: 'private-sbs', address: 'No.3 W H Golden Plaza, Montrose, Christ Church', parish: 'Christ Church', phone: '(246) 537-0057', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-29', name: 'The Pharmacy Hub', type: 'private-sbs', address: 'Spry Street, Bridgetown, St. Michael', parish: 'St. Michael', phone: '(246) 436-0172', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-30', name: 'Total Care Pharmacy — Emerald City', type: 'private-sbs', address: 'Emerald City Supermarket, Six Roads, St. Philip', parish: 'St. Philip', phone: '(246) 423-1213', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-31', name: 'Unique Pharmacy', type: 'private-sbs', address: 'Ocean View Medical, St. Martins, St. Philip', parish: 'St. Philip', phone: '(246) 622-1797', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-32', name: 'Vitalpharm Pharmacy', type: 'private-sbs', address: '4th Ave Belleville, St. Michael', parish: 'St. Michael', phone: '(246) 627-9238', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-33', name: 'We Care Pharmacy', type: 'private-sbs', address: 'Pilgrim Road, Christ Church', parish: 'Christ Church', phone: '(246) 538-2273', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-34', name: 'Welches Pharmacy', type: 'private-sbs', address: '#43 Kingston Terrace, Welches, St. Michael', parish: 'St. Michael', phone: '(246) 538-0141', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
  { id: 'ppp-35', name: 'Wellhouse Dispensary', type: 'private-sbs', address: 'Wellhouse Corner, Wellhouse, St. Philip', parish: 'St. Philip', phone: '(246) 423-3896', hours: [], hoursText: 'Call to confirm', notes: '', routes: '' },
]

const COORDS = {
  'priv-30': [13.088571, -59.596507],
  'unc-95': [13.096861, -59.602114], 'unc-96': [13.070148, -59.579202], 'unc-97': [13.13687, -59.605941],
  'unc-98': [13.101385, -59.591569], 'unc-99': [13.097765, -59.613279], 'unc-100': [13.086209, -59.501558],
  'gov-1': [13.091964, -59.607581], 'gov-2': [13.118089, -59.618137], 'gov-3': [13.092702, -59.586323],
  'gov-4': [13.141018, -59.605905], 'gov-5': [13.062149, -59.540746], 'gov-6': [13.135065, -59.563367],
  'gov-7': [13.18188, -59.496353], 'gov-8': [13.25357, -59.638514], 'gov-9': [13.118084, -59.476286],
  'gov-10': [13.245670, -59.562925], 'gov-11': [13.200490, -59.538843], 'gov-12': [13.186991, -59.604351],
  'priv-1': [13.076846, -59.594315], 'priv-2': [13.083436, -59.567168], 'priv-3': [13.108148, -59.578662],
  'priv-4': [13.155160, -59.610324], 'priv-5': [13.092504, -59.584983], 'priv-6': [13.114636, -59.478382],
  'priv-7': [13.108848, -59.543596], 'priv-7b': [13.152919, -59.614320], 'priv-8': [13.096193, -59.604597],
  'priv-9': [13.117804, -59.603729], 'priv-10': [13.249397, -59.643499],
  'priv-12': [13.154253, -59.636022], 'unc-12': [13.095956, -59.601443], 'priv-13': [13.072427, -59.590732],
  'priv-14': [13.079943, -59.538333], 'priv-16': [13.115907, -59.475789],
  'priv-17': [13.150422, -59.556477], 'priv-18': [13.113246, -59.610157], 'priv-19': [13.117282, -59.599367],
  'priv-20': [13.101808, -59.618736], 'priv-21': [13.182416, -59.635393], 'priv-22': [13.119435, -59.599597],
  'priv-23': [13.093396, -59.583396], 'priv-24': [13.092381, -59.608722], 'priv-25': [13.119856, -59.599402],
  'priv-26': [13.119736, -59.599475], 'priv-27': [13.085684, -59.608612], 'priv-28': [13.154822, -59.553607],
  'unc-1': [13.097930, -59.605172], 'unc-2': [13.096997, -59.597342], 'unc-3': [13.100240, -59.617016],
  'unc-4': [13.100006, -59.616987], 'unc-5': [13.092888, -59.608285], 'unc-6': [13.111866, -59.615160],
  'unc-7': [13.176701, -59.638591], 'unc-8': [13.143432, -59.607430], 'unc-9': [13.100169, -59.617014],
  'unc-10': [13.104791, -59.618223], 'unc-11': [13.098974, -59.616191], 'unc-13': [13.070873, -59.563742],
  'unc-14': [13.099340, -59.626111], 'unc-15': [13.136058, -59.626065], 'unc-16': [13.076596, -59.577950],
  'unc-17': [13.189991, -59.577626], 'unc-18': [13.110854, -59.613587], 'unc-19': [13.251389, -59.639723],
  'unc-21': [13.097735, -59.603193], 'unc-22': [13.099174, -59.611161], 'unc-23': [13.070991, -59.580453],
  'unc-24': [13.151059, -59.623756], 'unc-25': [13.101584, -59.611308], 'unc-26': [13.101550, -59.611341],
  'unc-27': [13.101481, -59.611396], 'unc-28': [13.101387, -59.611467], 'unc-29': [13.101257, -59.611560],
  'unc-30': [13.070723, -59.579373], 'unc-31': [13.070256, -59.540740], 'unc-32': [13.093217, -59.592847],
  'unc-33': [13.097549, -59.613494], 'unc-34': [13.138901, -59.488371], 'unc-35': [13.099119, -59.611222],
  'unc-37': [13.098800, -59.611047], 'unc-40': [13.097926, -59.609707],
  'unc-42': [13.097918, -59.609191], 'unc-43': [13.087087, -59.604372], 'unc-44': [13.074388, -59.596224],
  'unc-45': [13.100699, -59.607210], 'unc-46': [13.130525, -59.550329], 'unc-47': [13.122228, -59.609911],
  'unc-49': [13.102518, -59.610162], 'unc-50': [13.181214, -59.634549], 'unc-52': [13.065204, -59.544351],
  'unc-53': [13.101667, -59.611318], 'unc-54': [13.085751, -59.591351], 'unc-55': [13.106023, -59.624670],
  'unc-57': [13.099622, -59.611827], 'unc-59': [13.119513, -59.461140], 'unc-60': [13.094231, -59.603082],
  'unc-61': [13.098741, -59.611061], 'unc-62': [13.250727, -59.641291], 'unc-65': [13.097887, -59.609592],
  'unc-66': [13.250617, -59.640794], 'unc-67': [13.110587, -59.613429], 'unc-68': [13.098250, -59.608056],
  'unc-69': [13.095020, -59.601459], 'unc-70': [13.097115, -59.616704], 'unc-71': [13.100779, -59.607199],
  'unc-72': [13.135653, -59.627371], 'unc-73': [13.103757, -59.606956], 'unc-74': [13.102913, -59.609270],
  'unc-75': [13.071846, -59.539509], 'unc-76': [13.102549, -59.610225], 'unc-78': [13.102003, -59.611109],
  'unc-80': [13.101937, -59.618601], 'unc-82': [13.100388, -59.612247], 'unc-83': [13.065187, -59.549856],
  'unc-84': [13.249468, -59.643620], 'unc-85': [13.098770, -59.611737], 'unc-86': [13.071095, -59.581476],
  'unc-87': [13.140182, -59.607680], 'unc-88': [13.106699, -59.577748], 'unc-89': [13.185508, -59.637305],
  'unc-91': [13.117812, -59.477786], 'unc-92': [13.073487, -59.581698], 'unc-93': [13.063301, -59.542029],
  'unc-94': [13.144871, -59.604204],
  'ppp-30': [13.113997, -59.474283],
}

/* ── Transform ── */
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_INDEX_TO_KEY = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }

const toHHMM = (m) => {
  if (m === 1440) return '24:00'
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const slugify = (name) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const GENERIC_HOURS_TEXT = new Set(['Call to confirm', 'Contact for schedule'])

const records = PHARMACIES.map((p) => {
  const record = { name: p.name, type: p.type, parish: p.parish, address: p.address, phone: p.phone }

  if (p.hours.length > 0) {
    const week = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
    for (const slot of p.hours) {
      for (const day of slot.days) {
        week[DAY_INDEX_TO_KEY[day]].push({ opens: toHHMM(slot.open), closes: toHHMM(slot.close) })
      }
    }
    for (const key of WEEKDAYS) {
      week[key].sort((a, b) => a.opens.localeCompare(b.opens))
      let prev = ''
      for (const r of week[key]) {
        if (r.opens >= r.closes) throw new Error(`${p.id}: ${key} range ${r.opens}-${r.closes} not ascending`)
        if (r.opens < prev) throw new Error(`${p.id}: ${key} overlapping ranges`)
        prev = r.closes
      }
    }
    record.hours = week
  }

  const noteParts = []
  // Keep hoursText nuance the structured model cannot express.
  if (p.hours.length === 0 && !GENERIC_HOURS_TEXT.has(p.hoursText)) noteParts.push(`${p.hoursText}.`.replace(/\.\./g, '.'))
  for (const part of p.hoursText.split('·').map((s) => s.trim())) {
    if (/bank holiday/i.test(part) && p.hours.length > 0) noteParts.push(`${part}.`)
  }
  if (p.notes) noteParts.push(p.notes)
  if (noteParts.length > 0) record.notes = noteParts.join(' ')

  if (p.routes) record.routes = p.routes
  const ll = COORDS[p.id]
  if (ll) record.coords = { lat: ll[0], lon: ll[1] }

  // A WhatsApp ordering button appears only where the source names an
  // explicit WhatsApp number ("Telephone / WhatsApp +1 (246) 426-6387").
  // A bare "WhatsApp service available" note is NOT enough — guessing the
  // store phone produced dead wa.me links (iMart, spotted in review).
  const wa = p.notes.match(/WhatsApp \+?1?\s*(\(246\)\s*\d{3}-\d{4})/i)
  if (wa) record.whatsapp = wa[1].replace(/\s+/, ' ')

  return record
})

/* ── Validate ── */
// 'private-sbs' means "on the Active PPP list". pharmacies.test.ts asserts
// that both ways round; what only makes sense here is the advisory below.
const pppPhones = new Set(ACTIVE_PPP.flatMap((p) => p.tel.map((t) => t.replace(/\D/g, '').slice(-7))))
const phoneOf = (r) => r.phone.replace(/\D/g, '').slice(-7)
// A full-price record sharing a PPP number is usually the same counter under
// an older trading name. Judgement call for the Drug Service, not a build
// break — but never silent, or the finder shows one pharmacy twice with
// contradictory cost.
const suspectedDuplicates = records.filter((r) => r.type === 'private' && r.phone && pppPhones.has(phoneOf(r)))
for (const r of suspectedDuplicates) {
  console.warn(`  ! ${r.name} (${r.address}) is full-price but its number is on the Active PPP list — likely the same counter as a participating record. Confirm with the Drug Service.`)
}

const slugs = new Set()
for (const r of records) {
  const slug = slugify(r.name)
  if (!slug) throw new Error(`empty slug for ${r.name}`)
  if (slugs.has(slug)) throw new Error(`slug collision: ${slug}`)
  slugs.add(slug)
}
const counts = records.reduce((acc, r) => ((acc[r.type] = (acc[r.type] ?? 0) + 1), acc), {})
console.log(`records: ${records.length}`, counts, `with coords: ${records.filter((r) => r.coords).length}`, `with hours: ${records.filter((r) => r.hours).length}`)

/* ── Emit ── */
const body = records
  .map((r) => `  ${inspect(r, { depth: null, breakLength: 78, compact: true }).replace(/\n/g, '\n  ')},`)
  .join('\n')

const file = `/**
 * Pharmacies — Barbados
 * --------------------------------------------------------------
 * Single source of truth for the pharmacy finder at
 * /health-and-emergency-services/find-an-open-pharmacy.
 *
 * GENERATED from the GovTech pharmacy prototype dataset (23 July 2026), with
 * subsequent Drug Service review amendments — do not hand-edit records;
 * regenerate via the conversion script instead.
 * Provenance: 'private-sbs' is membership of the Drug Service Active PPP list
 * (supplied 31 August 2026, transcribed in -data/active-ppp.ts); a private
 * pharmacy absent from that list is 'private' and charges full price.
 * Government dispensaries come from the Drug Service register, verified May
 * 2026. Known conflicts are flagged in each record's notes. Keep
 * META.visibility 'preview' until the Drug Service signs the data off.
 */

export const PARISHES = [
  'Christ Church',
  'St. Andrew',
  'St. George',
  'St. James',
  'St. John',
  'St. Joseph',
  'St. Lucy',
  'St. Michael',
  'St. Peter',
  'St. Philip',
  'St. Thomas',
] as const

export type Parish = (typeof PARISHES)[number]

/** Weekday keys, Monday first (display order). */
export const WEEKDAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const

export type Weekday = (typeof WEEKDAYS)[number]

/**
 * One continuous opening period within a single day, 24-hour 'HH:MM'
 * wall-clock. Semantics are [opens, closes): open at 'opens' exactly,
 * closed at 'closes' exactly.
 */
export interface TimeRange {
  /** '00:00'–'23:59'. */
  opens: string
  /** Must be later than opens; '24:00' means end of day. */
  closes: string
}

/**
 * Opening ranges per day, earliest first. [] = closed that day; two ranges =
 * a split shift; a single 00:00–24:00 range = open 24 hours.
 */
export type WeeklyHours = Readonly<Record<Weekday, ReadonlyArray<TimeRange>>>

export interface LatLon {
  lat: number
  lon: number
}

/**
 * What the visit costs — the reader's decision variable.
 * government = free polyclinic dispensary; private-sbs = participating
 * private pharmacy, on the Drug Service Active PPP list (small dispensing
 * fee); private = a private pharmacy that is not on that list, so the patient
 * pays the full price.
 */
export type PharmacyType = 'government' | 'private-sbs' | 'private'

export interface Pharmacy {
  name: string
  type: PharmacyType
  /** 'All parishes' is the island-wide delivery service. */
  parish: Parish | 'All parishes'
  address: string
  /** Display form '(246) NNN-NNNN'; '' when no number is listed. */
  phone: string
  /** Absent = opening hours not confirmed — open/closed state is unknown. */
  hours?: WeeklyHours
  /** Geocoded point, used for the "Use my location" distance sort. */
  coords?: LatLon
  notes?: string
  /** Bus routes from Bridgetown, when known. */
  routes?: string
  /**
   * Confirmed WhatsApp ordering number, display form '(246) NNN-NNNN'.
   * Only set where the pharmacy explicitly published one — a dead wa.me
   * link is worse than no button.
   */
  whatsapp?: string
}

export const PHARMACIES_LAST_UPDATED = '2026-08-31'
export const PHARMACIES_NEXT_REVIEW = '2027-01-01'
/** When the Drug Service register of government dispensaries was verified. */
export const REGISTER_VERIFIED = 'May 2026'
/** When the Drug Service supplied the Active PPP list. */
export const PPP_LIST_UPDATED = 'August 2026'

export const PHARMACIES: ReadonlyArray<Pharmacy> = [
${body}
]

export const PHARMACY_COUNT = PHARMACIES.length
`

writeFileSync(
  new URL(
    'file:///Users/phrog/Code/gov-bb/apps/landing/src/routes/health-and-emergency-services/find-an-open-pharmacy/-data/pharmacies.ts',
  ),
  file,
)
console.log('wrote pharmacies.ts')
