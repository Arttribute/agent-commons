import { eq } from "drizzle-orm";
import { inject, injectable } from "tsyringe";
import { DatabaseService } from "../helpers/database.js";
import * as schema from "../models/index.js";

@injectable()
export class AgentToolService {
	constructor(
	@inject(DatabaseService) private $db: DatabaseService,
  ) {}

	async getAgentTools(agentId: string) {
		return this.$db.query.agentTool.findMany({
			where: (t) => eq(t.agentId, agentId),
		});
	}
	async addAgentTool(
		agentId: string,
		toolId: string,
		usageComments?: string,
		secureKeyRef?: string,
	) {
		const [inserted] = await this.$db
			.insert(schema.agentTool)
			.values({ agentId, toolId, usageComments, secureKeyRef })
			.returning();
		return inserted;
	}
	async removeAgentTool(id: string) {
		await this.$db.delete(schema.agentTool).where(eq(schema.agentTool.id, id));
		return { success: true };
	}
}
