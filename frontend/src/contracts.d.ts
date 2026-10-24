export type Id = string;
/** The 10 canonical topic ids from data/program/topics.json (src/data/topics.js). */
export type TopicId = 'cheese-dairy' | 'tomatoes-sauce' | 'dough-flour' | 'meats-toppings' | 'spices-seasonings' | 'ovens-equipment' | 'supply-chain-packaging' | 'brick-and-mortar' | 'chefs-culinary' | 'tech-ordering-delivery';
/** Attendee ids are the dataset's PE27-xxxxx ids; badge tokens are the same ids. */
export type AttendeeId = string;
export type Goal = 'suppliers' | 'peers' | 'growth' | 'explore';
export type Focus = '' | TopicId | 'other';
export interface Profile {
  name: string; role: string; company: string;
  businessType: 'pizzeria' | 'supplier' | 'distributor' | 'other';
  context: string; linkedin: string; goals: Goal[]; focus: Focus; intention: string;
  goalFocus?: Partial<Record<Goal, Focus>>;
}
export interface Person {
  id: Id; name: string; role: string; company: string; initials: string;
  color: 'peach' | 'sage' | 'lavender' | 'sand' | 'rose' | 'blue';
  category: string; location: string; bio: string; offering: string; lookingFor: string;
  businessType?: string; topics: TopicId[]; slot: string; place: string; badge?: AttendeeId;
}
export interface Encounter { id: Id; personId: Id; kind: 'chosen_qr_connection'; createdAt: string }
export type NextInterest = '' | TopicId;
/** Local summary of the attendee's own speed-date survey (met + topics discussed), used for local recommendations. */
export interface Feedback {
  meetingId: Id; next: NextInterest; topics?: TopicId[];
  attendance: 'not_met' | 'reported_attended' | 'unknown'; submittedAt: string;
  usefulness?: 'yes' | 'somewhat' | 'no' | 'didnt_meet'; // dormant earlier arranged-meetup feedback
}
export interface ConnectionPathNode { id: Id; name: string }
export interface Recommendation { person: Person; reason: string; source: string; path: ConnectionPathNode[] }
export interface Meeting { id: Id; personId: Id; time: string; location: string; reason: string; status: 'scheduled' | 'completed'; feedbackRequired?: boolean; surveyComplete?: boolean }
export interface MeetingRequest {
  id: Id; fromId: Id; toId: Id; status: 'pending' | 'accepted' | 'declined';
  time: string; location: string; createdAt: string | null; respondedAt?: string;
}
export interface PeerInbox {
  viewer: Person;
  requests: (MeetingRequest & { sender: Profile & { id: Id } })[];
}
export interface BoothVisit {
  invitationId: Id; checkedInAt: string;
  feedback: { usefulness: 'yes' | 'somewhat' | 'no'; submittedAt: string } | null;
  feedbackDue?: boolean;
}
export interface Invitation {
  id: Id; personId: Id; company: string; title: string; topic: string;
  time: string; location: string; reason: string; path: ConnectionPathNode[];
  status: 'pending' | 'accepted' | 'declined';
  visit?: BoothVisit | null;
}
export interface AttendeeState {
  version: 2; onboardingComplete: boolean; profile: Profile; encounters: Encounter[];
  feedback: Feedback | null; requestedIds: Id[]; dismissedIds: Id[];
  boothInvitationStatus?: 'accepted' | 'declined'; // local demo only; live state comes from invitation
  surveyAnswers?: SurveyAnswer[]; graphRevision?: number; // demo persistence only
  meetingFeedbackDue?: boolean; // demo review lifecycle only
  meetingRequests?: MeetingRequest[]; // local persistence; live UI reads Dashboard.meetingRequests
  boothVisit?: BoothVisit; // local persistence; live UI reads Invitation.visit
  agendaProgress?: Record<Id, {stop: Omit<AgendaStop, 'person' | 'status'>; status: AgendaStop['status']; updatedAt?: string}>;
  restoredMeetingPreferences?: Id[]; // demo-only preference answer IDs explicitly turned back on
}
export interface Dashboard {
  event: { id: Id; name: string; location: string; venue: string; sourceUrl?: string };
  graphRevision?: number; state: AttendeeState; viewer: { badgeToken: string }; people: Person[];
  recommendations: Recommendation[]; meeting: Meeting | null; invitation: Invitation | null; meetingRequests: MeetingRequest[];
  agenda?: AgendaStop[];
  session?: {id: Id; title: string; day: string; time: string; meetingIds: Id[]; resolved: number; total: number; ready: boolean};
}
// Frontend display shape. Meeting stops use the backend meeting id s{session}-d{date}-{a}-{b};
// live stops come from GET /sessions/{s}, fixture stops are built the same way.
export interface AgendaStop {
  id: Id; kind: 'meeting' | 'booth'; personId: Id; person: Person;
  sessionId?: Id; session?: number; date?: number; round?: number; dateState?: 'planned' | 'open' | 'closed';
  time: string; location: string; topic: string; topicId?: Id; reason?: string;
  status: 'scheduled' | 'checked_in' | 'feedback_due' | 'completed' | 'missed';
}
export interface ScanResult { person: Person; duplicate: boolean }

// Participant identity is supplied by the authenticated server in live mode.
export interface SurveyPerson { id: Id; name: string; role?: string; company?: string; color?: string; initials?: string }
/** Mapped from the backend Question: kind met | claim | act | meet_again. Claim choices are true / false / skip (Didn't come up). */
export interface SurveyQuestion {
  id: Id; version: number; prompt: string; required: boolean;
  choices: { id: Id; label: string }[];
  kind?: 'met' | 'claim' | 'act' | 'meet_again'; topicId?: TopicId | null; claim?: 'partner_taught' | 'self_taught' | null;
  why?: { score: number; ig: number; plausibility: number } | null;
}
export interface SurveyAnswer {
  id?: Id; meetingId?: Id; respondentId?: Id; subjectId?: Id;
  questionId: Id; questionVersion: number; prompt: string;
  answerKey: Id; answerLabel: string; submittedAt?: string;
}
export interface MeetingSurvey {
  meetingId: Id; context?: 'date' | 'checkin'; phrasedBy?: 'claude' | 'template'; respondent: SurveyPerson; subject: SurveyPerson;
  time?: string; location?: string; graphRevision: number; surveyRevision: number;
  complete: boolean; currentQuestion: SurveyQuestion | null;
  queuedQuestions: SurveyQuestion[]; answers: SurveyAnswer[];
}
export interface SurveySubmission { questionId: Id; questionVersion: number; answerKey: Id; surveyRevision: number }
// Local demo extensions. These do not change the current REST submission contract.
export interface MeetingPreference { kind: 'avoid_topic'; topicId: Id; topicLabel: string; answerId?: Id }
export interface DemoSurveyAnswer extends SurveyAnswer { answerText?: string; preference?: MeetingPreference }
export interface DemoSurveyQuestion extends SurveyQuestion {
  choices: {id: Id; label: string; requiresText?: boolean; requiresConfirmation?: boolean}[];
}
export interface DemoMeetingSurvey extends MeetingSurvey {
  questions: SurveyQuestion[]; canRevise: true; meetingTopic: Topic;
  preferences: MeetingPreference[]; answers: DemoSurveyAnswer[];
}
export interface DemoSurveySubmission extends SurveySubmission { answerText?: string }
// Exhibitor audience, mapped from GET /topics/{id}/experts and /topics/{id}/influencers (backend-adapter mapAudience).
export type AudienceTarget = 'experts' | 'influencers' | 'both';
export interface PromotionAudienceMember {
  id: Id; person: Person; topicId: TopicId; kinds: ('expert' | 'micro_influencer')[];
  expertise: number; reports: number; like?: number;
  /** Expected additional attendees this micro-influencer brings (not a count of connections). */
  marginalReach?: number; evidenceLabels: string[]; reason: string; source: 'sample_graph' | 'backend_graph';
}
export interface PromotionInvitation {
  person: Person; evidence: PromotionAudienceMember;
  status: 'invited' | 'accepted' | 'declined' | 'checked_in' | 'feedback_due' | 'completed';
  invitedAt: string; checkedInAt?: string; updatedAt?: string;
}
export interface Topic { id: Id; label: string }
export interface RankedPerson {
  rank: number; person: SurveyPerson; reason: string;
  evidence?: {label: string; kind?: string}[];
  profileSource?: {kind: 'bright_data' | 'attendee' | 'fixture'; sourceUrl?: string; sourceId?: string};
}
export interface TopicRanking {
  topic: Topic; limit: 3 | 5 | 10 | 20; graphRevision: number;
  generatedAt?: string; status: 'ready' | 'updating'; items: RankedPerson[];
}
