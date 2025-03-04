export interface Embedding {
  resource_id: string;
  resource_type: string;
  schema: string;
  embedding: Array<number>;
  tags: Array<string>;
  created_at: string;
}
