export interface Database {
  public: {
    Tables: {
      daily_summaries: {
        Row: {
          id: string;
          content: string;
          citations: Citation[];
          timestamp: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          content: string;
          citations: Citation[];
          timestamp: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          content?: string;
          citations?: Citation[];
          timestamp?: string;
          created_at?: string;
        };
      };
    };
  };
}

export interface Citation {
  number: number;
  title: string;
  url: string;
  isCited: boolean;
  favicon?: string;
}