import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';
import { BrainService } from './brain.service';
import type {
  KnowledgeDocumentImport,
  KnowledgePermission,
  KnowledgePrincipal,
  KnowledgeProviderId,
} from './brain.types';

@Controller({ version: '1', path: 'brains' })
export class BrainController {
  constructor(private readonly brains: BrainService) {}

  @Get('providers')
  providers() {
    return { data: this.brains.providerCatalog() };
  }

  @Get('search')
  async search(
    @Req() request: Request,
    @Query('query') query: string,
    @Query('spaceIds') spaceIds?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.brains.search(principalFrom(request), {
        query,
        spaceIds: spaceIds?.split(',').filter(Boolean),
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Get()
  async list(@Req() request: Request) {
    return { data: await this.brains.listSpaces(principalFrom(request)) };
  }

  @Post()
  async create(
    @Req() request: Request,
    @Body()
    body: {
      name: string;
      description?: string;
      provider?: KnowledgeProviderId;
      providerConfig?: Record<string, unknown>;
      color?: string;
      allAgents?: boolean;
      agentIds?: string[];
    },
  ) {
    return {
      data: await this.brains.createSpace(principalFrom(request), body),
    };
  }

  @Get(':spaceId')
  async get(@Req() request: Request, @Param('spaceId') spaceId: string) {
    return {
      data: await this.brains.getSpace(spaceId, principalFrom(request)),
    };
  }

  @Patch(':spaceId')
  async update(
    @Req() request: Request,
    @Param('spaceId') spaceId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      color?: string;
      autoGrantNewAgents?: boolean;
      status?: 'active' | 'disconnected';
      providerConfig?: Record<string, unknown>;
    },
  ) {
    return {
      data: await this.brains.updateSpace(
        spaceId,
        principalFrom(request),
        body,
      ),
    };
  }

  @Delete(':spaceId')
  async remove(@Req() request: Request, @Param('spaceId') spaceId: string) {
    return this.brains.removeSpace(spaceId, principalFrom(request));
  }

  @Post(':spaceId/grants')
  async grant(
    @Req() request: Request,
    @Param('spaceId') spaceId: string,
    @Body()
    body: {
      subjectType: 'user' | 'agent' | 'workspace';
      subjectId: string;
      permission?: KnowledgePermission;
      autoRetrieve?: boolean;
    },
  ) {
    return {
      data: await this.brains.setGrant(spaceId, principalFrom(request), body),
    };
  }

  @Delete(':spaceId/grants/:grantId')
  async revokeGrant(
    @Req() request: Request,
    @Param('spaceId') spaceId: string,
    @Param('grantId') grantId: string,
  ) {
    return this.brains.revokeGrant(spaceId, grantId, principalFrom(request));
  }

  @Get(':spaceId/documents')
  async documents(
    @Req() request: Request,
    @Param('spaceId') spaceId: string,
    @Query('query') query?: string,
    @Query('includeContent') includeContent?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.brains.listDocuments(spaceId, principalFrom(request), {
        query,
        includeContent: includeContent === 'true',
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Post(':spaceId/documents')
  async createDocument(
    @Req() request: Request,
    @Param('spaceId') spaceId: string,
    @Body()
    body: {
      path: string;
      title?: string;
      content: string;
      providerDocumentId?: string;
      providerRevision?: string;
    },
  ) {
    return {
      data: await this.brains.writeDocument(
        spaceId,
        principalFrom(request),
        body,
      ),
    };
  }

  @Get(':spaceId/documents/:documentId')
  async document(
    @Req() request: Request,
    @Param('documentId') documentId: string,
  ) {
    return {
      data: await this.brains.getDocument(documentId, principalFrom(request)),
    };
  }

  @Patch(':spaceId/documents/:documentId')
  async updateDocument(
    @Req() request: Request,
    @Param('spaceId') spaceId: string,
    @Param('documentId') documentId: string,
    @Body()
    body: {
      path: string;
      title?: string;
      content: string;
      expectedRevision?: number;
      providerDocumentId?: string;
      providerRevision?: string;
    },
  ) {
    return {
      data: await this.brains.writeDocument(spaceId, principalFrom(request), {
        ...body,
        documentId,
      }),
    };
  }

  @Delete(':spaceId/documents/:documentId')
  async removeDocument(
    @Req() request: Request,
    @Param('documentId') documentId: string,
  ) {
    return this.brains.removeDocument(documentId, principalFrom(request));
  }

  @Post(':spaceId/import')
  async importDocuments(
    @Req() request: Request,
    @Param('spaceId') spaceId: string,
    @Body() body: { documents: KnowledgeDocumentImport[] },
  ) {
    return {
      data: await this.brains.importDocuments(
        spaceId,
        principalFrom(request),
        body.documents,
      ),
    };
  }

  @Get(':spaceId/graph')
  async graph(@Req() request: Request, @Param('spaceId') spaceId: string) {
    return {
      data: await this.brains.graph(spaceId, principalFrom(request)),
    };
  }
}

export function principalFrom(request: Request): KnowledgePrincipal {
  const principal = (request as any).principal as ApiKeyPrincipal | undefined;
  const principalId = resolveCallerId(request);
  if (!principalId) throw new Error('Authenticated principal required');
  const delegatedService =
    principal?.principalType === 'service' &&
    Boolean(request.headers['x-owner-id'] || request.headers['x-initiator']);
  return {
    principalId,
    principalType: delegatedService
      ? 'user'
      : (principal?.principalType ?? 'user'),
    workspaceId: principal?.workspaceId,
  };
}
