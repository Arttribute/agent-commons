import type { Metadata } from "next";
import { NewChatView } from "@/components/home/new-chat-view";

export const metadata: Metadata = { title: "New chat" };

export default function NewChatPage() {
  return <NewChatView />;
}
