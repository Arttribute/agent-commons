import type { WalletData } from "@coinbase/coinbase-sdk";
import { Wallet } from "@coinbase/coinbase-sdk";
import { HDKey } from "@scure/bip32";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { first, omit } from "lodash-es";
import { container, inject, injectable } from "tsyringe";
import typia from "typia";
import {
	createPublicClient,
	createWalletClient,
	getContract,
	http,
	parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DatabaseService } from "../helpers/database.js";
import { AGENT_REGISTRY_ABI } from "../lib/abis/AgentRegistryABI.js";
import {
	AGENT_REGISTRY_ADDRESS,
	COMMON_TOKEN_ADDRESS,
} from "../lib/addresses.js";
import { baseSepolia } from "../lib/baseSepolia.js";
import * as schema from "../models/index.js";
import { agent } from "../models/schema.js";
import type { Agent, CreateAgent, UpdateAgent } from "../types/agent.type.js";
import { publicClient } from "./coinbase.service.js";
import type { CommonTool } from "./common-tool.service.js";
import type { EthereumTool } from "./ethereum-tool.service.js";
import type { Memory } from "./memory.service.js";
import { TaskService } from "./task.service.js";
import { ToolService } from "./tool.service.js";

function hashKey(key: string): string {
	return crypto.createHash("sha256").update(key).digest("hex");
}

const app = typia.llm.application<
	EthereumTool & CommonTool & Memory,
	"chatgpt"
>();

@injectable()
export class AgentService {
	private publicClient = createPublicClient({
		chain: baseSepolia,
		transport: http(),
	});

	constructor(
    @inject(DatabaseService) private $db: DatabaseService,
    @inject(ToolService) private $tool: ToolService,
    @inject(TaskService) private $task: TaskService,
  ) {}

	public async createAgent(props: {
		value: CreateAgent;
		commonsOwned?: boolean;
	}) {
		// Create with coinbase sdk
		const wallet = await Wallet.create();
		// Possibly faucet if testnet
		const faucetTx = await wallet.faucet();
		await faucetTx.wait();
		// If it’s Ethereum mainnet or any other chain, skip faucet

		const agentId = (await wallet.getDefaultAddress())?.getId().toLowerCase();

		const agentOwner = props.commonsOwned
			? "0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab"
			: (props.value.owner as string);

		// let liaisonKey: string | undefined;
		// let liaisonKeyHash: string | undefined;
		// let liaisonKeyDisplay: string | undefined;
		// if (isLiaison) {
		// 	liaisonKey = crypto.randomBytes(32).toString("hex");
		// 	liaisonKeyHash = hashKey(liaisonKey);
		// 	liaisonKeyDisplay = `slk-${liaisonKey.slice(0, 14)}...${liaisonKey.slice(
		// 		-14,
		// 	)}`;
		// }

		const $db = container.resolve(DatabaseService);

		const agentEntry = await $db
			.insert(agent)
			.values({
				...props.value,
				agentId,
				owner: agentOwner,
				wallet: wallet.export() as WalletData,
				isLiaison: false,
			})
			.returning()
			.then(first<Agent>);

		if (props.commonsOwned) {
			const commonsWallet = createWalletClient({
				account: privateKeyToAccount(
					process.env.WALLET_PRIVATE_KEY! as `0x${string}`,
				),
				chain: baseSepolia,
				transport: http(),
			});
			const contract = getContract({
				abi: AGENT_REGISTRY_ABI,
				address: AGENT_REGISTRY_ADDRESS,
				client: commonsWallet,
			});
			await this.publicClient.waitForTransactionReceipt({
				hash: await contract.write.registerAgent([
					agentId,
					"ipfs://placeholder",
					true,
				]),
			});
		}

		return agentEntry;
	}

	public async getAgent(props: { id: string }) {
		const { id } = props;

		const agentEntry = await this.$db.query.agent.findFirst({
			where: (t) => eq(t.agentId, id),
		});
		if (!agentEntry) {
			throw new HTTPException(404, { message: "Agent not found" });
		}
		return agentEntry;
	}

	public async getAgents() {
		return this.$db.query.agent.findMany();
	}

	public async updateAgent(props: { id: string; delta: UpdateAgent }) {
		const { id, delta } = props;
		// 1) Ensure agent exists
		const existingAgent = await this.$db.query.agent.findFirst({
			where: (t) => eq(t.agentId, id),
		});
		if (!existingAgent) {
			throw new HTTPException(400, { message: "Agent not found" });
		}

		// 2) Update record
		// Omit fields that are not allowed to be updated or are sensitive
		const allowedUpdates = omit(delta, ["wallet", "agentId", "createdAt"]);
		const [updated] = await this.$db
			.update(schema.agent)
			.set(allowedUpdates)
			.where(eq(schema.agent.agentId, id))
			.returning();
		return updated;
	}

	// async runAgent(props: {
	// 	agentId: string;
	// 	messages?: ChatCompletionMessageParam[];
	// 	sessionId?: string;
	// 	initiator: string;
	// 	parentSessionId?: string;
	// 	stream?: boolean; // ✅ stream flag
	// }) {
	// 	const tStart = performance.now();
	// 	const {
	// 		agentId,
	// 		sessionId,
	// 		initiator,
	// 		parentSessionId,
	// 		stream = false, // default false
	// 	} = props;

	// 	try {
	// 		const agent = await this.getAgent({ id: agentId });

	// 		const wallet = await Wallet.import(agent.wallet);
	// 		if ((await wallet.getBalance(COMMON_TOKEN_ADDRESS)).lte(0)) {
	// 			throw new HTTPException(400, { message: "Agent has no tokens" });
	// 		}

	// 		let currentSessionId = sessionId;
	// 		let isNewSession = false;
	// 		if (!currentSessionId) {
	// 			const newSession = await this.$session.createSession({
	// 				value: {
	// 					sessionId: uuidv4(),
	// 					agentId,
	// 					initiator: initiator,
	// 					model: {
	// 						name: "gpt-4o",
	// 						temperature: agent.temperature || 0.7,
	// 						maxTokens: agent.maxTokens || 2000,
	// 						topP: agent.topP || 1,
	// 						presencePenalty: agent.presencePenalty || 0,
	// 						frequencyPenalty: agent.frequencyPenalty || 0,
	// 					},
	// 					createdAt: new Date(),
	// 					updatedAt: new Date(),
	// 				},
	// 				parentSessionId,
	// 			});
	// 			currentSessionId = newSession.sessionId;
	// 			isNewSession = true;
	// 		}

	// 		const storedTools = await this.$tool.getAllTools();
	// 		const dynamicDefs = storedTools.map((dbTool) => ({
	// 			type: "function",
	// 			function: { ...dbTool.schema, name: dbTool.name },
	// 			endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools/call`,
	// 		}));

	// 		const resTools = await this.$db.query.resource.findMany({
	// 			where: (r) => inArray(r.resourceId, agent.commonTools ?? []),
	// 		});

	// 		const resourceDefs = resTools
	// 			.filter((r) => !!r.schema)
	// 			.map((r) => ({
	// 				type: "function",
	// 				function: {
	// 					...(r.schema as any),
	// 					name: `resourceTool_${r.resourceId}`,
	// 				},
	// 				endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools/call`,
	// 			}));

	// 		const staticDefs = map(app.functions, (_) => ({
	// 			type: "function",
	// 			function: {
	// 				..._,
	// 				parameters:
	// 					_?.parameters as unknown as ChatCompletionTool["function"]["parameters"],
	// 			},
	// 			endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools/call`,
	// 		})) as (ChatCompletionTool & { endpoint: string })[];

	// 		const toolDefs = [...dynamicDefs, ...resourceDefs, ...staticDefs];

	// 		const toolUsage: {
	// 			name: string;
	// 			status: string;
	// 			duration?: number;
	// 		}[] = [];
	// 		const executedCalls: any[] = [];

	// 		const callbackHandler = BaseCallbackHandler.fromMethods({
	// 			handleLLMNewToken: async (token: string) => {
	// 				if (stream) {
	// 					subscriber.next({
	// 						type: "token",
	// 						role: "ai",
	// 						content: token,
	// 						timestamp: new Date().toISOString(),
	// 					});
	// 				}
	// 			},
	// 			handleToolStart: async (tool: any, input: string) => {
	// 				subscriber.next({
	// 					type: "toolStart",
	// 					toolName: tool.name,
	// 					input,
	// 					timestamp: new Date().toISOString(),
	// 				});
	// 			},
	// 			handleToolEnd: async (output: any) => {
	// 				subscriber.next({
	// 					type: "toolEnd",
	// 					output,
	// 					timestamp: new Date().toISOString(),
	// 				});
	// 			},
	// 		});

	// 		const llm = new ChatOpenAI({
	// 			model: "gpt-4o",
	// 			temperature: 0,
	// 			supportsStrictToolCalling: true,
	// 			apiKey: process.env.OPENAI_API_KEY,
	// 			streaming: stream, // ✅ use flag
	// 		});

	// 		const llmWithTools = llm.bindTools(toolDefs, {
	// 			parallel_tool_calls: true,
	// 			strict: false,
	// 			callbacks: [callbackHandler],
	// 		});

	// 		const makeRunner = (def: ChatCompletionTool & { endpoint: string }) =>
	// 			tool(
	// 				async (args, config) => {
	// 					const fn = config.toolCall?.name ?? "unknown";
	// 					const t0 = performance.now();
	// 					const data = await got
	// 						.post(`http://localhost:${process.env.PORT}/v1/agents/tools/call`, {
	// 							json: {
	// 								args,
	// 								toolCall: config.toolCall,
	// 								metadata: { agentId },
	// 							},
	// 						})
	// 						.json<any>()
	// 						.catch((e: any) => {
	// 							toolUsage.push({
	// 								name: fn,
	// 								status: "error",
	// 								duration: performance.now() - t0,
	// 							});
	// 							throw e;
	// 						});

	// 					toolUsage.push({
	// 						name: fn,
	// 						status: "success",
	// 						duration: performance.now() - t0,
	// 					});

	// 					const callObj = {
	// 						role: "tool",
	// 						name: fn,
	// 						status: "success",
	// 						duration: performance.now() - t0,
	// 						args,
	// 						result: data,
	// 						timestamp: new Date().toISOString(),
	// 					};

	// 					executedCalls.push(callObj);

	// 					subscriber.next({
	// 						type: "tool",
	// 						...callObj,
	// 					});

	// 					return { toolData: data };
	// 				},
	// 				{
	// 					name: def.function.name,
	// 					description: def.function.description,
	// 					schema: def.function
	// 						.parameters as unknown as IChatGptSchema.IParameters,
	// 				},
	// 			);

	// 		const toolRunners = toolDefs.map((def) =>
	// 			makeRunner(def as ChatCompletionTool & { endpoint: string }),
	// 		);

	// 		const toolNode = new ToolNode(toolRunners);
	// 		const collectedToolCalls = executedCalls;

	// 		const callModel = async (s: typeof MessagesAnnotation.State) => ({
	// 			messages: await llmWithTools.invoke(s.messages),
	// 		});

	// 		const shouldCont = (s: typeof MessagesAnnotation.State) => {
	// 			const last = s.messages.at(-1);
	// 			return last &&
	// 				"tool_calls" in last &&
	// 				Array.isArray(last.tool_calls) &&
	// 				last.tool_calls.length
	// 				? "tools"
	// 				: END;
	// 		};

	// 		const graph = new StateGraph(MessagesAnnotation)
	// 			.addNode("model", callModel)
	// 			.addNode("tools", toolNode)
	// 			.addEdge(START, "model")
	// 			.addConditionalEdges("model", shouldCont, ["tools", END])
	// 			.addEdge("tools", "model")
	// 			.compile({
	// 				checkpointer: PostgresSaver.fromConnString(
	// 					`postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`,
	// 				),
	// 			});

	// 		let messages: Messages = [];

	// 		if (!sessionId) {
	// 			const boot = await this.createAgentSession(agentId, currentSessionId);
	// 			messages.push(
	// 				...boot.messages.map((m) => ({
	// 					...m,
	// 					type: m.role,
	// 					content: m.content ?? "",
	// 				})),
	// 			);
	// 		} else {
	// 			// ✅ For existing sessions, inject updated system message with current child sessions
	// 			const currentTime = new Date();
	// 			const childSessions = await this.getChildSessions(currentSessionId);

	// 			const childSessionsInfo =
	// 				childSessions.length > 0
	// 					? `\n\nEXISTING CHILD SESSIONS:\nYou have the following ongoing conversations with other agents. Use these sessionIds to continue existing conversations instead of starting new ones:\n${childSessions.map((cs) => `- Agent ${cs.childAgentId}: ${cs.title || "Untitled conversation"} (sessionId=${cs.childSessionId}, started: ${cs.createdAt})`).join("\n")}`
	// 					: "";

	// 			console.log(
	// 				"Updated childSessionsInfo for existing session:",
	// 				childSessionsInfo,
	// 			);

	// 			// Add updated system message with current child session info
	// 			messages.push({
	// 				type: "system",
	// 				role: "system",
	// 				content: `
	//           REMEMBER:

	//           When using the interactWithAgent tool you can only use sessionIds from the following list when continuing conversations: ${childSessionsInfo}`,
	// 			} as any);
	// 			console.log("Child sessions after update:", childSessionsInfo);
	// 		}

	// 		if (props.messages?.length) {
	// 			messages.push(
	// 				...props.messages.map((m) => ({
	// 					...m,
	// 					type: m.role,
	// 					content: m.content ?? "",
	// 				})),
	// 			);
	// 		}

	// 		let loop = 0;
	// 		const max_recurssion = agent.autonomyEnabled ? 2 : 4;
	// 		let finalResult = null;

	// 		while (loop++ < max_recurssion) {
	// 			const nextTask = await this.$tasks.getNextExecutable(
	// 				agentId,
	// 				currentSessionId,
	// 			);
	// 			if (nextTask) {
	// 				await this.$tasks.start(nextTask.taskId);
	// 				messages.push({
	// 					type: "user",
	// 					role: "user",
	// 					content: `##TASK_INSTRUCTION: ${nextTask.description}`,
	// 				} as any);
	// 			}

	// 			const result = await graph.invoke(
	// 				{ messages },
	// 				{ configurable: { thread_id: currentSessionId } },
	// 			);

	// 			messages = result.messages;
	// 			finalResult = result;

	// 			const pending = await this.$tasks.getNextExecutable(
	// 				agentId,
	// 				currentSessionId,
	// 			);
	// 			if (!pending) break;
	// 		}

	// 		const toolCalls = collectedToolCalls.filter(
	// 			(call) => call.name !== "interactWithAgent",
	// 		);

	// 		const rawAgenCalls: any = collectedToolCalls.filter(
	// 			(call) => call.name === "interactWithAgent",
	// 		);

	// 		const agentCalls = rawAgenCalls
	// 			.filter((call: any) => call.name === "interactWithAgent" && call.args)
	// 			.map(async (call: any) => {
	// 				const args = call.args;
	// 				const sessionIdToUse = args.sessionId || undefined;
	// 				const childSession$ = this.runAgent({
	// 					agentId: args.agentId,
	// 					messages: args.messages,
	// 					sessionId: sessionIdToUse,
	// 					initiator: agentId,
	// 					parentSessionId: currentSessionId,
	// 				});

	// 				let lastData: any;
	// 				await new Promise<void>((resolve, reject) => {
	// 					childSession$.subscribe({
	// 						next: (chunk) => {
	// 							lastData = chunk;
	// 						},
	// 						error: reject,
	// 						complete: resolve,
	// 					});
	// 				});

	// 				return {
	// 					agentId: args.agentId,
	// 					message: args.messages?.[0]?.content || "",
	// 					response: lastData,
	// 					sessionId: lastData?.sessionId,
	// 				};
	// 			});

	// 		const resolvedAgentCalls = await Promise.all(agentCalls);

	// 		const messageHistories =
	// 			finalResult?.messages?.filter((m) => m.toDict().type !== "system") ||
	// 			[];

	// 		const currentSession = await this.$session.getSession({
	// 			id: currentSessionId,
	// 		});
	// 		if (!currentSession) {
	// 			throw new HTTPException(400, { message: "Session not found" });
	// 		}

	// 		let sessionTitle = "New Session";
	// 		if (isNewSession && props.messages?.length) {
	// 			const firstUserMessage = props.messages.find((m) => m.role === "user");
	// 			if (firstUserMessage?.content) {
	// 				sessionTitle = await this.generateSessionTitle(
	// 					firstUserMessage.content as string,
	// 				);
	// 			}
	// 		}

	// 		await this.$session.updateSession({
	// 			id: currentSessionId,
	// 			delta: {
	// 				endedAt: new Date(),
	// 				title: isNewSession
	// 					? sessionTitle
	// 					: currentSession.title || sessionTitle,
	// 				metrics: {
	// 					totalTokens: toolUsage.reduce(
	// 						(acc, tool) => acc + (tool.duration || 0),
	// 						0,
	// 					),
	// 					toolCalls: toolUsage.length,
	// 					errorCount: toolUsage.filter((t) => t.status === "error").length,
	// 				},
	// 				history: messageHistories.map((m) => ({
	// 					role: m.toDict().type,
	// 					content:
	// 						typeof m.content === "string"
	// 							? m.content
	// 							: JSON.stringify(m.content),
	// 					timestamp: new Date().toISOString(),
	// 					metadata: {
	// 						toolCalls:
	// 							m.toDict().type === "assistant" ? toolCalls : undefined,
	// 						agentCalls:
	// 							m.toDict().type === "assistant"
	// 								? resolvedAgentCalls
	// 								: undefined,
	// 					},
	// 				})),
	// 				updatedAt: new Date(),
	// 			},
	// 		});

	// 		const last = messages.at(-1)!;
	// 		const finalText =
	// 			typeof last === "object" &&
	// 			last !== null &&
	// 			"content" in last &&
	// 			typeof last.content === "string"
	// 				? last.content
	// 				: typeof last === "object" && "content" in last
	// 					? compact(map((last as any).content, (_) => get(_, "text"))).join(
	// 							"\n",
	// 						)
	// 					: "";

	// 		await this.logService.createLogEntry({
	// 			agentId,
	// 			sessionId: currentSessionId,
	// 			action: "run",
	// 			message: finalText.slice(0, 512),
	// 			status: "success",
	// 			responseTime: performance.now() - tStart,
	// 			tools: toolUsage,
	// 		});

	// 		const lastMessage = finalResult?.messages?.at(-1)?.toDict() ?? {};

	// 		subscriber.next({
	// 			type: "final",
	// 			payload: {
	// 				...lastMessage,
	// 				sessionId: currentSessionId,
	// 				title: sessionTitle,
	// 				metadata: {
	// 					toolCalls,
	// 					agentCalls: resolvedAgentCalls,
	// 				},
	// 			},
	// 		});

	// 		subscriber.complete();
	// 	} catch (err) {
	// 		subscriber.error(err);
	// 	}
	// }

	async getChildSessions(parentSessionId: string) {
		const sessions = await this.$db.query.session.findMany({
			where: (s) => eq(s.parentSessionId, parentSessionId),
		});
		console.log(
			`Found ${sessions.length} child sessions for parent ${parentSessionId}`,
		);

		return sessions.map((session) => ({
			childSessionId: session.sessionId,
			childAgentId: session.agentId,
			title: session.title,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
		}));
	}

	public seedToPrivateKey(seed: string) {
		const seedBuffer = Buffer.from(seed, "hex");
		const hmac = crypto.createHmac("sha512", "Bitcoin seed");
		hmac.update(seedBuffer);

		const node = HDKey.fromMasterSeed(seedBuffer);
		const childNode = node.derive("m/44'/60'/0'/0/0"); // Standard Ethereum path
		const privateKey = Buffer.from(childNode.privateKey!).toString("hex");
		return privateKey;
	}

	public async purchaseCommons(props: { id: string; amountInCommon: string }) {
		const row = await this.getAgent(props);
		const wallet = await Wallet.import(row.wallet);

		// parse
		const amountInWei = BigInt(parseUnits(props.amountInCommon, 18));
		const pk = this.seedToPrivateKey(row.wallet.seed);

		// dynamically pick chain
		// const chain = getChainByName(row.network || "base");
		const walletClient = createWalletClient({
			account: privateKeyToAccount(`0x${pk}` as `0x${string}`),
			chain: baseSepolia,
			transport: http(),
		});

		const txHash = await walletClient.sendTransaction({
			to: COMMON_TOKEN_ADDRESS as `0x${string}`,
			value: amountInWei,
			chain: undefined,
		});
		await publicClient.waitForTransactionReceipt({ hash: txHash });
	}

	public async checkCommonsBalance(props: { id: string }) {
		const row = await this.getAgent(props);
		const wallet = await Wallet.import(row.wallet);
		const balance = await wallet.getBalance(COMMON_TOKEN_ADDRESS);
		return balance.toNumber();
	}

	async transferTokensToWallet(props: {
		agentId: string;
		address: string;
		amount: number;
	}) {
		const { agentId, address, amount } = props;

		const agent = await this.$db.query.agent.findFirst({
			where: (t) => eq(t.agentId, agentId),
		});

		if (!agent) {
			throw new HTTPException(400, { message: "Agent not found" });
		}

		const wallet = await Wallet.import(agent.wallet).catch((e) => {
			console.log(e);
			throw e;
		});

		const tx = await wallet.createTransfer({
			amount,
			assetId: COMMON_TOKEN_ADDRESS,
			destination: address,
		});

		await tx.wait();
		const commonsBalance = await wallet.getBalance(COMMON_TOKEN_ADDRESS);

		return { balance: commonsBalance.toNumber(), txHash: tx };
	}
}
