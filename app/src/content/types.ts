// Mirrors docs/design.md §9. Types only — no logic here.

export type QuestionType =
  | 'en_to_pt'
  | 'pt_to_en'
  | 'fill_blank'
  | 'choose_form'
  | 'correct_sentence'
  | 'context_choice'
  | 'build_sentence'
  | 'open_completion'
  | 'explain_difference'
  | 'speak_aloud';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Register = 'spoken' | 'written' | 'neutral';
export type AuthoringStatus = 'candidate' | 'approved' | 'rejected' | 'needs_editing';

export interface AcceptedAnswer {
  text: string;
  accent_sensitive: boolean;
}

export interface QuestionSource {
  note: string;
  heading: string;
}

export interface Question {
  id: string;
  version: number;
  content_hash: string;
  type: QuestionType;
  topic: string;
  subtopic: string;
  direction: 'en_to_pt' | 'pt_to_en' | null;
  difficulty: Difficulty;
  register: Register;
  prompt: string;
  accepted_answers?: AcceptedAnswer[];
  distractors?: string[];
  model_answers?: string[];
  useful_structures?: string[];
  explanation: string;
  source: QuestionSource;
  status: AuthoringStatus;
  generation_version: number;
  created_at: string;
  updated_at: string;
}

export interface Note {
  path: string;
  title: string;
  topic: string;
  headings: string[];
  body_markdown: string;
}

export interface Scenario {
  id: string;
  version: number;
  title: string;
  target_grammar: string[];
  difficulty: Difficulty;
  opening_prompt: string;
  follow_up_prompts: string[];
  model_responses: string[];
  useful_structures: string[];
  accepted_answer_patterns?: string[];
  source: string[];
}

export interface ContentBundle {
  schema_version: number;
  bundle_version: string;
  questions: Question[];
  scenarios: Scenario[];
  notes: Note[];
}
