export interface MushafSegment {
  text: string;
  verse_key: string; // e.g. "1:1"
}

export interface MushafLine {
  line_number: number;
  type: 'header' | 'bismillah' | 'verse';
  text?: string; // For header/bismillah
  segments?: MushafSegment[]; // For verse lines
}

export interface MushafPage {
  page_number: number;
  lines: MushafLine[];
}

export interface SurahMetadata {
  id: number;
  name: string;
  start_page: number;
  end_page: number;
  verses_count: number;
}

export interface JuzMetadata {
  id: number;
  start_page: number;
}

export interface HizbMetadata {
  id: number;
  start_page: number;
}

export interface MushafMetadata {
  surahs: SurahMetadata[];
  juzs: JuzMetadata[];
  hizbs: HizbMetadata[];
}

export interface PageProgress {
  page_number: number;
  added_date: string; // ISO Date
  last_reviewed: string; // ISO Date
  level: 'new' | 'review' | 'forgotten';
}

export interface UserProgress {
  current_page: number;
  pages: PageProgress[];
  last_activity: string; // ISO Date
}
