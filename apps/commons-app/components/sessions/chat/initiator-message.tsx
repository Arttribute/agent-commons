interface InitiatorMessageProps {
  message: string;
  timestamp: string;
}

export default function InitiatorMessage({ message }: InitiatorMessageProps) {
  return (
    <div className="flex justify-end my-3">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5">
        <p className="text-sm text-white leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
