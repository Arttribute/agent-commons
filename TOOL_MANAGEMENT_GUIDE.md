# Tool Management System - Implementation Guide

## Overview
A comprehensive tool management system has been implemented with full support for CRUD operations, API key management, and wallet-based access control for both users and agents.

## Backend Implementation

### New API Endpoints

#### Tool Management (`/v1/tools`)
- **POST** `/v1/tools` - Create a new tool
- **GET** `/v1/tools?ownerId=&ownerType=&visibility=` - List tools with filters
- **GET** `/v1/tools/:name` - Get tool by name
- **PUT** `/v1/tools/:name` - Update tool
- **DELETE** `/v1/tools/:name` - Delete tool

#### Tool Keys (`/v1/tool-keys`)
- **POST** `/v1/tool-keys` - Create encrypted API key
- **GET** `/v1/tool-keys?ownerId=&ownerType=` - List keys for owner
- **GET** `/v1/tool-keys/:keyId` - Get key metadata
- **PUT** `/v1/tool-keys/:keyId/metadata` - Update key metadata
- **PUT** `/v1/tool-keys/:keyId/value` - Update key value
- **DELETE** `/v1/tool-keys/:keyId` - Delete key
- **POST** `/v1/tool-keys/:keyId/test` - Test key validity
- **POST** `/v1/tool-keys/map` - Map key to tool
- **DELETE** `/v1/tool-keys/map/:mappingId` - Remove key mapping

#### Tool Permissions (`/v1/tool-permissions`)
- **POST** `/v1/tool-permissions/grant` - Grant permission to user/agent
- **POST** `/v1/tool-permissions/batch-grant` - Grant permissions to multiple subjects
- **DELETE** `/v1/tool-permissions/:permissionId` - Revoke permission
- **GET** `/v1/tool-permissions/tool/:toolId` - List permissions for tool
- **GET** `/v1/tool-permissions/subject?subjectId=&subjectType=` - List permissions for user/agent
- **GET** `/v1/tool-permissions/accessible-tools?subjectId=&subjectType=` - Get accessible tools
- **GET** `/v1/tool-permissions/check?toolId=&subjectId=&subjectType=&permission=` - Check permission
- **POST** `/v1/tool-permissions/transfer-ownership` - Transfer tool ownership

### Backend Files Added/Modified

#### New Controllers
- `apps/commons-api/src/tool/tool-key.controller.ts` - API key management endpoints
- `apps/commons-api/src/tool/tool-permission.controller.ts` - Permission management endpoints

#### Modified Files
- `apps/commons-api/src/tool/tool.controller.ts` - Added DELETE and filtering
- `apps/commons-api/src/tool/tool.service.ts` - Added filtering and deletion support
- `apps/commons-api/src/tool/tool.module.ts` - Registered new controllers

#### Existing Services (Already Implemented)
- `apps/commons-api/src/tool/tool-key.service.ts` - Encrypted key storage with AES-256-GCM
- `apps/commons-api/src/tool/tool-access.service.ts` - Permission and access control

## Frontend Implementation

### Component Structure

```
apps/commons-app/
├── types/
│   └── tool.ts                                    # Tool, ToolKey, ToolPermission types
└── components/tools/management/
    ├── tool-list-item.tsx                         # Individual tool card with actions
    ├── edit-tool-dialog.tsx                       # Edit tool details dialog
    ├── manage-keys-dialog.tsx                     # Manage API keys dialog
    ├── manage-permissions-dialog.tsx              # Manage access permissions dialog
    └── tools-management-view.tsx                  # Main tools management view
```

**Note**: All component files use kebab-case naming convention.

### Features

#### Tool List View
- **Grid layout** with tool cards
- **Search** by name, description, or tags
- **Filter** by visibility (all/private/public/platform)
- **Quick actions** menu per tool (Edit, Manage Keys, Permissions, Delete)
- **Visual indicators** for visibility level with color-coded badges

#### Tool Editing
- Update display name, description
- Change visibility (private/public/platform)
- Update version and metadata
- Real-time validation

#### API Key Management
- **Create** encrypted API keys with:
  - Key name (e.g., OPENAI_API_KEY)
  - Display name (user-friendly)
  - Description
  - Key value (encrypted at rest)
- **View** all keys with masked values
- **Delete** keys
- **Track** usage statistics
- Support for user-level and agent-level keys
- Tool-specific or global keys

#### Permission Management (Wallet-Based)
- **Grant access** to users or agents by wallet address
- **Permission levels**:
  - `read` - Can view tool details
  - `execute` - Can use the tool
  - `admin` - Full control + grant permissions
- **Revoke access** with one click
- **Visual indicators** for permission types
- Support for both user and agent wallet addresses

### UI Design Principles

✅ **Minimal & Clean** - Simple, uncluttered interfaces
✅ **Consistent** - Matches existing app aesthetics
✅ **Efficient** - Quick access to common actions
✅ **Organized** - Logical component structure
✅ **Accessible** - Clear labels and intuitive flows

## Access Control Model

### Visibility Levels
1. **Platform** - Built-in tools available to all users (no restrictions)
2. **Public** - Anyone can access, but may need their own API keys
3. **Private** - Only owner and explicitly granted users/agents can access

### Wallet-Based Authorization
Both users and agents have wallet addresses, enabling:
- **Uniform access control** - Same mechanism for users and agents
- **Granular permissions** - Different permission levels per subject
- **Allow lists** - Explicit grants tracked by wallet address
- **Audit trail** - Track who granted permissions and when

### Key Resolution Priority
When executing a tool, keys are resolved in this order:
1. **Agent-specific key** - Key assigned to specific agent
2. **User-specific key** - Key assigned to user who owns agent
3. **Global key** - Platform-wide key (if available)

## API Configuration

The frontend connects to the backend using the environment variable:
```
NEXT_PUBLIC_NEST_API_BASE_URL=http://localhost:3001
```

All API calls use this base URL:
```typescript
const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;
const res = await fetch(`${baseUrl}/v1/tools`);
```

## Usage Examples

### Creating a Tool with API Key
```typescript
const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// 1. Create the tool
const tool = await fetch(`${baseUrl}/v1/tools`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'my_openai_tool',
    displayName: 'OpenAI Helper',
    schema: { /* OpenAI function schema */ },
    ownerId: userWalletAddress,
    ownerType: 'user',
    visibility: 'private'
  })
});

// 2. Add API key
await fetch(`${baseUrl}/v1/tool-keys`, {
  method: 'POST',
  body: JSON.stringify({
    keyName: 'OPENAI_API_KEY',
    displayName: 'My OpenAI Key',
    value: 'sk-...',
    ownerId: userWalletAddress,
    ownerType: 'user',
    toolId: tool.toolId
  })
});
```

### Granting Access to Another User
```typescript
const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

await fetch(`${baseUrl}/v1/tool-permissions/grant`, {
  method: 'POST',
  body: JSON.stringify({
    toolId: 'tool-uuid',
    subjectId: '0x...', // wallet address
    subjectType: 'user',
    permission: 'execute',
    grantedBy: myWalletAddress
  })
});
```

### Granting Access to Multiple Agents
```typescript
const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

await fetch(`${baseUrl}/v1/tool-permissions/batch-grant`, {
  method: 'POST',
  body: JSON.stringify({
    toolId: 'tool-uuid',
    subjects: [
      { subjectId: '0xagent1...', subjectType: 'agent' },
      { subjectId: '0xagent2...', subjectType: 'agent' }
    ],
    permission: 'execute',
    grantedBy: myWalletAddress
  })
});
```

## Security Features

### Encryption
- **AES-256-GCM** encryption for all API keys
- Keys encrypted at rest in database
- Separate IV and authentication tag per key
- Key rotation support

### Access Control
- Explicit permission checks before execution
- Owner always has full access
- Permission expiration support
- Audit trail for all grants/revocations

### Key Management
- Values masked in UI (show only last 4 characters)
- Usage tracking and analytics
- Test endpoint to validate keys
- Automatic expiration handling

## Navigation

Access the tool management interface at:
- **Route**: `/studio/tools`
- **Tab**: Click "Tools" in the Studio section
- **Create**: Click "Create Tool" button in header

## Next Steps

1. **Test the implementation** by creating a tool
2. **Add API keys** for external services
3. **Grant permissions** to other users/agents
4. **Monitor usage** through the key statistics

## Support for Tasks and Workflows

The same patterns can be extended to Tasks and Workflows management:
- Similar CRUD operations
- Same wallet-based access control
- Reusable permission system
- Consistent UI patterns

---

**Implementation Status**: ✅ Complete and ready for use
**Backend**: Fully functional with all endpoints
**Frontend**: Complete UI with all management features
**Documentation**: This guide
