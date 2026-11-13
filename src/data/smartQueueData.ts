export type LanguageCode = 'en' | 'te' | 'hi';

export type QueuePriority = 'standard' | 'senior' | 'emergency' | 'appointment';

export type EntryChannel = 'App QR' | 'Missed Call' | 'SMS' | 'Audio Kiosk';

export type CounterStatus = 'Serving' | 'Busy' | 'Closed';

export interface ServiceQueue {
  id: string;
  prefix: string;
  name: string;
  location: string;
  priority: QueuePriority;
  fee: string;
  avgServiceMinutes: number;
  servingNumber: number;
  nextIssueNumber: number;
  waitingCount: number;
  predictionConfidence: number;
}

export interface CounterUnit {
  id: string;
  label: string;
  staffName: string;
  queueId: string;
  queueName: string;
  status: CounterStatus;
  currentToken: string;
  avgCycleMins: number;
}

export interface TokenRosterItem {
  tokenId: string;
  citizenName: string;
  queueId: string;
  queueName: string;
  channel: EntryChannel;
  priority: QueuePriority;
  status: 'Waiting' | 'Serving' | 'Grace' | 'Completed';
  joinedAt: string;
  etaMinutes: number;
}

export interface ActivitySuggestion {
  id: string;
  title: string;
  venue: string;
  distance: string;
  durationMinutes: number;
  category: string;
}

export interface HourlyTrafficPoint {
  hour: string;
  footfall: number;
  avgWaitMins: number;
  isPeak?: boolean;
  isRecommended?: boolean;
}

export interface FacilityInfo {
  id: string;
  name: string;
  city: string;
  code: string;
}

export const FACILITIES: FacilityInfo[] = [
  {
    id: 'vja-hospital',
    name: 'District Govt Civil Hospital',
    city: 'Vijayawada',
    code: 'SQ-VJA-01',
  },
  {
    id: 'eseva-center',
    name: 'Municipal Civic e-Seva Kendra',
    city: 'Vijayawada Central',
    code: 'SQ-CIV-04',
  },
  {
    id: 'passport-kendra',
    name: 'Regional Passport Seva Kendra',
    city: 'Benz Circle',
    code: 'SQ-PSK-02',
  },
];

export const INITIAL_QUEUES: ServiceQueue[] = [
  {
    id: 'general-opd',
    prefix: 'A',
    name: 'General OPD',
    location: 'Room 104',
    priority: 'standard',
    fee: '₹0 fee',
    avgServiceMinutes: 3.5,
    servingNumber: 36,
    nextIssueNumber: 42,
    waitingCount: 14,
    predictionConfidence: 92,
  },
  {
    id: 'senior-citizen',
    prefix: 'S',
    name: 'Senior Citizen Express',
    location: 'Room 101',
    priority: 'senior',
    fee: 'Priority Desk',
    avgServiceMinutes: 4.0,
    servingNumber: 12,
    nextIssueNumber: 15,
    waitingCount: 5,
    predictionConfidence: 96,
  },
  {
    id: 'emergency-triage',
    prefix: 'E',
    name: 'Emergency Triage',
    location: 'Trauma Bay',
    priority: 'emergency',
    fee: 'Immediate Slot',
    avgServiceMinutes: 2.0,
    servingNumber: 4,
    nextIssueNumber: 5,
    waitingCount: 2,
    predictionConfidence: 98,
  },
  {
    id: 'online-appointment',
    prefix: 'Q',
    name: 'Online Pre-Booked',
    location: 'Desk 5',
    priority: 'appointment',
    fee: 'QR / Booking ID',
    avgServiceMinutes: 3.0,
    servingNumber: 20,
    nextIssueNumber: 24,
    waitingCount: 7,
    predictionConfidence: 94,
  },
];

export const INITIAL_COUNTERS: CounterUnit[] = [
  {
    id: 'c1',
    label: 'Counter 1',
    staffName: 'Dr. Priya Sharma',
    queueId: 'senior-citizen',
    queueName: 'Senior Citizen Express',
    status: 'Busy',
    currentToken: 'S-12',
    avgCycleMins: 4,
  },
  {
    id: 'c2',
    label: 'Counter 2',
    staffName: 'Dr. K. Venkatesh',
    queueId: 'general-opd',
    queueName: 'General OPD',
    status: 'Serving',
    currentToken: 'A-36',
    avgCycleMins: 3.5,
  },
  {
    id: 'c3',
    label: 'Counter 3',
    staffName: 'Dr. Anita Rao (Standby)',
    queueId: 'general-opd',
    queueName: 'General OPD Overflow',
    status: 'Closed',
    currentToken: '—',
    avgCycleMins: 3.5,
  },
  {
    id: 'c4',
    label: 'Counter 4',
    staffName: 'Triage Nurse Desk',
    queueId: 'emergency-triage',
    queueName: 'Emergency Triage',
    status: 'Serving',
    currentToken: 'E-04',
    avgCycleMins: 2,
  },
];

export const INITIAL_ROSTER: TokenRosterItem[] = [
  {
    tokenId: 'A-36',
    citizenName: 'Srinivas Rao',
    queueId: 'general-opd',
    queueName: 'General OPD',
    channel: 'App QR',
    priority: 'standard',
    status: 'Serving',
    joinedAt: '10:34 AM',
    etaMinutes: 0,
  },
  {
    tokenId: 'A-37',
    citizenName: 'Lakshmi Devi',
    queueId: 'general-opd',
    queueName: 'General OPD',
    channel: 'Missed Call',
    priority: 'standard',
    status: 'Waiting',
    joinedAt: '10:38 AM',
    etaMinutes: 4,
  },
  {
    tokenId: 'S-12',
    citizenName: 'Subbaiah Naidu',
    queueId: 'senior-citizen',
    queueName: 'Senior Citizen Express',
    channel: 'Audio Kiosk',
    priority: 'senior',
    status: 'Serving',
    joinedAt: '10:41 AM',
    etaMinutes: 0,
  },
  {
    tokenId: 'A-39',
    citizenName: 'Ramesh Kumar',
    queueId: 'general-opd',
    queueName: 'General OPD',
    channel: 'App QR',
    priority: 'standard',
    status: 'Waiting',
    joinedAt: '10:44 AM',
    etaMinutes: 11,
  },
  {
    tokenId: 'Q-21',
    citizenName: 'Ayesha Begum',
    queueId: 'online-appointment',
    queueName: 'Online Pre-Booked',
    channel: 'App QR',
    priority: 'appointment',
    status: 'Waiting',
    joinedAt: '10:46 AM',
    etaMinutes: 6,
  },
  {
    tokenId: 'E-05',
    citizenName: 'Kiran Babu',
    queueId: 'emergency-triage',
    queueName: 'Emergency Triage',
    channel: 'Audio Kiosk',
    priority: 'emergency',
    status: 'Waiting',
    joinedAt: '10:50 AM',
    etaMinutes: 2,
  },
  {
    tokenId: 'A-40',
    citizenName: 'Padmavathi M.',
    queueId: 'general-opd',
    queueName: 'General OPD',
    channel: 'SMS',
    priority: 'standard',
    status: 'Waiting',
    joinedAt: '10:52 AM',
    etaMinutes: 14,
  },
];

export const FREE_TIME_ACTIVITIES: ActivitySuggestion[] = [
  {
    id: 'act-canteen',
    title: 'Annapurna Canteen',
    venue: 'Tea & light refreshments',
    distance: '120 m away',
    durationMinutes: 8,
    category: 'Refreshment',
  },
  {
    id: 'act-eseva',
    title: 'Civic e-Seva Desk',
    venue: 'Pay utility or power bills',
    distance: 'Room 12',
    durationMinutes: 5,
    category: 'Errand',
  },
  {
    id: 'act-pharmacy',
    title: 'Jan Aushadhi Kendra',
    venue: 'Verify generic medicine stock',
    distance: '85 m away',
    durationMinutes: 7,
    category: 'Pharmacy',
  },
  {
    id: 'act-garden',
    title: 'Courtyard Green Garden',
    venue: 'Shaded outdoor seating',
    distance: '60 m away',
    durationMinutes: 15,
    category: 'Rest',
  },
  {
    id: 'act-health',
    title: 'Health Literacy Read',
    venue: 'Preventive care & hydration guide',
    distance: 'Digital',
    durationMinutes: 10,
    category: 'Wellness',
  },
  {
    id: 'act-audio',
    title: '5-Min Guided Breathing',
    venue: 'Reduce waiting-room fatigue',
    distance: 'Audio',
    durationMinutes: 5,
    category: 'Calm',
  },
];

export const HOURLY_TRAFFIC: HourlyTrafficPoint[] = [
  { hour: '8 AM', footfall: 28, avgWaitMins: 8 },
  { hour: '9 AM', footfall: 52, avgWaitMins: 14 },
  { hour: '10 AM', footfall: 84, avgWaitMins: 24, isPeak: true },
  { hour: '11 AM', footfall: 98, avgWaitMins: 31, isPeak: true },
  { hour: '12 PM', footfall: 68, avgWaitMins: 19 },
  { hour: '1 PM', footfall: 44, avgWaitMins: 12 },
  { hour: '2 PM', footfall: 24, avgWaitMins: 6, isRecommended: true },
  { hour: '3 PM', footfall: 34, avgWaitMins: 9, isRecommended: true },
  { hour: '4 PM', footfall: 48, avgWaitMins: 13 },
];

export const I18N: Record<
  LanguageCode,
  {
    navCitizen: string;
    navOrg: string;
    navAnalytics: string;
    navGuide: string;
    chooseService: string;
    getToken: string;
    freePlanner: string;
    trustLabel: string;
    nowServing: string;
    predictedWait: string;
    universalAccess: string;
    cancelToken: string;
    graceTitle: string;
    swapTitle: string;
  }
> = {
  en: {
    navCitizen: 'Citizen Portal',
    navOrg: 'Organisation Console',
    navAnalytics: 'Analytics & SDGs',
    navGuide: 'How It Works',
    chooseService: 'Select Service Queue',
    getToken: 'Generate Virtual Token',
    freePlanner: 'Free-Time Planner',
    trustLabel: 'Trust',
    nowServing: 'Now Serving',
    predictedWait: 'Predicted Wait',
    universalAccess: 'Universal Access & Inclusion',
    cancelToken: 'Cancel Token & Free Capacity',
    graceTitle: '5-Minute Grace Slot Active',
    swapTitle: 'Peer Token Swap',
  },
  te: {
    navCitizen: 'పౌర పోర్టల్',
    navOrg: 'సంస్థ కన్సోల్',
    navAnalytics: 'విశ్లేషణ & SDGలు',
    navGuide: 'ఎలా పనిచేస్తుంది',
    chooseService: 'సేవా విభాగాన్ని ఎంచుకోండి',
    getToken: 'వర్చువల్ టోకెన్ పొందండి',
    freePlanner: 'ఖాళీ సమయ ప్రణాళిక',
    trustLabel: 'విశ్వసనీయత',
    nowServing: 'ప్రస్తుత టోకెన్',
    predictedWait: 'అంచనా వేచి ఉండే సమయం',
    universalAccess: 'సార్వత్రిక ప్రవేశం (ఫోన్ లేకపోయినా)',
    cancelToken: 'టోకెన్ రద్దు చేయండి',
    graceTitle: '5 నిమిషాల గ్రేస్ సమయం',
    swapTitle: 'టోకెన్ మార్పిడి',
  },
  hi: {
    navCitizen: 'नागरिक पोर्टल',
    navOrg: 'संस्थान कंसोल',
    navAnalytics: 'विश्लेषण और SDG',
    navGuide: 'यह कैसे काम करता है',
    chooseService: 'सेवा श्रेणी चुनें',
    getToken: 'डिजिटल टोकन प्राप्त करें',
    freePlanner: 'खाली समय योजना',
    trustLabel: 'विश्वास',
    nowServing: 'वर्तमान टोकन',
    predictedWait: 'अनुमानित प्रतीक्षा',
    universalAccess: 'सार्वभौमिक पहुँच (बिना ऐप के)',
    cancelToken: 'टोकन रद्द करें',
    graceTitle: '5 मिनट का ग्रेस स्लॉट सक्रिय',
    swapTitle: 'टोकन अदला-बदली',
  },
};
