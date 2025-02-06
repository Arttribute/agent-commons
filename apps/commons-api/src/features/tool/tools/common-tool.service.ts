import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { AgentService } from '~/features/agent/agent.service';

const graphqlRequest = import('graphql-request');

export interface CommonTool {
  /**
   * Get Agents available in the network
   */
  getAgents(): any;

  /**
   * Interact with an agent in the network
   */
  interactWithAgent(props: { agentId: string; messages?: [] }): any;
}

@Injectable()
export class CommonToolService implements CommonTool {
  constructor(
    @Inject(forwardRef(() => AgentService)) private agentService: AgentService,
  ) {}
  getAgents() {
    const graphAPIKey = process.env.GRAPH_API_KEY;
    const data = graphqlRequest.then(async (_) => {
      const agentDocument = _.gql`
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
      return await _.request(
        `https://gateway.thegraph.com/api/${graphAPIKey}/subgraphs/id/F2shbPHeLwRJ4thF22M3Tjz16L7GxCVvJ1SxD4H4ziD`,
        agentDocument,
      );
    });

    return data;
  }

  interactWithAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
  }) {
    return this.agentService.runAgent(props);
  }
}
