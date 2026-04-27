import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message } from '../types';
import { zhiPuAI } from '../api';

interface Conversation {
  id: string;
  title: string;
  timestamp: number;
}

export function ChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef<boolean>(false);

  // 从 LocalStorage 加载对话列表和当前对话
  useEffect(() => {
    const savedConversations = localStorage.getItem('conversations');
    if (savedConversations) {
      try {
        setConversations(JSON.parse(savedConversations));
      } catch (e) {
        console.error('Failed to load conversations:', e);
      }
    }
  }, []);

  // 同步 isPaused 状态到 isPausedRef
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // 加载当前对话的消息
  useEffect(() => {
    if (currentConversationId) {
      const savedMessages = localStorage.getItem(`messages_${currentConversationId}`);
      if (savedMessages) {
        try {
          setMessages(JSON.parse(savedMessages));
        } catch (e) {
          console.error('Failed to load messages:', e);
        }
      } else {
        setMessages([]);
      }
    }
  }, [currentConversationId]);

  // 保存对话列表
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  // 保存当前对话的消息
  useEffect(() => {
    if (currentConversationId && messages.length > 0) {
      localStorage.setItem(`messages_${currentConversationId}`, JSON.stringify(messages));
    }
  }, [currentConversationId, messages]);

  // 滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 创建新对话
  const createNewConversation = () => {
    const newId = Date.now().toString();
    const newConversation: Conversation = {
      id: newId,
      title: '新对话',
      timestamp: Date.now(),
    };
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversationId(newId);
    setMessages([]);
    setError(null);
  };

  // 选择对话
  const selectConversation = (id: string) => {
    setCurrentConversationId(id);
    setError(null);
  };

  // 删除对话
  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这个对话吗？')) {
      setConversations(prev => prev.filter(c => c.id !== id));
      localStorage.removeItem(`messages_${id}`);
      if (currentConversationId === id) {
        setCurrentConversationId('');
        setMessages([]);
      }
    }
  };

  // 清空所有对话
  const clearAllConversations = () => {
    if (confirm('确定要清空所有对话吗？此操作不可恢复。')) {
      // 清空所有对话
      setConversations([]);
      setCurrentConversationId('');
      setMessages([]);
      setError(null);
      
      // 从 LocalStorage 中删除所有对话相关的存储
      localStorage.removeItem('conversations');
      
      // 删除所有消息存储
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('messages_')) {
          localStorage.removeItem(key);
        }
      }
    }
  };

  // 发送消息
  const handleSend = async (messageContent?: string) => {
    const content = messageContent || input.trim();
    if (!content || isLoading) return;

    // 如果没有当前对话，创建一个新对话
    if (!currentConversationId) {
      createNewConversation();
    }

    const userMessage: Message = {
      role: 'user',
      content: content,
      timestamp: Date.now(),
    };

    // 1. 用户输入消息后，添加到消息列表
    if (!messageContent) { // 只有当不是修改后重新发送时才添加新消息
      setMessages(prev => [...prev, userMessage]);
      setInput('');
    }
    setIsLoading(true);
    setIsPaused(false);
    setError(null);
    setEditingMessage(null);

    try {
      // 2. 构建消息历史（包含历史消息，实现多轮对话）
      let messageHistory;
      if (messageContent) {
        // 如果是修改后重新发送，使用修改后的消息替换原来的消息
        messageHistory = messages.slice(0, -1).map(msg => ({
          role: msg.role,
          content: msg.content,
        })).concat([{
          role: 'user',
          content: userMessage.content,
        }]);
      } else {
        // 如果是新消息，直接添加到历史记录
        messageHistory = messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })).concat([{
          role: 'user',
          content: userMessage.content,
        }]);
      }

      // 创建助手消息占位符
      let assistantMessage: Message = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // 3. 调用 API 获取 AI 回答，使用流式输出
      console.log('调用 API，消息历史:', messageHistory);
      
      // 创建 AbortController 用于中止请求
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      try {
        // 尝试使用流式输出
        await zhiPuAI.chatStream(
          messageHistory,
          (chunk) => {
            // 检查是否暂停，使用 ref 来获取最新状态
            if (isPausedRef.current) return; // 如果暂停，不处理数据
            
            console.log('收到流式数据块:', chunk);
            
            // 检查 chunk 是否包含错误信息
            if (chunk.code === 500 || chunk.success === false) {
              console.error('API 调用失败:', chunk.msg || '未知错误');
              setError(chunk.msg || '发送消息失败，请重试');
              // 移除正在加载的助手消息
              setMessages(prev => prev.slice(0, -1));
              return;
            }
            
            const delta = chunk.choices?.[0]?.delta?.content || '';
            console.log('解析出的内容:', delta);
            if (delta) {
              // 4. 逐字显示 AI 的回答
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  // 避免重复添加相同的内容
                  // 1. 检查是否已经包含相同的内容
                  if (!lastMessage.content.includes(delta)) {
                    // 2. 检查是否是重复的短语（如"中关村中关村"）
                    const newContent = lastMessage.content + delta;
                    const words = newContent.split(' ');
                    const hasDuplicateWords = words.some((word, index) => {
                      return index > 0 && word === words[index - 1];
                    });
                    
                    if (!hasDuplicateWords) {
                      lastMessage.content += delta;
                      console.log('更新后的助手消息:', lastMessage.content);
                    }
                  }
                }
                return newMessages;
              });
            }
          },
          0.7,
          abortController.signal
        );
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('API 调用失败:', e);
          const errorMessage = e instanceof Error ? e.message : '发送消息失败，请重试';
          setError(`API 调用失败: ${errorMessage}\n\n可能的原因：\n1. API Key 无效或已过期\n2. 网络连接问题\n3. 智谱 AI 服务暂时不可用\n\n请检查 API Key 是否正确，或者稍后再试。`);
          // 移除正在加载的助手消息
          setMessages(prev => prev.slice(0, -1));
        }
      }

      // 更新对话标题（如果是第一条消息）
      if (messages.length === 0) {
        const contentStr = String(userMessage.content);
        setConversations(prev =>
          prev.map(c =>
            c.id === currentConversationId
              ? { ...c, title: contentStr.slice(0, 20) + (contentStr.length > 20 ? '...' : '') }
              : c
          )
        );
      }
    } catch (e) {
      console.error('发送消息失败:', e);
      setError(e instanceof Error ? e.message : '发送消息失败，请重试');
      // 移除正在加载的助手消息
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // 暂停思考
  const handlePause = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPaused(true);
    setIsLoading(false);
  };

  // 开始修改消息
  const handleEditMessage = (message: Message) => {
    if (isLoading) {
      handlePause();
    }
    setEditingMessage(message.content);
    setInput(message.content);
    // 移除消息和对应的助手回复
    setMessages(prev => {
      const index = prev.indexOf(message);
      if (index !== -1) {
        // 如果消息后面有助手回复，也一起移除
        const newMessages = [...prev];
        if (index + 1 < newMessages.length && newMessages[index + 1].role === 'assistant') {
          newMessages.splice(index, 2);
        } else {
          newMessages.splice(index, 1);
        }
        return newMessages;
      }
      return prev;
    });
  };

  // 分组对话
  const groupedConversations = () => {
    const groups: { [key: string]: Conversation[] } = {
      '今天': [],
      '昨天': [],
      '过去7天': [],
      '更早': [],
    };

    conversations.forEach(conv => {
      const now = Date.now();
      const diff = now - conv.timestamp;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) {
        groups['今天'].push(conv);
      } else if (days === 1) {
        groups['昨天'].push(conv);
      } else if (days < 7) {
        groups['过去7天'].push(conv);
      } else {
        groups['更早'].push(conv);
      }
    });

    return groups;
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* 左侧边栏 */}
      <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* 新建对话和清空对话按钮 */}
        <div className="p-4 space-y-3">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 shadow-sm"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建对话
          </button>
          <button
            onClick={clearAllConversations}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 shadow-sm"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            清空对话
          </button>
        </div>

        {/* 对话列表 */}
        <div className="flex-1 overflow-y-auto px-3">
          {Object.entries(groupedConversations()).map(([groupName, convs]) => (
            convs.length > 0 && (
              <div key={groupName} className="mb-4">
                <div className="px-3 py-2 text-xs text-gray-400 font-medium">{groupName}</div>
                {convs.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => selectConversation(conv.id)}
                    className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-sm mb-1 ${
                      currentConversationId === conv.id
                        ? 'bg-gray-200 text-gray-900'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="truncate flex-1">{conv.title}</span>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-300 rounded transition-opacity"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )
          ))}
        </div>

        {/* 底部用户信息 */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center text-white text-sm font-medium">
              吴
            </div>
            <span className="text-sm text-gray-700 font-medium">吴尚浩</span>
          </div>
        </div>
      </div>

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部标题栏 */}
        <div className="h-14 border-b border-gray-200 flex items-center justify-center px-6 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
            <span>CodeMaster-V4</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-lg mb-2">开始一个新的对话</p>
                <p className="text-sm">输入问题，与 AI 助手交流</p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message, index) => (
                <div key={index} className="flex gap-4">
                  {/* 头像 */}
                  <div className="flex-shrink-0">
                    {message.role === 'user' ? (
                      <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        吴
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        AI
                      </div>
                    )}
                  </div>

                  {/* 消息内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {message.role === 'user' ? '吴尚浩' : 'AI'}
                      </span>
                      {message.role === 'user' && (
                        <button
                          onClick={() => handleEditMessage(message)}
                          className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          修改
                        </button>
                      )}
                    </div>
                    <div className="text-gray-800 leading-relaxed text-[15px]">
                      <ReactMarkdown
                        components={{
                          code: ({ className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '');
                            return match ? (
                              <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className="bg-pink-50 px-1.5 py-0.5 rounded text-sm text-pink-600 font-mono" {...props}>
                                {children}
                              </code>
                            );
                          },
                          h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
                          p: ({ children }) => <p className="mb-2">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}

              {/* 加载状态 - 思考中... */}
              {isLoading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                    AI
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">AI</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                      <span>思考中...</span>
                      <button
                        onClick={handlePause}
                        className="text-xs text-blue-500 hover:text-blue-700 transition-colors ml-2"
                      >
                        暂停思考
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 错误提示 */}
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg">
                  {error}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* 底部输入区域 */}
        <div className="border-t border-gray-200 p-4 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                disabled={isLoading}
                placeholder={isLoading ? "思考中..." : "给 AI 发送消息..."}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">
              AI 生成的内容可能不准确，请核实重要信息。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}