/** Serialisable shapes shared by the requests Server Actions and the drawer (pure TS). */

export type RequestLead = {
  id: string;
  status: string;
  waveNo: number;
  matchScore: number | null;
  offerPrice: number | null;
  offerNote: string | null;
  seenAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  business: { id: string; name: string; slug: string; phone: string | null } | null;
};

export type RequestCandidate = { businessId: string; name: string; areaMatch: boolean; score: number };

export type RequestDetail = {
  id: string;
  code: string;
  status: string;
  createdAt: string;
  closedAt: string | null;
  whenType: string;
  whenDate: string | null;
  note: string | null;
  addressNote: string | null;
  photos: string[];
  hidePhone: boolean;
  acceptedCount: number;
  maxProviders: number;
  dispatchNote: string | null;
  isDemo: boolean;
  category: { id: string; name: string; parentName: string | null; autoDispatch: boolean; notifyPoolSize: number };
  /** District (ilçe) display name. */
  district: string | null;
  customer: { id: string; name: string | null; phone: string | null; status: string } | null;
  flowVersion: number | null;
  answers: Array<{ title: string; answer: string }>;
  leads: RequestLead[];
  candidates: RequestCandidate[] | null;
  canDispatch: boolean;
  nextWave: number;
};

export type DispatchResult = { leadCount: number; totalLeads: number; fallback: boolean; status: string };
