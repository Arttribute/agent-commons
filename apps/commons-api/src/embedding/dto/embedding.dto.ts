export interface EmbeddingDto {
  resourceId: string;
  content: string; // URL for image and audio, text for text
  type: EmbeddingType;
}

export enum EmbeddingType {
  text = 'text',
  image = 'image',
  audio = 'audio',
  // video = 'video',
}
