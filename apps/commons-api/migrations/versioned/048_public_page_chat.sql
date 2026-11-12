CREATE TABLE IF NOT EXISTS public_page_chat_usage (
  bucket text NOT NULL,
  usage_day date NOT NULL DEFAULT CURRENT_DATE,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  PRIMARY KEY(bucket, usage_day)
);
ALTER TABLE public_page_chat_usage ENABLE ROW LEVEL SECURITY;
