/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
    const { AutoTokenizer, CLIPTextModelWithProjection } = await import(
      '@xenova/transformers'
    );
    const tokenizer = await AutoTokenizer.from_pretrained(
      'Xenova/clip-vit-base-patch16',
    );
    const model = await CLIPTextModelWithProjection.from_pretrained(
      'Xenova/clip-vit-base-patch16',
    );
    return { tokenizer, model };
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
      case EmbeddingType.text: {
        const { tokenizer, model } = await this.loadTextPipeline();

        const inputs = tokenizer([content], {
          padding: true,
          truncation: true,
        });
        output = await model(inputs, { pooling: 'mean', normalize: true })
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          .then((x: any) => x.text_embeds)
          .catch((e: any) => {
            throw new Error(e);
          });
        break;
      }
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
      }
      default:
        throw new BadRequestException('Unsupported resource type');
    }

    return Array.from(output.data);
  }

  async create(dto: EmbeddingDto) {
    const { content, type, tags } = dto;

    if (!content || !type)
      throw new BadRequestException('Content type are required');

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
        resource_id: dto.resourceId,
        embedding,
        resource_type: type,
        tags: tags,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    console.log('Length' + data?.embedding.length);

    return data;
  }

  async find(
    dto: Pick<EmbeddingDto, 'content' | 'type'>,
    options?: Partial<{ matchThreshold: number; matchCount: number }>,
  ) {
    const { content, type } = dto;

    const { matchThreshold = 0, matchCount = 7 } = options || {};

    if (!content || !type)
      throw new BadRequestException('Content and type are required');

    const embedding = await this.embed(content, EmbeddingType.text);

    // Search for similar vectors in Postgres
    const { data, error } = await this.supabase.rpc('match_resources', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      r_type: type, // resource type
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}
