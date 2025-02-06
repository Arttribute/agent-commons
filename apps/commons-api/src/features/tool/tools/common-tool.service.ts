import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { AgentService } from '~/features/agent/agent.service';

const graphqlRequest = import('graphql-request');

export interface CommonTool {
  /**
   * Get Agents available in the network
   */
  getAgents(): any;
  getAgentWithId(props: { id: string }): any;

  /**
   * Get Common Resources available in the network, you may filter by creator or get by id
   */
  getCommonResources(): any;
  getCommonResourcesWithFilter(props: { where: { creator?: string } }): any;
  getCommonResourceWithId(props: { id: string }): any;

  /**
   * Get Tasks available in the network, you may filter by status,
   */
  getTasks(): any;
  getTasksWithFilter(props: { where: { status?: string } }): any;

  /**
   * Get Attributions available in the network, you may get by id
   */
  getAttributions(): any;
  getAttributionWithId(props: { id: string }): any;

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
  graphAPI = `https://gateway.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/F2shbPHeLwRJ4thF22M3Tjz16L7GxCVvJ1SxD4H4ziD`;
  constructor(
    @Inject(forwardRef(() => AgentService)) private agentService: AgentService,
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

  getCommonResources(props?: { where?: { creator?: string }; id?: string }) {
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
  getCommonResourceWithId(props: { id: string }) {
    return this.getCommonResources({
      id: props.id,
    });
  }
  getCommonResourcesWithFilter(props: { where: { creator?: string } }) {
    return this.getCommonResources({
      where: props.where,
    });
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

  interactWithAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
  }) {
    return this.agentService.runAgent(props);
  }
}
