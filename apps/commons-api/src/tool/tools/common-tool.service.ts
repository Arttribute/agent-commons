import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { EmbeddingType, ResourceType } from '~/embedding/dto/embedding.dto';
import { AgentService } from '~/agent/agent.service';
import { GoalService, CreateGoalDto } from '~/goal/goal.service';
import { TaskService, CreateTaskDto, TaskContext } from '~/task/task.service';
import { AttributionService } from '~/attribution/attribution.service';
import { ResourceService } from '~/resource/resource.service';
import { SpaceService } from '~/space/space.service';
import { SpaceBusService } from '~/space/space-bus.service';
//import { TaskService } from '~/task/task.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import { PinataService } from '~/pinata/pinata.service';
import { ToolSchema } from '~/tool/dto/tool.dto';

const graphqlRequest = import('graphql-request');

export interface CommonTool {
  createGoal(props: CreateGoalDto): Promise<any>;
  updateGoalProgress(props: {
    goalId: string;
    progress: number;
    status: 'pending' | 'started' | 'completed' | 'failed';
  }): Promise<any>;
  recomputeGoalProgress(props: {
    goalId: string;
  }): Promise<{ success: boolean }>;

  createTask(props: CreateTaskDto): Promise<any>;
  updateTaskProgress(props: {
    taskId: string;
    progress: number;
    status: 'pending' | 'started' | 'completed' | 'failed';
    resultContent: string;
    summary: string;
    context: Record<string, any>;
    scheduledEnd?: Date;
    estimatedDuration?: number;
    metadata?: Record<string, any>;
  }): Promise<any>;

  /**
   * Get Agents available in the network
   */
  //getAgents(): any;
  //getAgentWithId(props: { id: string }): any;

  /**
   * Get Resources available in the network
   */
  getResources(): any;
  getResourcesWithFilter(props: { where: { creator?: string } }): any;
  getResourceWithId(props: { id: string }): any;

  /**
   * Find Resources available in the network, you may filter by query and resource type
   * The query is a string that will be used to search for resources
   */
  findResources(props: { query: string; resourceType: ResourceType }): any;

  /**
   * Create a new Resource in the network if the resource is not a tool, set schema to undefined
   */
  createResource(props: {
    name: string;
    description: string;
    thumbnail: string;
    resourceFile: string;
    resourceType: string;
    embeddingType: string;
    schema?: ToolSchema;
    tags: string[];
    requiredReputation: number;
    usageCost: number;
    contributors: `0x${string}`[];
    shares: number[];
  }): any;

  // Previously for onchain tasks
  // getTasks(): any;
  // getTasksWithFilter(props: { where: { status?: 'open' | 'closed' } }): any;
  // createTask(props: {
  //   description: string;
  //   reward: number;
  //   resourceBased: boolean;
  //   parentTaskId?: number;
  //   maxParticipants: number;
  // }): any;
  // joinTask(props: { taskId: number }): any;
  // completeTask(props: { taskId: number; resultantFile: string }): any;

  /**
   * Get Attributions available in the network, you may get by id
   */
  getAttributions(): any;
  getAttributionWithId(props: { id: string }): any;

  /**
   * Create a new Attribution in the network
   * The parentResources are the resources that were used to create the new resource
   * relation types 0,1,2,3  DERIVED_FROM, INSPIRED_BY,USES, COLLABORATED_WITH
   */
  createAttribution(props: {
    resourceId: number;
    parentResources: number[];
    relationTypes: number[];
    descriptions: string[];
  }): any;

  /**
   * Interact with an agent in the network
   */
  interactWithAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
    sessionId?: string;
    initiator: string;
  }): any;

  /**
   * Generate an image using DALL·E 3
   */
  generateImage(props: {
    prompt: string;
    n?: number; // how many images to generate (default 1)
    size?: '1024x1024' | '1024x1792' | '1792x1024'; // optional
    quality?: 'standard' | 'hd'; // optional
    agentId: string; // merged from second parameter
    privateKey: string; // merged from second parameter
  }): Promise<
    {
      ipfsUrl: string;
      revised_prompt: string | null;
    }[]
  >;

  /**
   * Upload a file directly to IPFS via Pinata.
   */
  uploadFileToIPFS(props: {
    /** Base64-encoded file data */
    base64String: string;
    /** The name of the file, e.g. "document.pdf" or "image.png" */
    fileName: string;
    /** The MIME type, e.g. "application/pdf" or "image/png" */
    mimeType: string;

    /** For Typia LLM's single-parameter approach */
    agentId: string;
    privateKey: string;
  }): Promise<{
    ipfsUrl: string;
  }>;

  /**
   * Create a new shared space for multi-agent communication
   */
  createSpace(props: {
    name: string;
    description?: string;
    sessionId?: string;
    isPublic?: boolean;
    maxMembers?: number;
    agentId: string;
  }): any;

  /**
   * Join an existing space
   */
  joinSpace(props: { spaceId: string; agentId: string }): any;

  /**
   * Add an agent to a space
   */
  addAgentToSpace(props: {
    spaceId: string;
    targetAgentId: string;
    agentId: string;
  }): any;

  /**
   * Send a message to a space
   */
  sendMessageToSpace(props: {
    spaceId: string;
    content: string;
    targetType?: 'broadcast' | 'direct' | 'group';
    targetIds?: string[];
    agentId: string;
  }): any;

  /**
   * Get messages from a space
   */
  getSpaceMessages(props: {
    spaceId: string;
    limit?: number;
    agentId: string;
  }): any;

  /**
   * Get spaces where the agent is a member
   */
  getMySpaces(props: { agentId: string }): any;

  /**
   * Send a message to the in-memory space bus (real-time)
   * The agent will automatically determine message type and completion
   */
  sendBusMessage(props: {
    spaceId: string;
    content: string;
    messageType?: 'text' | 'command' | 'response' | 'final';
    targetType?: 'broadcast' | 'direct' | 'group';
    targetIds?: string[];
    agentId: string;
    context?: any;
  }): any;

  /**
   * Subscribe to space bus messages (automatically subscribes when agent joins space)
   */
  subscribeToSpaceBus(props: { spaceId: string; agentId: string }): any;

  /**
   * Get recent messages from the in-memory bus
   */
  getBusMessages(props: { spaceId: string; limit?: number }): any;

  /**
   * Equip a tool resource to an agent
   */
  // equipResourceTool(props: {
  //   resourceId: string;
  //   agentId: string;
  //   privateKey: string;
  // }): any;
}

@Injectable()
export class CommonToolService implements CommonTool {
  //   graphAPI = `https://gateway.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/F2shbPHeLwRJ4thF22M3Tjz16L7GxCVvJ1SxD4H4ziD`;
  graphAPI = `https://api.studio.thegraph.com/query/102152/agentcommons-testnet/version/latest`;
  constructor(
    @Inject(forwardRef(() => AgentService)) private agent: AgentService,
    @Inject(forwardRef(() => GoalService))
    private goals: GoalService,
    @Inject(forwardRef(() => TaskService))
    private tasks: TaskService,
    @Inject(forwardRef(() => ResourceService))
    private resource: ResourceService,
    //@Inject(forwardRef(() => TaskService)) previous for onchain tasks
    //private task: TaskService,
    @Inject(forwardRef(() => AttributionService))
    private attribution: AttributionService,
    @Inject(forwardRef(() => OpenAIService))
    private openAI: OpenAIService,
    @Inject(forwardRef(() => PinataService))
    private pinataService: PinataService,
    @Inject(forwardRef(() => SpaceService))
    private space: SpaceService,
    private spaceBus: SpaceBusService,
  ) {}

  async createGoal(props: CreateGoalDto) {
    return await this.goals.create(props);
  }

  async updateGoalProgress(props: {
    goalId: string;
    progress: number;
    status: 'pending' | 'started' | 'completed' | 'failed';
  }) {
    return await this.goals.updateProgress(
      props.goalId,
      props.progress,
      props.status,
    );
  }

  async recomputeGoalProgress(props: { goalId: string }) {
    await this.goals.recomputeProgress(props.goalId);
    return { success: true };
  }

  async createTask(props: CreateTaskDto) {
    return await this.tasks.create(props);
  }

  async updateTaskProgress(props: {
    taskId: string;
    progress: number;
    status: 'pending' | 'started' | 'completed' | 'failed';
    resultContent: string;
    summary: string;
    context: TaskContext;
    scheduledEnd?: Date;
    estimatedDuration?: number;
    metadata?: Record<string, any>;
  }) {
    return await this.tasks.updateProgress(
      props.taskId,
      props.progress,
      props.status,
      props.resultContent,
      props.summary,
      props.context,
      props.scheduledEnd,
      props.estimatedDuration,
      props.metadata,
    );
  }

  getAgents(props?: { id?: string }) {
    const graphAPIKey = process.env.GRAPH_API_KEY;
    const data = graphqlRequest.then(async (_) => {
      const agentsDocument = _.gql`
    	{
    		agents {
    			id
    			owner
    			metadata
    			reputation
    			isCommonAgent
    			registrationTime
    		}
    	}
    	`;

      const agentsWithIdDocument = _.gql`
    	{
    		agent(id: ${props?.id}) {
    			id
    			owner
    			metadata
    			reputation
    			isCommonAgent
    			registrationTime
    		}
    	}
    	`;

      return await _.request(
        this.graphAPI,
        props?.id ? agentsWithIdDocument : agentsDocument,
      );
    });

    return data;
  }

  getAgentWithId(props: { id: string }) {
    return this.getAgents({ id: props.id });
  }

  getResources(props?: { where?: { creator?: string }; id?: string }) {
    const graphAPIKey = process.env.GRAPH_API_KEY;
    const data = graphqlRequest.then(async (_) => {
      const commonResourcesDocument = _.gql`
    	{
        commonResources {
          id
          resourceId
          creator
          metadata
          resourceFile
          requiredReputation
          usageCost
          isCoreResource
          totalShares
          usageCount
          contributors {
          address
          contributionShare
          }
        }
    	}
    	`;

      const commonResourcesWithFilterDocument = _.gql`
    	{
        commonResources(where: ${props?.where}) {
          id
          resourceId
          creator
          metadata
          resourceFile
          requiredReputation
          usageCost
          isCoreResource
          totalShares
          usageCount
          contributors {
          address
          contributionShare
          }
        }
    	}
    	`;

      const commonResourcesWithIdDocument = _.gql`
    	{
        commonResources(id: ${props?.id}) {
          id
          resourceId
          creator
          metadata
          resourceFile
          requiredReputation
          usageCost
          isCoreResource
          totalShares
          usageCount
          contributors {
          address
          contributionShare
          }
        }
    	}
    	`;

      return await _.request(
        this.graphAPI,
        props?.id
          ? commonResourcesWithIdDocument
          : props?.where
            ? commonResourcesWithFilterDocument
            : commonResourcesDocument,
      );
    });

    return data;
  }
  getResourceWithId(props: { id: string }) {
    return this.getResources({
      id: props.id,
    });
  }
  getResourcesWithFilter(props: { where: { creator?: string } }) {
    return this.getResources({
      where: props.where,
    });
  }

  findResources(props: { query: string; resourceType: ResourceType }) {
    return this.resource.findResources(props);
  }

  // @ts-expect-error
  async createResource(
    props: {
      name: string;
      description: string;
      thumbnail: string;
      resourceFile: string;
      resourceType: string;
      embeddingType: string;
      schema: ToolSchema;
      tags: string[];
      requiredReputation: bigint;
      usageCost: bigint;
      contributors: `0x${string}`[];
      shares: bigint[];
    },
    metadata: { agentId: string; privateKey: string },
  ) {
    const resourceMetadataJSON = {
      name: props.name,
      description: props.description,
      image: props.thumbnail,
      attributes: [],
    };
    //upload metadata to IPFS
    const metadataFile = await this.pinataService.uploadJsonFile(
      resourceMetadataJSON,
      'metadata.json',
    );
    //get ipfs file url
    const cid = metadataFile.IpfsHash;
    const resourceMetadata = `https://${process.env.GATEWAY_URL ?? 'gateway.pinata.cloud'}/ipfs/${cid}`;
    //dynamic type based on embeddingType
    const etype =
      props.embeddingType === 'image'
        ? EmbeddingType.image
        : props.embeddingType === 'audio'
          ? EmbeddingType.audio
          : EmbeddingType.text;
    const rType =
      props.resourceType === 'image'
        ? ResourceType.image
        : props.resourceType === 'text'
          ? ResourceType.text
          : props.resourceType === 'audio'
            ? ResourceType.audio
            : props.resourceType === 'video'
              ? ResourceType.video
              : props.resourceType === 'csv'
                ? ResourceType.csv
                : ResourceType.tool;

    const resource = await this.resource.createResource({
      ...props,
      agentId: metadata.agentId,
      resourceMetadata,
      schema: props.schema,
      resourceType: rType,
      embeddingType: etype,
      tags: props.tags,
      isCoreResource: false,
    });

    return resource;
  }
  //Previously for onchain tasks
  // getTasks(props?: { where?: { status?: string } }) {
  //   const graphAPIKey = process.env.GRAPH_API_KEY;
  //   const data = graphqlRequest.then(async (_) => {
  //     const tasksDocument = _.gql`
  //   	{
  //   		tasks {
  //   			id
  // 			taskId
  // 			creator
  // 			metadata
  // 			reward
  // 			resourceBased
  // 			status
  // 			rewardsDistributed
  // 			parentTaskId
  // 			maxParticipants
  // 			currentParticipants
  // 			contributions {
  // 			contributor
  // 			value
  // 			}
  // 			subtasks
  //   		}
  //   	}
  //   	`;
  //     const tasksWithFilterDocument = _.gql`
  //   	{
  //   		tasks(where: ${props?.where}) {
  //   			id
  // 			taskId
  // 			creator
  // 			metadata
  // 			reward
  // 			resourceBased
  // 			status
  // 			rewardsDistributed
  // 			parentTaskId
  // 			maxParticipants
  // 			currentParticipants
  // 			contributions {
  // 			contributor
  // 			value
  // 			}
  // 			subtasks
  //   		}
  //   	}
  //   	`;

  //     return await _.request(
  //       this.graphAPI,
  //       props?.where ? tasksWithFilterDocument : tasksDocument,
  //     );
  //   });
  //   return data;
  // }
  // getTasksWithFilter(props: { where: { status?: string } }) {
  //   return this.getTasks({
  //     where: props.where,
  //   });
  // }

  // // @ts-expect-error
  // async createTask(
  //   props: {
  //     name: string;
  //     description: string;
  //     thumbnail: string;
  //     reward: number;
  //     resourceBased: boolean;
  //     parentTaskId?: number;
  //     maxParticipants: number;
  //   },
  //   metadata: { agentId: string; privateKey: string },
  // ) {
  //   const taskMetadataJSON = {
  //     name: props.name,
  //     description: props.description,
  //     image: props.thumbnail,
  //     attributes: [],
  //   };
  //   //upload metadata to IPFS
  //   const metadataFile = await this.pinataService.uploadJsonFile(
  //     taskMetadataJSON,
  //     'metadata.json',
  //   );
  //   //get ipfs file url
  //   const cid = metadataFile.IpfsHash;
  //   const taskMetadata = `https://${process.env.GATEWAY_URL ?? 'gateway.pinata.cloud'}/ipfs/${cid}`;

  //   const task = await this.task.createTask({
  //     ...props,
  //     metadata: taskMetadata,
  //     reward: BigInt(props.reward),
  //     parentTaskId: BigInt(props.parentTaskId || 0),
  //     maxParticipants: BigInt(props.maxParticipants),
  //     agentId: metadata.agentId,
  //   });

  //   return task;
  // }

  // // @ts-expect-error
  // async joinTask(
  //   props: {
  //     taskId: number;
  //   },
  //   metadata: { agentId: string; privateKey: string },
  // ) {
  //   const task = await this.task.joinTask({
  //     ...props,
  //     taskId: BigInt(props.taskId),
  //     agentId: metadata.agentId,
  //   });

  //   return task;
  // }

  // // @ts-expect-error
  // async completeTask(
  //   props: {
  //     taskId: number;
  //     resultantFile: string;
  //   },
  //   metadata: { agentId: string; privateKey: string },
  // ) {
  //   const task = await this.task.completeTask({
  //     ...props,
  //     taskId: BigInt(props.taskId),
  //     agentId: metadata.agentId,
  //   });

  //   return task;
  // }

  getAttributions(props?: { id?: string }) {
    const graphAPIKey = process.env.GRAPH_API_KEY;
    const data = graphqlRequest.then(async (_) => {
      const attributionsDocument = _.gql`
    	{
    		attributions {
				id
				resourceId
				parentResources
				relationTypes
				contributionDescriptions
				timestamp
				derivatives
				citations {
				citingResourceId
				citedResourceId
				description
				timestamp
				}
			}
    	}
    	`;
      const attributionsWithIdDocument = _.gql`
    	{
    		attributions(id: ${props?.id}) {
    			id
				taskId
				creator
				metadata
				reward
				resourceBased
				status
				rewardsDistributed
				parentTaskId
				maxParticipants
				currentParticipants
				contributions {
				contributor
				value
				}
				subtasks
    		}
    	}
    	`;

      return await _.request(
        this.graphAPI,
        props?.id ? attributionsWithIdDocument : attributionsDocument,
      );
    });

    return data;
  }
  getAttributionWithId(props: { id: string }) {
    return this.getAttributions({
      id: props.id,
    });
  }

  // @ts-expect-error
  async createAttribution(
    props: {
      resourceId: bigint;
      parentResources: bigint[];
      relationTypes: bigint[];
      descriptions: string[];
    },
    metadata: { agentId: string; privateKey: string },
  ) {
    const attribution = await this.attribution.createAttribution({
      ...props,
      agentId: metadata.agentId,
    });

    return attribution;
  }

  interactWithAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
    initiator: string;
    sessionId?: string;
  }) {
    return this.agent.runAgent(props);
  }
  /**
   * Generate an image using DALL·E 3
   * @param props
   * @param metadata
   * @returns
   */
  /**
   * Generate an image using DALL·E 3, then store on IPFS (Pinata).
   */
  async generateImage(props: {
    prompt: string;
    n?: number;
    size?: '1024x1024' | '1024x1792' | '1792x1024';
    quality?: 'standard' | 'hd';
    agentId: string;
    privateKey: string;
  }): Promise<
    {
      ipfsUrl: string;
      revised_prompt: string | null;
    }[]
  > {
    const {
      prompt,
      n = 1,
      size = '1024x1024',
      quality = 'standard', // might not always do anything in current OpenAI version
    } = props;

    // 1) Call OpenAI's DALL·E 3 with base64 output
    const response = await this.openAI.images.generate({
      model: 'dall-e-3',
      prompt,
      n,
      size,
      response_format: 'b64_json',
      // if you want "hd" => quality: 'hd' (some beta features for DALL·E 3)
    });

    // 2) For each returned image, store it on IPFS
    const results: {
      ipfsUrl: string;
      revised_prompt: string | null;
    }[] = [];

    for (let i = 0; i < response.data.length; i++) {
      const imageData = response.data[i];
      const base64String = imageData.b64_json;
      const revisedPrompt = imageData.revised_prompt ?? null;

      // Upload to Pinata
      // We'll default to "image/png" unless you have reason to suspect a different type
      const pinataResult = await this.pinataService.uploadFileFromBase64(
        base64String!,
        `dalle_image_${i}.png`,
        'image/png',
      );

      // pinataResult will have e.g. { IpfsHash: '...' }
      const cid = pinataResult.IpfsHash;

      results.push({
        ipfsUrl: `https://${process.env.GATEWAY_URL ?? 'gateway.pinata.cloud'}/ipfs/${cid}`,
        revised_prompt: revisedPrompt,
      });
    }

    // 3) Return IPFS info
    return results;
  }

  /**
   * Upload a file directly to IPFS using Pinata.
   * - `props.base64String` is your file’s data encoded in base64.
   * - `props.fileName` is the desired name for the file on IPFS (e.g. "photo.png").
   * - `props.mimeType` is the MIME type (e.g. "image/png").
   * - `props.agentId` and `props.privateKey` are included to match the single param approach (Typia).
   */
  async uploadFileToIPFS(props: {
    base64String: string;
    fileName: string;
    mimeType: string;
    agentId: string;
    privateKey: string;
  }): Promise<{ ipfsUrl: string }> {
    const { base64String, fileName, mimeType } = props;

    // 1) Upload to Pinata
    const pinataResult = await this.pinataService.uploadFileFromBase64(
      base64String,
      fileName,
      mimeType,
    );

    // 2) Construct a gateway URL; you may have PINATA_GATEWAY or custom domain
    const cid = pinataResult.IpfsHash;
    const gatewayUrl = `https://${process.env.GATEWAY_URL ?? 'gateway.pinata.cloud'}/ipfs/${cid}`;

    // 3) Return IPFS info
    return {
      ipfsUrl: gatewayUrl,
    };
  }

  async equipResourceTool(props: {
    resourceId: string;
    agentId: string;
    privateKey: string;
  }) {
    const { resourceId, agentId, privateKey } = props;

    // 1) Confirm resource is type=tool
    const resource = await this.resource.getResourceById(resourceId);
    if (!resource) {
      throw new BadRequestException(`Resource "${resourceId}" not found`);
    }
    if (resource.resourceType !== 'tool') {
      throw new BadRequestException(`Resource "${resourceId}" is not a tool`);
    }

    // 2) Add to agent.common_tools
    const agent = await this.agent.getAgent({ agentId });
    if (!agent) {
      throw new BadRequestException(`Agent "${agentId}" not found`);
    }

    const updatedCommonTools = new Set(agent.commonTools ?? []);
    updatedCommonTools.add(resourceId);

    await this.agent.updateAgent(agentId, {
      commonTools: Array.from(updatedCommonTools),
    });

    return {
      success: true,
      message: `Tool resource "${resourceId}" equipped successfully.`,
    };
  }

  /* ─────────────────────────  SPACE METHODS  ───────────────────────── */

  /**
   * Create a new shared space for multi-agent communication
   */
  async createSpace(props: {
    name: string;
    description?: string;
    sessionId?: string;
    isPublic?: boolean;
    maxMembers?: number;
    agentId: string;
  }) {
    const { agentId, ...spaceProps } = props;

    return await this.space.createSpace({
      ...spaceProps,
      createdBy: agentId,
      createdByType: 'agent',
    });
  }

  /**
   * Join an existing space
   */
  async joinSpace(props: { spaceId: string; agentId: string }) {
    const { spaceId, agentId } = props;

    return await this.space.addMember({
      spaceId,
      memberId: agentId,
      memberType: 'agent',
    });
  }

  /**
   * Add an agent to a space
   */
  async addAgentToSpace(props: {
    spaceId: string;
    targetAgentId: string;
    agentId: string;
  }) {
    const { spaceId, targetAgentId, agentId } = props;

    // Check if the requesting agent is a member and has permission to invite
    const isMember = await this.space.isMember(spaceId, agentId, 'agent');
    if (!isMember) {
      throw new BadRequestException(
        'You must be a member of the space to add other agents',
      );
    }

    return await this.space.addMember({
      spaceId,
      memberId: targetAgentId,
      memberType: 'agent',
    });
  }

  /**
   * Send a message to a space
   */
  async sendMessageToSpace(props: {
    spaceId: string;
    content: string;
    targetType?: 'broadcast' | 'direct' | 'group';
    targetIds?: string[];
    agentId: string;
  }) {
    const { agentId, ...messageProps } = props;

    return await this.space.sendMessage({
      ...messageProps,
      senderId: agentId,
      senderType: 'agent',
    });
  }

  /**
   * Get messages from a space
   */
  async getSpaceMessages(props: {
    spaceId: string;
    limit?: number;
    agentId: string;
  }) {
    const { spaceId, agentId, limit = 50 } = props;

    // Check if the agent is a member
    const isMember = await this.space.isMember(spaceId, agentId, 'agent');
    if (!isMember) {
      throw new BadRequestException(
        'You must be a member of the space to read messages',
      );
    }

    return await this.space.getMessagesForMember(spaceId, agentId, limit);
  }

  /**
   * Get spaces where the agent is a member
   */
  async getMySpaces(props: { agentId: string }) {
    const { agentId } = props;

    return await this.space.getSpacesForMember(agentId, 'agent');
  }

  /**
   * Send a message to the in-memory space bus (real-time)
   * The agent will automatically determine message type and completion
   */
  async sendBusMessage(props: {
    spaceId: string;
    content: string;
    messageType?: 'text' | 'command' | 'response' | 'final';
    targetType?: 'broadcast' | 'direct' | 'group';
    targetIds?: string[];
    agentId: string;
    context?: any;
  }) {
    const { agentId, context, ...messageProps } = props;

    // Verify agent is member of space
    const isMember = await this.space.isMember(props.spaceId, agentId, 'agent');
    if (!isMember) {
      throw new BadRequestException(
        'You must be a member of the space to send messages',
      );
    }

    // Auto-determine message type if not provided
    let messageType = messageProps.messageType;
    if (!messageType) {
      messageType = this.determineMessageType(props.content, context);
    }

    // Auto-determine target type if not provided
    const targetType = messageProps.targetType || 'broadcast';

    // Send to in-memory bus (immediate delivery)
    const busMessage = await this.spaceBus.sendMessage({
      spaceId: props.spaceId,
      content: props.content,
      messageType,
      targetType,
      targetIds: props.targetIds,
      senderId: agentId,
      senderType: 'agent',
      metadata: {
        context,
      },
    });

    // Also persist to database
    await this.space.sendMessage({
      spaceId: props.spaceId,
      senderId: agentId,
      senderType: 'agent',
      content: props.content,
      targetType,
      targetIds: props.targetIds,
      messageType,
      metadata: {
        context,
        busMessageId: busMessage.messageId,
      },
    });

    return {
      success: true,
      messageId: busMessage.messageId,
      timestamp: busMessage.timestamp,
      messageType,
      persisted: true,
    };
  }

  /**
   * Determine message type based on content analysis
   */
  private determineMessageType(
    content: string,
    context?: any,
  ): 'text' | 'command' | 'response' | 'final' {
    const lowerContent = content.toLowerCase();

    // Check for completion indicators
    if (
      lowerContent.includes('task completed') ||
      lowerContent.includes('finished') ||
      lowerContent.includes('done') ||
      lowerContent.includes('complete') ||
      lowerContent.includes('final result') ||
      lowerContent.includes('summary') ||
      lowerContent.includes('conclusion')
    ) {
      return 'final';
    }

    // Check for command indicators
    if (
      lowerContent.includes('please') ||
      lowerContent.includes('can you') ||
      lowerContent.includes('could you') ||
      lowerContent.includes('need you to') ||
      lowerContent.includes('help me') ||
      lowerContent.startsWith('run') ||
      lowerContent.startsWith('execute') ||
      lowerContent.startsWith('perform')
    ) {
      return 'command';
    }

    // Check for response indicators
    if (
      lowerContent.includes('here is') ||
      lowerContent.includes('here are') ||
      lowerContent.includes('i found') ||
      lowerContent.includes('result:') ||
      lowerContent.includes('answer:') ||
      lowerContent.includes('completed') ||
      context?.isResponse
    ) {
      return 'response';
    }

    // Default to text
    return 'text';
  }

  /**
   * Subscribe to space bus messages (automatically subscribes when agent joins space)
   */
  async subscribeToSpaceBus(props: { spaceId: string; agentId: string }) {
    const { spaceId, agentId } = props;

    // Verify agent is member of space
    const isMember = await this.space.isMember(spaceId, agentId, 'agent');
    if (!isMember) {
      throw new BadRequestException(
        'You must be a member of the space to subscribe to messages',
      );
    }

    // Subscribe to bus with autonomous message processing
    const subscriptionId = this.spaceBus.subscribeToSpace(
      spaceId,
      (message) => {
        // Filter messages for this agent if needed
        if (
          message.targetType === 'direct' &&
          message.targetIds &&
          !message.targetIds.includes(agentId)
        ) {
          return;
        }

        // Process message autonomously
        this.processIncomingMessage(message, agentId);
      },
    );

    return {
      success: true,
      subscriptionId,
      spaceId,
      message:
        'Agent subscribed to space bus and will receive real-time messages',
    };
  }

  /**
   * Process incoming messages autonomously
   */
  private async processIncomingMessage(message: any, agentId: string) {
    try {
      // Log for agent context
      console.log(`Agent ${agentId} received message:`, {
        messageId: message.messageId,
        senderId: message.senderId,
        content: message.content,
        messageType: message.messageType,
        timestamp: new Date(message.timestamp),
      });

      // Determine if agent should respond
      const shouldRespond = this.shouldAgentRespond(message, agentId);

      if (shouldRespond.respond) {
        // Auto-generate response based on message context
        const response = await this.generateAutonomousResponse(
          message,
          agentId,
        );

        if (response) {
          // Send response back to space
          await this.sendBusMessage({
            spaceId: message.spaceId,
            content: response.content,
            messageType: response.messageType,
            targetType: response.targetType,
            targetIds: response.targetIds,
            agentId: agentId,
            context: {
              respondingTo: message.messageId,
              autonomous: true,
            },
          });
        }
      }

      // // Check if agent should take action
      // const action = this.determineAgentAction(message, agentId);
      // if (action) {
      //   await this.executeAgentAction(action, agentId);
      // }
    } catch (error) {
      console.error(`Error processing message for agent ${agentId}:`, error);
    }
  }

  /**
   * Determine if agent should respond to a message
   */
  private shouldAgentRespond(
    message: any,
    agentId: string,
  ): { respond: boolean; reason?: string } {
    // Don't respond to own messages
    if (message.senderId === agentId) {
      return { respond: false, reason: 'Own message' };
    }

    // Always respond to direct messages
    if (
      message.targetType === 'direct' &&
      message.targetIds &&
      message.targetIds.includes(agentId)
    ) {
      return { respond: true, reason: 'Direct message' };
    }

    // Respond to commands that might be relevant
    if (message.messageType === 'command') {
      const content = message.content.toLowerCase();
      if (
        content.includes('help') ||
        content.includes('assist') ||
        content.includes('collaborate')
      ) {
        return { respond: true, reason: 'Relevant command' };
      }
    }

    // Respond to questions
    if (message.content.includes('?')) {
      return { respond: true, reason: 'Question detected' };
    }

    return { respond: false, reason: 'No response trigger' };
  }

  /**
   * Generate autonomous response
   */
  private async generateAutonomousResponse(
    message: any,
    agentId: string,
  ): Promise<{
    content: string;
    messageType: 'text' | 'command' | 'response' | 'final';
    targetType: 'broadcast' | 'direct' | 'group';
    targetIds?: string[];
  } | null> {
    // Simple autonomous response logic
    // In a real implementation, this would use the agent's AI capabilities

    const content = message.content.toLowerCase();

    if (content.includes('status') || content.includes('progress')) {
      return {
        content: `I'm currently active and ready to collaborate on this space.`,
        messageType: 'response',
        targetType: 'broadcast',
      };
    }

    if (content.includes('complete') || content.includes('done')) {
      return {
        content: `Acknowledged. I'll process this completion and wrap up my tasks.`,
        messageType: 'final',
        targetType: 'broadcast',
      };
    }

    // Default response for direct messages
    if (message.targetType === 'direct') {
      return {
        content: `I received your message and will process it accordingly.`,
        messageType: 'response',
        targetType: 'direct',
        targetIds: [message.senderId],
      };
    }

    return null;
  }

  /**
   * Determine if agent should take action
   */
  // private determineAgentAction(message: any, agentId: string): string | null {
  //   const content = message.content.toLowerCase();

  //   if (content.includes('analyze') || content.includes('process')) {
  //     return 'analyze_data';
  //   }

  //   if (content.includes('search') || content.includes('find')) {
  //     return 'search_information';
  //   }

  //   if (content.includes('create') || content.includes('generate')) {
  //     return 'create_content';
  //   }

  //   return null;
  // }

  /**
   * Execute agent action
   */
  // private async executeAgentAction(action: string, agentId: string) {
  //   // This would trigger the agent's specific capabilities
  //   console.log(`Agent ${agentId} executing action: ${action}`);

  //   // In a real implementation, this would call the agent's tools
  //   // For now, just log the action
  // }

  /**
   * Get recent messages from the in-memory bus
   */
  async getBusMessages(props: { spaceId: string; limit?: number }) {
    const { spaceId, limit = 20 } = props;

    const messages = this.spaceBus.getRecentMessages(spaceId, limit);

    return {
      messages: messages.map((msg) => ({
        messageId: msg.messageId,
        senderId: msg.senderId,
        senderType: msg.senderType,
        content: msg.content,
        messageType: msg.messageType,
        targetType: msg.targetType,
        targetIds: msg.targetIds,
        timestamp: new Date(msg.timestamp).toISOString(),
      })),
      count: messages.length,
    };
  }

  /**
   * Get bus statistics
   */
  async getBusStatistics() {
    const stats = this.spaceBus.getStatistics();
    return {
      success: true,
      statistics: stats,
    };
  }
}
