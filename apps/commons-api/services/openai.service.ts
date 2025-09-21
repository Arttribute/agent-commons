import { OpenAI } from "openai";
import { container } from "tsyringe";

export const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

container.register(OpenAI, { useValue: openai });

export function getOpenAI() {
	return container.resolve(OpenAI) as typeof openai;
}
