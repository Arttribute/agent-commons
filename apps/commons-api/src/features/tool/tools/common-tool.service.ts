import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { AgentService } from '~/features/agent/agent.service';
import { AttributionService } from '~/features/attribution/attribution.service';
import { ResourceService } from '~/features/resource/resource.service';
import { TaskService } from '~/features/task/task.service';

const graphqlRequest = import('graphql-request');

export interface CommonTool {
  /**
   * Get Agents available in the network
   */
  getAgents(): any;
  getAgentWithId(props: { id: string }): any;

  /**
   * Get Resources available in the network, you may filter by creator or get by id
   */
  getResources(): any;
  getResourcesWithFilter(props: { where: { creator?: string } }): any;
  getResourceWithId(props: { id: string }): any;

  /**
   * Create a new Resource in the network
   */
  createResource(props: {
    requiredReputation: number;
    usageCost: number;
    contributors: `0x${string}`[];
    shares: number[];
  }): any;

  /**
   * Get Tasks available in the network, you may filter by status,
   */
  getTasks(): any;
  getTasksWithFilter(props: { where: { status?: string } }): any;

  createTask(props: {}): any;
  joinTask(props: {}): any;
  completeTask(props: {}): any;

  /**
   * Get Attributions available in the network, you may get by id
   */
  getAttributions(): any;
  getAttributionWithId(props: { id: string }): any;

  createAttribution(props: {}): any;

  /**
   * Interact with an agent in the network
   */
  interactWithAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
  }): any;
}

@Injectable()
export class CommonToolService implements CommonTool {
  //   graphAPI = `https://gateway.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/F2shbPHeLwRJ4thF22M3Tjz16L7GxCVvJ1SxD4H4ziD`;
  graphAPI = `https://api.studio.thegraph.com/query/102152/agentcommons-testnet/version/latest`;
  constructor(
    @Inject(forwardRef(() => AgentService)) private agent: AgentService,
    @Inject(forwardRef(() => ResourceService))
    private resource: ResourceService,
    @Inject(forwardRef(() => TaskService))
    private task: TaskService,
    @Inject(forwardRef(() => AttributionService))
    private attribution: AttributionService,
  ) {}

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

  // @ts-expect-error
  async createResource(
    props: {
      requiredReputation: bigint;
      usageCost: bigint;
      contributors: `0x${string}`[];
      shares: bigint[];
    },
    metadata: { agentId: string; privateKey: string },
  ) {
    const resource = await this.resource.createResource({
      ...props,
      agentId: metadata.agentId,
      isCoreResource: false,
    });

    return resource;
  }

  getTasks(props?: { where?: { status?: string } }) {
    const graphAPIKey = process.env.GRAPH_API_KEY;
    const data = graphqlRequest.then(async (_) => {
      const tasksDocument = _.gql`
    	{
    		tasks {
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
      const tasksWithFilterDocument = _.gql`
    	{
    		tasks(where: ${props?.where}) {
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
        props?.where ? tasksWithFilterDocument : tasksDocument,
      );
    });
    return data;
  }
  getTasksWithFilter(props: { where: { status?: string } }) {
    return this.getTasks({
      where: props.where,
    });
  }

  // @ts-expect-error
  async createTask(
    props: {
      metadata: string;
      reward: BigInt;
      resourceBased: boolean;
      parentTaskId: BigInt;
      maxParticipants: BigInt;
    },
    metadata: { agentId: string; privateKey: string },
  ) {
    const task = await this.task.createTask({
      ...props,
      agentId: metadata.agentId,
    });

    return task;
  }

  // @ts-expect-error
  async joinTask(
    props: {
      taskId: BigInt;
    },
    metadata: { agentId: string; privateKey: string },
  ) {
    const task = await this.task.joinTask({
      ...props,
      agentId: metadata.agentId,
    });

    return task;
  }

  // @ts-expect-error
  async completeTask(
    props: {
      taskId: BigInt;
      resultantFile: string;
    },
    metadata: { agentId: string; privateKey: string },
  ) {
    const task = await this.task.completeTask({
      ...props,
      agentId: metadata.agentId,
    });

    return task;
  }

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
      resourceId: string;
      parentResources: string[];
      relationTypes: string[];
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
  }) {
    return this.agent.runAgent(props);
  }
}
