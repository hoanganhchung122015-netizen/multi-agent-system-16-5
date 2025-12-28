
export enum Subject {
  MATH = 'Toán học',
  PHYSICS = 'Vật lí',
  CHEMISTRY = 'Hóa học',
  DIARY = 'Nhật ký'
}

export enum AgentType {
  SPEED = 'Professor 1',
  SOCRATIC = 'Professor 2',
  PERPLEXITY = 'Professor 3',
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
}

export interface AnalysisResult {
  content: string;
  mindMap: string;
  quiz?: QuizQuestion[];
}

export type InputMode = 'CAMERA' | 'GALLERY' | 'VOICE';
