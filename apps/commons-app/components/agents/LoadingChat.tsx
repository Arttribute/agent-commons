import React from "react";

export default function LoadingChat() {
  return (
    <div className="flex justify-center items-center h-full">
      <div className="flex space-x-2">
        <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-300"></div>
      </div>
    </div>
  );
}
