/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EmbeddingDto, EmbeddingType } from './dto/embedding.dto';
import { Embedding } from './entities/embedding.entity';
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import { WaveFile } from 'wavefile';

@Injectable()
export class EmbeddingService {
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new UnauthorizedException('Supabase credentials are not set');
    }
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY,
    );
  }

  private async loadTextPipeline() {
    // text model for text
    const { pipeline } = await import('@xenova/transformers');
    return pipeline('feature-extraction', 'Supabase/gte-small'); // 384-dimensional embeddings
  }

  // Note: Idea is to have a single pipeline for all types of embeddings and handle the type in the service. Can only search if the type is known. Cannot search across multiple dimensions

  private async loadImagePipeline() {
    // clip model for images
    const { pipeline } = await import('@xenova/transformers');
    return pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch16'); // 512-dimensional embeddings
  }

  private async loadAudioPipeline() {
    const { AutoProcessor, ClapAudioModelWithProjection } = await import(
      '@xenova/transformers'
    );
    const processor = await AutoProcessor.from_pretrained(
      'Xenova/larger_clap_general',
    );
    const model = await ClapAudioModelWithProjection.from_pretrained(
      'Xenova/larger_clap_general',
    );
    return { processor, model };
  }

  private async embed(content: string, type: EmbeddingType): Promise<number[]> {
    // input in the form of URL's
    let generateEmbedding: any;
    let output: any;
    switch (type) {
      case EmbeddingType.text:
        generateEmbedding = await this.loadTextPipeline();
        output = await generateEmbedding(content, {
          pooling: 'mean',
          normalize: true,
        });
        break;
      case EmbeddingType.image:
        generateEmbedding = await this.loadImagePipeline();
        output = await generateEmbedding(content, {
          pooling: 'mean',
          normalize: true,
        });
        break;
      case EmbeddingType.audio: {
        const { processor, model } = await this.loadAudioPipeline();
        const buffer = Buffer.from(
          await fetch(content).then((x) => x.arrayBuffer()),
        );
        const wav = new WaveFile(buffer);
        wav.toBitDepth('32f');
        wav.toSampleRate(48000);

        let audioData = wav.getSamples();

        if (Array.isArray(audioData)) {
          if (audioData.length > 1) {
            const SCALING_FACTOR = Math.sqrt(2);

            // Merge channels (into first channel to save memory)
            for (let i = 0; i < audioData[0].length; ++i) {
              audioData[0][i] =
                (SCALING_FACTOR * (audioData[0][i] + audioData[1][i])) / 2;
            }
          }

          // Select first channel
          audioData = audioData[0];
          const audioInputs = await processor(audioData);
          const { audio_embeds } = await model(audioInputs);
          output = audio_embeds;
        }
        break;
        break;
      }
      default:
        throw new BadRequestException('Unsupported resource type');
    }

    return Array.from(output.data);
  }

  async create(dto: EmbeddingDto) {
    const { content, type } = dto;

    if (!content || !type)
      throw new BadRequestException('Content and type are required');

    const embedding = await this.embed(content, type);

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
        resource_type: type,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return data;
  }

  async find(dto: EmbeddingDto) {
    const { content, type } = dto;

    if (!content || !type)
      throw new BadRequestException('Content and type are required');

    const embedding = await this.embed(content, type);

    // Search for similar vectors in Postgres
    const { data, error } = await this.supabase.rpc('match_resources', {
      query_embedding: embedding,
      match_threshold: 0.78,
      match_count: 3,
      r_type: type, // resource type
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}
