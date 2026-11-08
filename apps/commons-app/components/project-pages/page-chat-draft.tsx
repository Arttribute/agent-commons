"use client";
import { useEffect } from "react";
import { useAgentContext } from "@/context/AgentContext";
export function PageChatDraft({
  title,
  context,
}: {
  title: string;
  context: string;
}) {
  const { setInputText } = useAgentContext();
  useEffect(() => {
    setInputText(
      `I have a question about ${title}.\n\nPublished page information:\n${context}\n\nUse only these public details for camp / business facts. Do not assume access to the page owner's private project, and do not collect children's personal details. Ask me what I would like to know.`,
    );
  }, [title, context, setInputText]);
  return (
    <p className="mx-auto max-w-3xl px-4 pt-5 text-sm text-muted-foreground">
      A draft about {title} is ready. Review it and send when you’re ready.
    </p>
  );
}
