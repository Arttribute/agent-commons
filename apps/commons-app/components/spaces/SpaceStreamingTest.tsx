"use client";

import React, { useState } from "react";
import { useSpacesContext } from "@/context/SpacesContext";

export function SpaceStreamingTest() {
  const {
    currentSpaceId,
    createSpace,
    startCollaboration,
    startCollaborationStream,
    conversations,
    collaborationResult,
    isCollaborating,
    collaborationError,
  } = useSpacesContext();

  const [task, setTask] = useState("Tell a simple story with 3 parts");
  const [agentIds, setAgentIds] = useState("agent1,agent2");
  const [streamingMode, setStreamingMode] = useState(false);
  const [accumulatedMessages, setAccumulatedMessages] = useState<any[]>([]); // For meaningful streaming messages only

  const handleCreateSpace = async () => {
    try {
      const spaceId = await createSpace();
      console.log("Created space:", spaceId);
    } catch (error) {
      console.error("Failed to create space:", error);
    }
  };

  const handleStartCollaboration = async () => {
    if (!currentSpaceId) {
      alert("Please create a space first");
      return;
    }

    const agentIdArray = agentIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (streamingMode) {
      setAccumulatedMessages([]);
      await startCollaborationStream(
        currentSpaceId,
        task,
        agentIdArray,
        (message) => {
          console.log("Stream message received:", message);

          // Filter out token messages and only collect meaningful events
          const meaningfulTypes = [
            "collaboration_started",
            "agent_chunk",
            "agent_completed",
            "collaboration_summary",
            "final",
          ];

          if (meaningfulTypes.includes(message.type)) {
            setAccumulatedMessages((prev) => [...prev, message]);
          }
        }
      );
    } else {
      await startCollaboration(currentSpaceId, task, agentIdArray);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Space Streaming Test</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Current Space ID: {currentSpaceId || "None"}
          </label>
          <button
            onClick={handleCreateSpace}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Create New Space
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Task:</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 h-24"
            placeholder="Enter collaboration task..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Agent IDs (comma-separated):
          </label>
          <input
            type="text"
            value={agentIds}
            onChange={(e) => setAgentIds(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
            placeholder="agent1,agent2,agent3"
          />
        </div>

        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={streamingMode}
              onChange={(e) => setStreamingMode(e.target.checked)}
              className="mr-2"
            />
            Use Streaming Mode
          </label>

          <button
            onClick={handleStartCollaboration}
            disabled={isCollaborating || !currentSpaceId}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-400"
          >
            {isCollaborating ? "Collaborating..." : "Start Collaboration"}
          </button>
        </div>

        {collaborationError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            Error: {collaborationError}
          </div>
        )}
      </div>

      {/* Streaming Messages */}
      {streamingMode && accumulatedMessages.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded p-4">
          <h3 className="text-lg font-semibold mb-3">
            Live Stream Messages ({accumulatedMessages.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {accumulatedMessages.map((message, index) => (
              <div key={index} className="bg-white border rounded p-2 text-sm">
                <div className="font-medium text-blue-600 mb-1">
                  Type: {message.type || "unknown"}
                  {message.agentId && ` | Agent: ${message.agentId}`}
                  {message.timestamp &&
                    ` | ${new Date(message.timestamp).toLocaleTimeString()}`}
                </div>
                <div className="text-gray-700 mb-2">
                  {message.type === "collaboration_started" && (
                    <span className="text-green-600">
                      ✅ Collaboration started with {message.agentIds?.length}{" "}
                      agents
                    </span>
                  )}
                  {message.type === "agent_chunk" &&
                    message.chunk?.type !== "token" && (
                      <span>🤖 Agent activity: {message.chunk?.type}</span>
                    )}
                  {message.type === "agent_completed" && (
                    <span className="text-blue-600">
                      ✅ Agent completed ({message.completedCount}/
                      {message.totalAgents})
                    </span>
                  )}
                  {message.type === "collaboration_summary" && (
                    <div className="text-green-600">
                      <strong>🎉 Collaboration Complete!</strong>
                      <br />
                      <span className="text-sm">
                        Duration: {Math.round(message.summary?.duration / 1000)}
                        s | Messages: {message.summary?.totalMessages}
                      </span>
                    </div>
                  )}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    Show raw message data
                  </summary>
                  <div className="text-gray-700 mt-2 text-xs bg-gray-100 p-2 rounded max-h-32 overflow-y-auto">
                    <pre>{JSON.stringify(message, null, 2)}</pre>
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversations */}
      {conversations.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded p-4">
          <h3 className="text-lg font-semibold mb-3">Conversations</h3>
          <div className="space-y-4">
            {conversations.map((conv) => (
              <div key={conv.agentId} className="bg-white border rounded p-3">
                <div className="font-medium text-green-600 mb-2">
                  {conv.agentName} ({conv.agentId}) - Status: {conv.status}
                </div>
                <div className="space-y-1">
                  {conv.messages.map((message, index) => (
                    <div
                      key={index}
                      className="text-sm bg-gray-100 rounded p-2"
                    >
                      <div className="font-medium">{message.role}:</div>
                      <div>{message.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final Result */}
      {collaborationResult && (
        <div className="bg-green-50 border border-green-200 rounded p-4">
          <h3 className="text-lg font-semibold mb-3">Collaboration Result</h3>
          <div className="space-y-2 text-sm">
            <div>
              <strong>Task:</strong> {collaborationResult.task}
            </div>
            <div>
              <strong>Outcome:</strong> {collaborationResult.outcome}
            </div>
            <div>
              <strong>Duration:</strong> {collaborationResult.duration}ms
            </div>
            <div>
              <strong>Participants:</strong> {collaborationResult.participants}
            </div>
            <div>
              <strong>Total Messages:</strong>{" "}
              {collaborationResult.totalMessages}
            </div>
            <div className="mt-3">
              <strong>Final Result:</strong>
              <div className="bg-white border rounded p-2 mt-1">
                {collaborationResult.finalResult}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
