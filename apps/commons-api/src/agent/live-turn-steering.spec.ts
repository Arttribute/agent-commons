import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { missingComputedArtifacts } from './computed-artifact-completion';
import { LiveTurnSteering, requestsRunStop } from './live-turn-steering';

describe('live steering at safe model boundaries', () => {
  it('preserves original outputs when a correction adds another requested file', async () => {
    const steering = new LiveTurnSteering('Save regression.json in the Library.');
    const messages = await steering.beforeModel(() => ['Also save notes.md in the Library.']);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect(messages[0].content).toBe('Also save notes.md in the Library.');
    expect(missingComputedArtifacts(steering.request, [], [])).toEqual(['regression.json', 'notes.md']);
    expect(steering.stopped).toBe(false);
  });

  it('finishes the current tool, then consumes a stop before another model call or output retry', async () => {
    const pending: string[] = [];
    const steering = new LiveTurnSteering('Save sustained-check.json in the Library.');
    const modelCalls: string[] = [];
    const effects: string[] = [];
    const command = tool(async () => {
      effects.push('current tool finished');
      pending.push('Stop this disposable runtime diagnostic after the current tool returns.');
      return 'Actual completed tool result';
    }, { name: 'run_command', description: 'Controlled finite command', schema: z.object({}) });
    const graph = new StateGraph(MessagesAnnotation)
      .addNode('model', async state => {
        const additions = await steering.beforeModel(() => pending.splice(0));
        if (steering.stopped) return { messages: [...additions, new AIMessage('Stopped after the last tool.')] };
        modelCalls.push('model invoked');
        return { messages: new AIMessage({ content: '', tool_calls: [{ id: 'owned-call', name: 'run_command', args: {} }] }) };
      })
      .addNode('tools', new ToolNode([command]))
      .addEdge(START, 'model')
      .addConditionalEdges('model', state => (state.messages.at(-1) as AIMessage).tool_calls?.length ? 'tools' : END)
      .addEdge('tools', 'model').compile();
    const result = await graph.invoke({ messages: [new HumanMessage(steering.request)] }, { recursionLimit: 8 });
    expect(modelCalls).toEqual(['model invoked']);
    expect(effects).toEqual(['current tool finished']);
    expect(steering.stopped).toBe(true);
    expect(result.messages.some(message => message.content === 'Actual completed tool result')).toBe(true);
    expect(result.messages.at(-1)?.content).toBe('Stopped after the last tool.');
    // The original file was not produced. Stopping must not turn its absence
    // into another enforced execution or a claim of successful publication.
    expect(missingComputedArtifacts(steering.request, [], [])).toEqual(['sustained-check.json']);
  });

  it('recognizes direct user cancellation without interpreting ordinary task text as a stop', () => {
    for (const prompt of ['Stop', 'Please cancel this task.', 'Abort the active workflow.', 'Stop this disposable runtime diagnostic after the current tool returns.']) expect(requestsRunStop(prompt)).toBe(true);
    for (const prompt of ['Do not stop until the output exists.', 'Stop using red and use blue.', 'Stop test computers from restarting.', 'Stop this workflow from changing source inputs.', 'The source says "stop this run".', 'Change the label to Stop.']) expect(requestsRunStop(prompt)).toBe(false);
  });
});
