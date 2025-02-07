import { FactoryProvider, Injectable } from '@nestjs/common';
import { OpenAI } from 'openai';

export interface OpenAIService extends OpenAI {}

@Injectable()
export class OpenAIService {}

export const OpenAIServiceProvider: FactoryProvider<OpenAI> = {
  provide: OpenAIService,
  useFactory: () => {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  },
};
