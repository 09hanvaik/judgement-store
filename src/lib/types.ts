/** Shared domain types. Kept free of DB/React imports so the engine stays pure. */

export const MODES = [
  'decide',
  'budget',
  'narrow',
  'personal',
  'constrain',
  'adapt',
  'verdict',
  'route',
  'lookup',
  'none',
] as const;

export type Mode = (typeof MODES)[number];

export type Verdict = 'buy' | 'maybe' | 'no' | 'pick' | 'skip' | null;

export type UnitStatus = 'approved' | 'candidate' | 'rejected';

export type EventType =
  | 'answer_viewed'
  | 'save'
  | 'unsave'
  | 'share'
  | 'share_view'
  | 'return_visit'
  | 'helpful'
  | 'not_helpful'
  | 'ask_directly_click'
  | 'no_match'
  | 'signal_trust'
  | 'signal_delayed_intent';

export interface StyleGuide {
  tone: string;
  dos: string[];
  donts: string[];
  approved_fillers: string[];
  max_fillers_per_answer: number;
  sentence_length_hint: number;
  banned_phrases: string[];
  /** Ordered notebook questions used for ask_back. Ask ONE. */
  ask_back_questions: string[];
  /** Her single filter question, used when the request is too vague to route. */
  filter_question?: string;
}

/** The situation a judgement unit applies to. Matched by typed predicates only. */
export interface Situation {
  skin_type?: string[];
  concern?: string[];
  budget_max_gbp?: number;
  budget_min_gbp?: number;
  time_minutes_max?: number;
  occasion?: string[];
  size?: string[];
  region?: string[];
  tags?: string[];
  requires?: ConstraintField[];
  keyword_hits?: string[];
}

export type ConstraintField =
  | 'skin_type'
  | 'concern'
  | 'budget_gbp'
  | 'time_minutes'
  | 'occasion'
  | 'owned_item_ids'
  | 'size'
  | 'tags'
  | 'mode'
  | 'keyword_hits';

export type ConditionOp = 'eq' | 'in' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'exists';

export interface Condition {
  field: ConstraintField;
  op: ConditionOp;
  value?: unknown;
  /** Inverts the test, so a rule can say "unless this matched". */
  negate?: boolean;
}

export interface AskBackOption {
  label: string;
  /** Constraints the option sets when tapped. Chips always win over free text. */
  constraints?: Partial<Constraints>;
}

export interface RuleEffect {
  include_item_ids?: string[];
  exclude_item_ids?: string[];
  exclude_attrs?: Record<string, unknown>;
  boost?: Record<string, number>;
  ask_back?: string | null;
  ask_back_options?: AskBackOption[];
  template_id?: string;
  cap?: number | null;
}

export interface Constraints {
  budget_gbp?: number;
  time_minutes?: number;
  skin_type?: string;
  concern?: string[];
  owned_item_ids?: string[];
  occasion?: string;
  size?: string;
  region?: string;
  tags?: string[];
  keyword_hits?: string[];
  /** true when the visitor explicitly asked for exactly one thing. */
  wants_one?: boolean;
}

export interface AnswerQuery {
  mode: Mode;
  raw_text: string;
  chips: string[];
  constraints: Constraints;
}

export interface SkipNote {
  item_id: string | null;
  item_name: string;
  text: string;
  rule_id: string | null;
}

export interface VisitorContext {
  owned_item_ids?: string[];
  last_creator?: string;
  [k: string]: unknown;
}

export interface CohortRow {
  label: string;
  dms?: number | null;
  saves: number;
  shares: number;
  returns: number;
  link_click?: boolean | null;
  converted: boolean;
  lag_days: number | null;
  order_gbp?: number | null;
}

export interface ProposedUnit {
  mode: Mode;
  item_name: string | null;
  item_id: string | null;
  verdict: Verdict;
  score: number | null;
  rule_text: string;
  note: string;
  caveat: string;
  voice_sample: string;
  todo?: string | null;
}
