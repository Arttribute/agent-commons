"use client";
import React from "react";
//import { useAuth } from "@/context/AuthContext"; // the file we created
import AppBar from "@/components/layout/AppBar";
import ResourceList from "@/components/resources/ResourceList";

export default function HomePage() {
  //const { authState, login, logout } = useAuth();
  //const { idToken, username, walletAddress, profileImage } = authState;

  //const isAuthenticated = !!idToken;

  return (
    <div>
      <AppBar />
      <div className="min-h-screen  mt-16">
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
      </div>
    </div>
  );
}
