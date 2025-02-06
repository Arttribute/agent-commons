import { Injectable } from '@nestjs/common';
import { CreateEmbeddingDto } from './dto/create-embedding.dto';
import { Embedding } from './entities/embedding.entity';
import { createClient, type PostgrestError } from '@supabase/supabase-js';

@Injectable()
export class EmbeddingService {
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error('Supabase credentials are not set');
    }
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY,
    );
  }
  async create({ text }: CreateEmbeddingDto) {
    try {
      // Extract the embedding output
      const embedding = await embed(text);

      // Store the vector in Postgres
      const {
        data,
        error,
      }: {
        data: Embedding | null;
        error: PostgrestError | null;
      } = await this.supabase
        .from('resource')
        .insert({
          embedding,
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error: any) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('An error occurred while generating the embedding');
    }
  }

  async find({ text }: CreateEmbeddingDto) {
    try {
      // Extract the embedding output
      const embedding = await embed(text);

      // Search for similar vectors in Postgres
      const { data, error } = await this.supabase.rpc('match_resources', {
        query_embedding: embedding, // Pass the embedding you want to compare
        match_threshold: 0.78, // Choose an appropriate threshold for your data
        match_count: 2, // Choose the number of matches
      });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error: any) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('An error occurred');
    }
  }
}

const loadTextPipeline = async () => {
  const { pipeline } = await import('@xenova/transformers');
  return pipeline('feature-extraction', 'Supabase/gte-small');
};

const embed = async (text: string) => {
  const generateEmbedding = await loadTextPipeline();
  const output = await generateEmbedding(text, {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(output.data) as number[];
};
