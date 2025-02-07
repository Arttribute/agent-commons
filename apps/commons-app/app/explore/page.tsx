"use client";
import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AppBar from "@/components/layout/AppBar";
import ResourceList from "@/components/resources/ResourceList";
import TasksList from "@/components/tasks/TasksList";

export default function HomePage() {
  return (
    <div>
      <AppBar />
      <div className="min-h-screen mt-16 p-4">
        <Tabs defaultValue="resources">
          <TabsList className="mb-4">
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
          </TabsList>

          <TabsContent value="resources">
            <ResourceList
              resources={[
                {
                  title: "Resource 1",
                  description: "This is the first resource",
                  image: "https://via.placeholder.com/150",
                },
                {
                  title: "Resource 2",
                  description: "This is the second resource",
                  image: "https://via.placeholder.com/150",
                },
                {
                  title: "Resource 3",
                  description: "This is the third resource",
                  image: "https://via.placeholder.com/150",
                },
                {
                  title: "Resource 4",
                  description: "This is the fourth resource",
                  image: "https://via.placeholder.com/150",
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="tasks">
            <TasksList
              tasks={[
                {
                  name: "Agent",
                  description: "Manage your agents",
                  calls: 0,
                },
                {
                  name: "Tool",
                  description: "Manage your tools",
                  calls: 0,
                },
                {
                  name: "Knowledge Base",
                  description: "Manage knowledge entries",
                  calls: 0,
                },
                {
                  name: "Marketplace",
                  description: "Buy/sell agents and tools",
                  calls: 0,
                },
                {
                  name: "Settings",
                  description: "Manage account settings",
                  calls: 0,
                },
              ]}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
