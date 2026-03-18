/**
 * Lightweight stub for LangChain provider packages.
 * Prevents Jest from loading heavy native binaries during unit tests.
 */

class MockChatModel {
  invoke = jest.fn().mockResolvedValue({ content: '' });
  stream = jest.fn().mockReturnValue({ [Symbol.asyncIterator]: jest.fn() });
  bind = jest.fn().mockReturnThis();
  pipe = jest.fn().mockReturnThis();
  withStructuredOutput = jest.fn().mockReturnThis();
}

export const ChatOpenAI           = MockChatModel;
export const ChatAnthropic        = MockChatModel;
export const ChatGoogleGenerativeAI = MockChatModel;
export const ChatGroq             = MockChatModel;
export const ChatOllama           = MockChatModel;
