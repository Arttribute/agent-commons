export interface Embedding {
  resource_id: string;
  resource_type: string;
  json_schema: string;
  embedding: Array<number>;
  tags: Array<string>;
  created_at: string;
}
