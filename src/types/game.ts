export type Position = 'GK' | 'LB' | 'CB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LW' | 'RW' | 'ST';

export type FormationId = '4-3-3' | '4-2-3-1' | '3-4-2-1' | '3-5-2' | '4-4-2' | '5-3-2';

export type Mentality = 'Cautious' | 'Balanced' | 'Positive' | 'Attacking' | 'Very Attacking';

export type PlayerRole =
  | 'Sweeper Keeper'
  | 'Ball-Playing Defender'
  | 'Stopper'
  | 'Inverted Wing-Back'
  | 'Complete Wing-Back'
  | 'Deep-Lying Playmaker'
  | 'Box-to-Box'
  | 'Mezzala'
  | 'Advanced Playmaker'
  | 'Inside Forward'
  | 'Inverted Winger'
  | 'Advanced Forward'
  | 'Complete Forward'
  | 'Target Forward';

export interface PlayerAttributes {
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
}

export type CardTier = 'standard' | 'global' | 'icon';

export interface Player {
  id: string;
  name: string;
  shortName: string;
  clubId: string;
  position: Position;
  secondaryPos?: Position;
  number: number;
  age: number;
  nationality: string;
  flagCode: string;
  rating: number;
  potential: number;
  stars?: number; // 1-5 star upgrade tier
  cardTier?: CardTier;
  marketValueM: number; // € Millions
  wageK: number; // € Thousands/week
  contractUntil: number;
  fitness: number; // 0-100
  morale: number; // 0-100
  form: number; // 1-10
  goals: number;
  assists: number;
  appearances: number;
  transferStatus: 'available' | 'listed' | 'untouchable' | 'loan';
  role?: PlayerRole;
  attributes: PlayerAttributes;
  appearance: {
    skin: string;
    hair: string;
    hairStyle: 'short' | 'fade' | 'curly' | 'long' | 'buzz';
  };
}

export interface RealManager {
  id: string;
  name: string;
  nationality: string;
  flagCode: string;
  age: number;
  clubId: string;
  preferredFormation: FormationId;
  style: string;
  tacticalRating: number;
  manManagement: number;
  pressingStyle: 'High Gegenpress' | 'Positional Control' | 'Mid-Block Counter' | 'Low Compact';
  appearance: {
    skin: string;
    hair: string;
    hairStyle: 'bald' | 'short' | 'silver' | 'slick';
    suitColor: string;
  };
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  league: string;
  country: string;
  stadium: string;
  capacity: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  pattern: 'solid' | 'stripes' | 'sash' | 'halves';
  transferBudgetM: number;
  wageBudgetK: number;
  reputation: number; // 1-100
  managerId: string;
}

export interface TacticSlot {
  slotIndex: number;
  label: Position;
  x: number; // 0-100 (% from left)
  y: number; // 0-100 (% from top, 90 = GK, 15 = ST)
  playerId: string;
  role: PlayerRole;
}

export interface TacticSettings {
  formation: FormationId;
  mentality: Mentality;
  passingDirectness: number; // 1 (Short) - 5 (Direct)
  tempo: number; // 1 (Slow) - 5 (High)
  width: number; // 1 (Narrow) - 5 (Wide)
  pressingIntensity: number; // 1 (Low) - 5 (Gegenpress)
  defensiveLine: number; // 1 (Deep) - 5 (Very High)
  counterPress: boolean;
  playOutOfDefence: boolean;
  workBallIntoBox: boolean;
  offsideTrap: boolean;
  slots: TacticSlot[];
}

export interface LeagueStanding {
  clubId: string;
  clubName: string;
  shortName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  form: string[]; // ['W', 'D', 'L']
}

export interface Fixture {
  id: string;
  matchweek: number;
  homeClubId: string;
  awayClubId: string;
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
  report?: CompactMatchReport;
}

export type CompetitionId = 'league' | 'champions-cup' | 'national-cup' | 'super-cup' | 'friendly';

export interface MatchEvent {
  minute: number;
  type: 'goal' | 'yellow' | 'chance' | 'save' | 'sub' | 'kickoff' | 'fulltime' | 'penalty';
  teamId: string;
  playerId?: string;
  playerName: string;
  assistId?: string;
  assistName?: string;
  description: string;
}

export interface ManOfTheMatch {
  playerId?: string;
  name: string;
  clubId: string;
  rating: number;
}

export interface MatchPlayerRating {
  playerId: string;
  playerName: string;
  shortName: string;
  clubId: string;
  position: Position;
  rating: number; // 4.5 - 10.0
  goals: number;
  assists: number;
  yellowCard?: boolean;
  isMotm?: boolean;
}

export interface CompactMatchReport {
  possessionHome: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  cornersHome?: number;
  cornersAway?: number;
  foulsHome?: number;
  foulsAway?: number;
  yellowsHome?: number;
  yellowsAway?: number;
  xgHome: number;
  xgAway: number;
  homeFormation?: string;
  awayFormation?: string;
  homeManagerName?: string;
  awayManagerName?: string;
  venue?: string;
  manOfTheMatch?: ManOfTheMatch;
  playerRatings?: MatchPlayerRating[];
  events: MatchEvent[];
  playedAt?: string;
}

export interface MatchResultSummary {
  id: string;
  matchweek: number;
  competition?: CompetitionId;
  roundLabel?: string;
  homeClubId: string;
  awayClubId: string;
  homeGoals: number;
  awayGoals: number;
  penaltiesHome?: number;
  penaltiesAway?: number;
  winnerId?: string;
  possessionHome: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  cornersHome?: number;
  cornersAway?: number;
  foulsHome?: number;
  foulsAway?: number;
  yellowsHome?: number;
  yellowsAway?: number;
  xgHome: number;
  xgAway: number;
  homeFormation?: string;
  awayFormation?: string;
  homeManagerName?: string;
  awayManagerName?: string;
  venue?: string;
  manOfTheMatch?: ManOfTheMatch;
  playerRatings?: MatchPlayerRating[];
  events: MatchEvent[];
  playedAt: string;
}

export interface CupMatch {
  id: string;
  stage: 'group' | 'r16' | 'qf' | 'sf' | 'final';
  round: number;
  groupName?: string;
  homeClubId: string;
  awayClubId: string;
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
  penaltiesHome?: number;
  penaltiesAway?: number;
  winnerId?: string;
  report?: CompactMatchReport;
}

export interface ChampionsGroup {
  name: string;
  standings: LeagueStanding[];
}

export interface ChampionsCupState {
  stage: 'group' | 'qf' | 'sf' | 'final' | 'completed';
  currentRound: number;
  groups: ChampionsGroup[];
  matches: CupMatch[];
  championClubId?: string;
}

export interface NationalCupState {
  stage: 'r16' | 'qf' | 'sf' | 'final' | 'completed';
  matches: CupMatch[];
  championClubId?: string;
}

export interface SuperCupState {
  match: CupMatch;
  championClubId?: string;
}

export interface CompetitionPlayerStat {
  playerId: string;
  playerName: string;
  shortName: string;
  clubId: string;
  position: Position;
  goals: number;
  assists: number;
}

export interface CompetitionsState {
  championsCup: ChampionsCupState;
  nationalCup: NationalCupState;
  superCup: SuperCupState;
  leaderboards?: Partial<Record<CompetitionId, CompetitionPlayerStat[]>>;
}

export interface TrophyItem {
  id: string;
  title: string;
  competition: CompetitionId;
  season: string;
  clubId: string;
  awardedAt: string;
}

export interface SeasonRecord {
  season: string;
  clubId: string;
  leagueRank: number;
  points: number;
  championClubId: string;
  championsCupWinnerId?: string;
  nationalCupWinnerId?: string;
  topScorerName: string;
  topScorerGoals: number;
  trophiesWon: string[];
}

export interface TransferRecord {
  id: string;
  playerId: string;
  playerName: string;
  fromClubId: string;
  toClubId: string;
  feeM: number;
  wageK: number;
  type: 'buy' | 'sell' | 'loan';
  matchweek: number;
  date: string;
}

export type PackTier =
  | 'starter_pack'
  | 'scout_pack'
  | 'elite_pack'
  | 'legend_pack'
  | 'icon_pack'
  | 'trophy_gift_box';

export interface InventoryState {
  packs: Record<PackTier, number>;
  playerCards: Record<string, number>;
  universalShards: number;
  fitnessBoosters: number;
  totalPacksOpened?: number;
}

export interface OpenedCardReward {
  player: Player;
  isOwnedInSquad: boolean;
  isNewToBag: boolean;
}

export interface PackOpenResult {
  packTier: PackTier;
  cards: OpenedCardReward[];
  shardsGained: number;
  boostersGained: number;
  budgetGainedM: number;
}

export type RankTierId =
  | 'dong'
  | 'bac'
  | 'vang'
  | 'bach_kim'
  | 'kim_cuong'
  | 'tinh_anh'
  | 'cao_thu'
  | 'chien_tuong'
  | 'thach_dau';

export interface ArenaStarterSnapshot {
  id: string;
  name: string;
  shortName: string;
  position: Position;
  rating: number;
  stars: number;
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
}

export interface ArenaProfile {
  uid: string;
  visibility: 'public';
  isBot: boolean;
  managerName: string;
  nationality: string;
  clubId: string;
  clubName: string;
  formation: FormationId;
  squadOverall: number;
  attackRating: number;
  midfieldRating: number;
  defenseRating: number;
  rankTier: RankTierId;
  rankDivision: number;
  rankStars: number;
  bravePoints: number;
  eloPoints: number;
  winStreak: number;
  highestRankIndex: number;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  tournamentTitles: number;
  starters: ArenaStarterSnapshot[];
  updatedAt?: unknown;
}

export type OnlineMatchMode = 'duel' | 'ranked' | 'friendly' | 'tournament';

export interface ArenaChallenge {
  id: string;
  participants: string[];
  fromUid: string;
  fromManagerName: string;
  fromClubId: string;
  toUid: string;
  toManagerName: string;
  toClubId: string;
  mode: OnlineMatchMode;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';
  homeGoals?: number;
  awayGoals?: number;
  penaltiesHome?: number;
  penaltiesAway?: number;
  winnerUid?: string;
  note?: string;
  report?: CompactMatchReport;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Friendship {
  id: string;
  participants: string[];
  requesterUid: string;
  recipientUid: string;
  requesterName: string;
  requesterClubId: string;
  recipientName: string;
  recipientClubId: string;
  recipientIsBot: boolean;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OnlineTournamentParticipant {
  uid: string;
  managerName: string;
  clubId: string;
  clubName: string;
  squadOverall: number;
  isBot: boolean;
  rankTier: RankTierId;
  rankDivision: number;
}

export interface OnlineTournamentMatch {
  id: string;
  round: number; // 1 = R16/QF, etc.
  roundLabel: string;
  homeUid: string;
  awayUid: string;
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
  penaltiesHome?: number;
  penaltiesAway?: number;
  winnerUid?: string;
  report?: CompactMatchReport;
}

export interface OnlineTournamentState {
  id: string;
  title: string;
  size: 8 | 16;
  currentRound: number;
  status: 'active' | 'eliminated' | 'champion';
  participants: OnlineTournamentParticipant[];
  matches: OnlineTournamentMatch[];
  championUid?: string;
  startedAt: string;
}

export interface CareerSave {
  uid: string;
  clubId: string;
  season: string;
  matchweek: number;
  transferBudget: number;
  wageBudget: number;
  boardConfidence: number;
  fanSupport: number;
  trainingFocus: 'Tactical' | 'Attacking' | 'Defending' | 'Physical' | 'Recovery';
  trainingIntensity: 'light' | 'balanced' | 'intense';
  tactics: TacticSettings;
  squad: Player[];
  standings: LeagueStanding[];
  fixtures: Fixture[];
  recentResults: MatchResultSummary[];
  transferHistory?: TransferRecord[];
  competitions?: CompetitionsState;
  trophyCabinet?: TrophyItem[];
  seasonHistory?: SeasonRecord[];
  inventory?: InventoryState;
  onlineTournament?: OnlineTournamentState;
  updatedAt?: unknown;
}

export interface UserProfile {
  uid: string;
  managerName: string;
  nationality: string;
  clubId: string;
  clubName: string;
  preferredFormation: FormationId;
  role: 'manager' | 'admin';
  status: 'active' | 'suspended';
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  trophies: number;
  lastActiveAt?: unknown;
  lastReadNewsAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  category: 'transfer' | 'rumor' | 'matchday' | 'injury' | 'official';
  playerName?: string;
  clubTag?: string;
  feeText?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  isBreaking: boolean;
  authorUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PushNotificationItem {
  id: string;
  title: string;
  body: string;
  category: 'transfer' | 'matchday' | 'system' | 'urgent';
  authorUid: string;
  createdAt?: unknown;
}

export type ClubNotificationCategory =
  | 'match'
  | 'transfer'
  | 'tactics'
  | 'medical'
  | 'training'
  | 'season'
  | 'trophy'
  | 'contract'
  | 'inventory'
  | 'upgrade'
  | 'online';

export interface ClubNotificationItem {
  id: string;
  uid: string;
  category: ClubNotificationCategory;
  title: string;
  body: string;
  createdAt?: unknown;
}

export interface MarketOverride {
  playerId: string;
  clubId: string;
  marketValueM: number;
  rating: number;
  transferStatus: 'available' | 'listed' | 'untouchable' | 'loan';
  rumorNote?: string;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface ActivityLog {
  id: string;
  uid: string;
  eventType:
    | 'match_played'
    | 'transfer_completed'
    | 'tactic_saved'
    | 'career_started'
    | 'season_completed';
  clubId: string;
  detail?: string;
  valueM?: number;
  createdAt?: unknown;
}
