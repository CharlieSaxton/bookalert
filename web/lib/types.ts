export type Search = {
  id: string;
  user_id: string;
  label: string;
  search_url: string;
  alert_email: string;
  min_rating: number | null;
  max_pages: number;
  active: boolean;
  created_at: string;
};

export type RunStatus = 'running' | 'ok' | 'error';

export type Run = {
  id: string;
  search_id: string;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  scraped_count: number | null;
  new_count: number | null;
  error: string | null;
};

export type Finding = {
  id: string;
  search_id: string;
  run_id: string | null;
  property_id: string;
  name: string;
  url: string;
  price: string | null;
  rating: number | null;
  first_seen: string;
  notified: boolean;
};
