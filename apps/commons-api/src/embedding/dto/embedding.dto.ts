export interface EmbeddingDto {
  resourceId: string;
  content: string; // URL for image and audio, text for text
  embeddingType: EmbeddingType;
  schema?: {};
  resourceType: ResourceType;
  tags: string[];
  resourceFile: string;
}

export enum EmbeddingType {
  text = 'text',
  image = 'image',
  audio = 'audio',
  // video = 'video',
}

export enum ResourceType {
  text = 'text',
  image = 'image',
  audio = 'audio',
  video = 'video',
  tool = 'tool',
  csv = 'csv',
}

// export enum ToolType {

// }
