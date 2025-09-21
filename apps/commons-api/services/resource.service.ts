import { eq, or, sql } from "drizzle-orm";
import { inject, injectable } from "tsyringe";
import {
	createPublicClient,
	createWalletClient,
	getContract,
	hexToBigInt,
	http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DatabaseService } from "../helpers/database.js";
import { COMMON_RESOURCE_ABI } from "../lib/abis/CommonResourceABI.js";
import { COMMON_RESOURCE_ADDRESS } from "../lib/addresses.js";
import { baseSepolia } from "../lib/baseSepolia.js";
import * as schema from "../models/schema.js";
import { type EmbeddingType, ResourceType } from "../types/embedding.type.js";
import type { ToolSchema } from "../types/tool.type.js";
import { AgentService } from "./agent.service.js";
import { EmbeddingService } from "./embedding.service.js";

@injectable()
export class ResourceService {
	private publicClient = createPublicClient({
		chain: baseSepolia,
		transport: http(),
	});
	constructor(
    @inject(DatabaseService) private $db: DatabaseService,
    @inject(AgentService) private $agent: AgentService,
    @inject(EmbeddingService) private $embedding: EmbeddingService,
  ) {}

	getHello(): string {
		return "Hello World!";
	}

	async createResource(props: {
		agentId: string;
		resourceMetadata: string;
		resourceFile: string;
		resourceType: ResourceType;
		embeddingType: EmbeddingType;
		schema?: ToolSchema;
		tags: string[];
		requiredReputation: bigint;
		usageCost: bigint;
		contributors: `0x${string}`[];
		shares: bigint[];
		isCoreResource: false;
	}) {
		const {
			agentId,
			resourceFile,
			resourceMetadata,
			resourceType,
			embeddingType,
			schema,
			tags,
			requiredReputation = 0n,
			usageCost = 0n,
			contributors = [agentId],
			shares = [100],
		} = props;

		const agent = await this.$agent.getAgent({ id: agentId });

		const privateKey = this.$agent.seedToPrivateKey(agent.wallet.seed);

		const wallet = createWalletClient({
			account: privateKeyToAccount(`0x${privateKey}` as `0x${string}`),
			chain: baseSepolia,
			transport: http(),
		});

		const actualCreator = agentId;

		const isCoreResource = false;

		const contract = getContract({
			address: COMMON_RESOURCE_ADDRESS,
			abi: COMMON_RESOURCE_ABI,

			client: wallet,
		});

		const txHash = await contract.write.createResource([
			actualCreator,
			resourceMetadata,
			resourceFile,
			BigInt(requiredReputation),
			BigInt(usageCost),
			contributors,
			shares.map(BigInt),
			isCoreResource,
		]);

		const receipt = await this.publicClient.waitForTransactionReceipt({
			hash: txHash,
		});
		console.log("createResource txHash:", txHash);

		const log = receipt.logs.find(
			(log) =>
				log.topics[0] ===
				"0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62",
		);
		console.log("createResource log:", log);
		const id = hexToBigInt(`0x${log!.data.slice(2, 64 + 2)}`);
		console.log("Resource ID:", id);

		const resource = this.$embedding.createEmbedding({
			resourceId: id.toString(),
			content: resourceFile || "does not require resource file",
			resourceType: resourceType,
			embeddingType: embeddingType,
			schema,
			tags,
			resourceFile,
		});
		console.log("Resource created:", resource);

		return resource;
	}

	textToDataURLBase64(text: string) {
		const mimeType = "text/plain"; // MIME type for plain text
		const base64Text = btoa(encodeURIComponent(text));
		return `data:${mimeType};base64,${base64Text}`;
	}

	findResources(props: { query: string; resourceType: ResourceType }) {
		const { query, resourceType } = props;
		if (
			resourceType === ResourceType.text ||
			resourceType === ResourceType.audio ||
			resourceType === ResourceType.image
		) {
			const resources = this.$embedding.find({
				content: query,
				embeddingType: resourceType as unknown as EmbeddingType,
			});
			return resources;
		}

		const normalizedQuery = query?.trim().toLowerCase();

		const resourceEntriesPromise = this.$db.query.resource.findMany({
			// Fuzzy Search
			where: (t) =>
				or(
					query
						? sql`
            (setweight(to_tsvector('english', array_to_string(${t.tags}, ', ')), 'A'))
            @@ websearch_to_tsquery('english', ${query})
            `
						: undefined,
					normalizedQuery
						? sql`similarity(array_to_string(${t.tags}, ', '), ${normalizedQuery}) > 0.3`
						: undefined,
				),
		});

		return resourceEntriesPromise;
	}

	async getResourceById(resourceId: string) {
		return this.$db.query.resource.findFirst({
			where: (r) => eq(r.resourceId, resourceId),
		});
	}
}
