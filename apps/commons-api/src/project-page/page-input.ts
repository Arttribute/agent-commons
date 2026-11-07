import { BadRequestException } from '@nestjs/common';

export const PAGE_SURFACES = ['commons', 'commonlab', 'business'] as const;
export type PageSurface = (typeof PAGE_SURFACES)[number];
export type PageConfig = {
  title: string;
  description: string;
  publicContext: string;
  chatEnabled: boolean;
  imageUrl?: string;
};
export type PageInput = {
  title?: string;
  description?: string;
  publicContext?: string;
  chatEnabled?: boolean;
  imageUrl?: string;
};
export type CreatePageInput = PageInput & {
  slug?: string;
  surface?: PageSurface;
  template?: 'blank' | 'ai-kids-camp';
  agentId?: string;
  registrationUrl?: string;
};
export const isPageId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function pageSlug(value: unknown) {
  if (typeof value !== 'string')
    throw new BadRequestException('A page address is required');
  const slug = value.trim().toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/.test(slug) ||
    ['templates', 'assets', 'api', 'new'].includes(slug)
  ) {
    throw new BadRequestException(
      'Use 3–64 lowercase letters, numbers or hyphens for the page address',
    );
  }
  return slug;
}
export function pageSurface(value: unknown): PageSurface {
  if (value === undefined) return 'commons';
  if (!PAGE_SURFACES.includes(value as PageSurface))
    throw new BadRequestException('Choose Commons, CommonLab or Business');
  return value as PageSurface;
}
export function pageText(
  value: unknown,
  label: string,
  max: number,
  fallback = '',
) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max)
    throw new BadRequestException(
      `${label} must be text of at most ${max} characters`,
    );
  return value.trim();
}
export function publicHttpsUrl(value: unknown, label = 'URL') {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 2048)
    throw new BadRequestException(`Invalid ${label}`);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error();
    return url.toString();
  } catch {
    throw new BadRequestException(`${label} must be an HTTPS URL`);
  }
}
export function pageConfig(
  input: PageInput,
  previous?: PageConfig,
): PageConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Expected page settings');
  const title = pageText(input.title, 'Title', 120, previous?.title);
  if (!title) throw new BadRequestException('A page title is required');
  if (input.chatEnabled !== undefined && typeof input.chatEnabled !== 'boolean')
    throw new BadRequestException('Chat must be on or off');
  return {
    title,
    description: pageText(
      input.description,
      'Description',
      500,
      previous?.description,
    ),
    publicContext: pageText(
      input.publicContext,
      'Public chat context',
      12000,
      previous?.publicContext,
    ),
    chatEnabled: input.chatEnabled ?? previous?.chatEnabled ?? false,
    ...(input.imageUrl === undefined
      ? previous?.imageUrl
        ? { imageUrl: previous.imageUrl }
        : {}
      : { imageUrl: publicHttpsUrl(input.imageUrl, 'Image URL') }),
  };
}
