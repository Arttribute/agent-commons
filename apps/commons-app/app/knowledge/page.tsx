import { KnowledgeSpacesView } from "@/components/brains/knowledge-spaces-view";
import { Suspense } from "react";

export default function KnowledgePage() {
  return <Suspense fallback={null}><KnowledgeSpacesView /></Suspense>;
}
