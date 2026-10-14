import { BaseCallbackHandler } from '@langchain/core/callbacks/base';

/** Authorization and settlement are execution boundaries, not background
 * telemetry. Keep these flags in the methods closure so LangChain copies
 * retain them as well. */
export function blockingModelCallbacks(
  methods: Parameters<typeof BaseCallbackHandler.fromMethods>[0],
): BaseCallbackHandler {
  const blockingMethods = Object.assign({}, methods, { raiseError: true, awaitHandlers: true });
  return BaseCallbackHandler.fromMethods(blockingMethods);
}
