interface CreateSpaceDto {
  name: string;
  description?: string;
  sessionId?: string;
  isPublic?: boolean;
  maxMembers?: number;
  settings?: any;
}

interface SendMessageDto {
  content: string;
  targetType?: 'broadcast' | 'direct' | 'group';
  targetIds?: string[];
  messageType?: string;
  metadata?: any;
  sessionId?: string; // Optional session ID for context
}

interface AddMemberDto {
  memberId: string;
  memberType: 'agent' | 'human';
  role?: string;
  permissions?: any;
}

export { CreateSpaceDto, SendMessageDto, AddMemberDto };
