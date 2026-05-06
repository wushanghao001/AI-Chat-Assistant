import { useState, useEffect, useRef, type MouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message } from '../types';
import type { User } from '../types/user';
import { zhiPuAI, AVAILABLE_MODELS, type ModelId } from '../api';

interface Conversation {
  id: string;
  title: string;
  timestamp: number;
  model: ModelId;
  pinned?: boolean;
  customTitle?: boolean;
}

interface ChatInterfaceProps {
  user: User;
  onLogout: () => void;
}

export function ChatInterface({ user, onLogout }: ChatInterfaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string>('');
  // 使用 Map 存储多个会话的消息
  const [messagesMap, setMessagesMap] = useState<Map<string, Message[]>>(new Map());
  // 使用 Map 存储每个会话的加载状态
  const [loadingMap, setLoadingMap] = useState<Map<string, boolean>>(new Map());
  
  // 获取当前会话的消息
  const messages = messagesMap.get(currentConversationId) || [];
  // 获取当前会话的加载状态
  const isLoading = loadingMap.get(currentConversationId) || false;
  const [input, setInput] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>('glm-4');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    conversationId: string;
  }>({ visible: false, x: 0, y: 0, conversationId: '' });
  const [renameInput, setRenameInput] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
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

  // 加载所有会话的消息到 Map 中
  useEffect(() => {
    if (currentConversationId) {
      // 检查 Map 中是否已有该会话的消息
      if (messagesMap.has(currentConversationId)) {
        // Map 中已有，直接使用
      } else {
        // 从 localStorage 加载
        const savedMessages = localStorage.getItem(`messages_${currentConversationId}`);
        if (savedMessages) {
          try {
            const parsedMessages = JSON.parse(savedMessages);
            setMessagesMap(prev => new Map(prev).set(currentConversationId, parsedMessages));
          } catch (e) {
            console.error('Failed to load messages:', e);
          }
        } else {
          // 如果没有保存的消息，初始化为空数组
          setMessagesMap(prev => new Map(prev).set(currentConversationId, []));
        }
      }
      // 加载对话使用的模型
      const conversation = conversations.find(c => c.id === currentConversationId);
      if (conversation) {
        setSelectedModel(conversation.model);
      }
    }
  }, [currentConversationId, conversations]);

  // 保存对话列表
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  // 保存消息到 localStorage
  useEffect(() => {
    messagesMap.forEach((msgs, id) => {
      if (msgs.length > 0) {
        localStorage.setItem(`messages_${id}`, JSON.stringify(msgs));
      }
    });
  }, [messagesMap]);

  // 滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 创建新对话
  const createNewConversation = (clearMessages: boolean = true): string => {
    const newId = Date.now().toString();
    const newConversation: Conversation = {
      id: newId,
      title: '新对话',
      timestamp: Date.now(),
      model: selectedModel,
    };
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversationId(newId);
    // 点击新建对话按钮时初始化空消息列表
    if (clearMessages) {
      setMessagesMap(prev => new Map(prev).set(newId, []));
    }
    setError(null);
    return newId;
  };

  // 选择对话
  const selectConversation = (id: string) => {
    setCurrentConversationId(id);
    setError(null);
  };

  // 删除对话
  const deleteConversation = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm('确定要删除这个对话吗？')) {
      setConversations(prev => prev.filter(c => c.id !== id));
      localStorage.removeItem(`messages_${id}`);
      setMessagesMap(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });
      if (currentConversationId === id) {
        setCurrentConversationId('');
      }
    }
    setContextMenu({ visible: false, x: 0, y: 0, conversationId: '' });
  };

  // 置顶对话
  const pinConversation = (id: string) => {
    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, pinned: true } : c))
    );
    setContextMenu({ visible: false, x: 0, y: 0, conversationId: '' });
  };

  // 取消置顶
  const unpinConversation = (id: string) => {
    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, pinned: false } : c))
    );
    setContextMenu({ visible: false, x: 0, y: 0, conversationId: '' });
  };

  // 开始重命名
  const startRename = (id: string) => {
    const conversation = conversations.find(c => c.id === id);
    if (conversation) {
      setRenameInput(conversation.title);
      setRenamingId(id);
    }
    setContextMenu({ visible: false, x: 0, y: 0, conversationId: '' });
  };

  // 完成重命名
  const finishRename = (id: string) => {
    if (renameInput.trim()) {
      setConversations(prev =>
        prev.map(c => (c.id === id ? { ...c, title: renameInput.trim(), customTitle: true } : c))
      );
    }
    setRenamingId(null);
    setRenameInput('');
  };

  // 清空所有对话
  const clearAllConversations = () => {
    if (confirm('确定要清空所有对话吗？此操作不可恢复。')) {
      // 清空所有对话
      setConversations([]);
      setCurrentConversationId('');
      setMessagesMap(new Map());
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
  const handleSend = async () => {
    const content = input.trim();
    if (!content || isLoading) return;

    // 如果没有当前对话，创建一个新对话并获取新ID
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = createNewConversation(false);
    }

    const userMessage: Message = {
      role: 'user',
      content: content,
      timestamp: Date.now(),
    };

    // 设置当前会话为加载状态
    setLoadingMap(prev => new Map(prev).set(conversationId, true));
    setIsPaused(false);
    setError(null);

    try {
      // 获取当前日期
      const currentDate = new Date();
      const dateString = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日`;
      
      // 获取当前会话的消息用于构建历史
      let currentMessages = messagesMap.get(conversationId) || [];
      
      // 检查最后一条消息是否是助手消息（可能是暂停后留下的）
      const lastMessage = currentMessages[currentMessages.length - 1];
      const hasIncompleteAssistant = lastMessage && lastMessage.role === 'assistant';
      
      // 构建消息历史
      let messageHistory;
      if (hasIncompleteAssistant) {
        // 如果最后一条是助手消息，替换它（修改后重新发送的情况）
        // 移除最后一条助手消息，使用修改后的用户消息
        messageHistory = currentMessages.slice(0, -1).map(msg => ({
          role: msg.role,
          content: msg.content,
        })).concat([{
          role: 'user',
          content: userMessage.content,
        }]);
      } else {
        // 正常情况：添加新消息
        messageHistory = currentMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })).concat([{
          role: 'user',
          content: userMessage.content,
        }]);
      }
      
      // 先添加用户消息到消息列表
      setMessagesMap(prev => {
        const newMap = new Map(prev);
        let currentMsgs = newMap.get(conversationId) || [];
        if (hasIncompleteAssistant) {
          // 移除不完整的助手消息，添加新的用户消息
          currentMsgs = [...currentMsgs.slice(0, -1), userMessage];
        } else {
          // 添加新消息
          currentMsgs = [...currentMsgs, userMessage];
        }
        newMap.set(conversationId, currentMsgs);
        return newMap;
      });
      setInput('');
      
      // 在第一条用户消息前添加日期提示
      if (messageHistory.length > 0 && messageHistory[0].role === 'user') {
        messageHistory[0] = {
          role: 'user' as const,
          content: `当前日期是${dateString}。\n\n${messageHistory[0].content}`
        };
      }

      // 创建助手消息占位符
      let assistantMessage: Message = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      // 添加助手消息占位符到对应会话
      setMessagesMap(prev => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(conversationId) || [];
        newMap.set(conversationId, [...currentMessages, assistantMessage]);
        return newMap;
      });

      // 3. 调用 API 获取 AI 回答，使用流式输出
      
      // 创建 AbortController 用于中止请求
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      // 保存发送消息时的会话ID，用于在流式回调中更新对应会话的消息
      const sendingConversationId = conversationId;
      
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
              setMessagesMap(prev => {
                const newMap = new Map(prev);
                const currentMessages = newMap.get(sendingConversationId) || [];
                newMap.set(sendingConversationId, currentMessages.slice(0, -1));
                return newMap;
              });
              return;
            }
            
            // 提取流式数据中的内容
            let delta = '';
            const chunkAny = chunk as any;
            
            console.log('=== 流式数据解析 ===');
            console.log('原始chunk:', JSON.stringify(chunk, null, 2));
            console.log('chunk.choices:', chunk.choices);
            
            // 尝试多种方式提取内容，适配不同的 API 响应格式
            if (chunk.choices && chunk.choices.length > 0) {
              delta = chunk.choices[0]?.delta?.content || '';
              console.log('方式1 - delta:', delta);
            }
            if (!delta && chunkAny.choices && chunkAny.choices.length > 0) {
              delta = chunkAny.choices[0]?.message?.content || '';
              console.log('方式2 - message.content:', delta);
            }
            if (!delta) {
              delta = chunkAny.content || chunkAny.text || chunkAny.response || '';
              console.log('方式3 - 其他字段:', delta);
            }
            
            console.log('最终delta:', delta);
            
            if (delta) {
              // 4. 逐字显示 AI 的回答，更新发送消息时的会话
              setMessagesMap(prev => {
                const newMap = new Map(prev);
                const currentMessages = newMap.get(sendingConversationId) || [];
                const newMessages = [...currentMessages];
                let lastIndex = newMessages.length - 1;
                let lastMessage = newMessages[lastIndex];
                
                // 如果消息列表为空或最后一条消息不是助手消息，创建助手消息占位符
                if (!lastMessage || lastMessage.role !== 'assistant') {
                  const assistantMessage = {
                    role: 'assistant' as const,
                    content: '',
                    timestamp: Date.now(),
                  };
                  newMessages.push(assistantMessage);
                  lastIndex = newMessages.length - 1;
                  lastMessage = assistantMessage;
                }
                
                // 更新助手消息内容
                const updatedMessage = {
                  ...lastMessage,
                  content: lastMessage.content + delta
                };
                newMessages[lastIndex] = updatedMessage;
                newMap.set(sendingConversationId, newMessages);
                return newMap;
              });
            }
          },
          0.7,
          selectedModel,
          abortController.signal
        );
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('API 调用失败:', e);
          const errorMessage = e instanceof Error ? e.message : '发送消息失败，请重试';
          setError(`API 调用失败: ${errorMessage}\n\n可能的原因：\n1. API Key 无效或已过期\n2. 网络连接问题\n3. 智谱 AI 服务暂时不可用\n\n请检查 API Key 是否正确，或者稍后再试。`);
          // 移除正在加载的助手消息
          setMessagesMap(prev => {
            const newMap = new Map(prev);
            const currentMessages = newMap.get(sendingConversationId) || [];
            newMap.set(sendingConversationId, currentMessages.slice(0, -1));
            return newMap;
          });
        }
      }

      // 更新对话标题（如果是第一条消息且用户没有自定义标题）
      if (messages.length === 0) {
        setConversations(prev =>
          prev.map(c => {
            if (c.id === conversationId) {
              // 只有当用户没有自定义标题时才自动更新标题
              if (!c.customTitle) {
                const contentStr = String(userMessage.content);
                return { 
                  ...c, 
                  title: contentStr.slice(0, 20) + (contentStr.length > 20 ? '...' : ''), 
                  model: selectedModel 
                };
              }
              // 用户已自定义标题，只更新模型
              return { ...c, model: selectedModel };
            }
            return c;
          })
        );
      }
    } catch (e) {
      console.error('发送消息失败:', e);
      setError(e instanceof Error ? e.message : '发送消息失败，请重试');
      // 移除正在加载的助手消息
      setMessagesMap(prev => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(conversationId) || [];
        newMap.set(conversationId, currentMessages.slice(0, -1));
        return newMap;
      });
    } finally {
      // 清除发送消息会话的加载状态
      setLoadingMap(prev => new Map(prev).set(conversationId, false));
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
    // 清除当前会话的加载状态
    if (currentConversationId) {
      setLoadingMap(prev => new Map(prev).set(currentConversationId, false));
    }
  };

  // 开始修改消息
  const handleEditMessage = (message: Message) => {
    if (isLoading) {
      handlePause();
    }
    setInput(message.content);
    // 移除消息和对应的助手回复
    setMessagesMap(prev => {
      const newMap = new Map(prev);
      const currentMessages = newMap.get(currentConversationId) || [];
      const index = currentMessages.indexOf(message);
      if (index !== -1) {
        // 如果消息后面有助手回复，也一起移除
        const newMessages = [...currentMessages];
        if (index + 1 < newMessages.length && newMessages[index + 1].role === 'assistant') {
          newMessages.splice(index, 2);
        } else {
          newMessages.splice(index, 1);
        }
        newMap.set(currentConversationId, newMessages);
      }
      return newMap;
    });
  };

  // 分组对话
  const groupedConversations = () => {
    const groups: { [key: string]: Conversation[] } = {
      '置顶': [],
      '今天': [],
      '昨天': [],
      '过去7天': [],
      '更早': [],
    };

    conversations.forEach(conv => {
      // 置顶的会话放在置顶分组
      if (conv.pinned) {
        groups['置顶'].push(conv);
        return;
      }

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

  // 获取当前选中模型的名称
  const currentModelName = AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name || 'GLM-4';

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* 左侧边栏 */}
      <div className={`${sidebarCollapsed ? 'w-10' : 'w-64'} bg-gray-50 border-r border-gray-200 flex flex-col flex-shrink-0 transition-all duration-200`}>
        {/* 头部区域 */}
        <div className={`${sidebarCollapsed ? 'flex justify-center pt-2' : 'flex items-center justify-between px-3 py-3 border-b border-gray-200'}`}>
          {/* 展开时显示标题 */}
          {!sidebarCollapsed && (
            <span className="text-sm font-medium text-gray-700">会话列表</span>
          )}
          
          {/* 折叠/展开按钮 */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`${sidebarCollapsed ? 'w-8 h-8' : 'w-8 h-8'} p-2 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-lg shadow-sm transition-all flex-shrink-0 flex items-center justify-center`}
            title={sidebarCollapsed ? '展开' : '收起'}
          >
            {sidebarCollapsed ? (
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* 展开时显示的内容 */}
        {!sidebarCollapsed && (
          <>

            {/* 新建对话和清空对话按钮 */}
            <div className="p-4 space-y-3">
              <button
                onClick={() => createNewConversation()}
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
                {convs.map(conv => {
                  const model = AVAILABLE_MODELS.find(m => m.id === conv.model);
                  return (
                    <div
                      key={conv.id}
                      onClick={() => selectConversation(conv.id)}
                      className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-sm mb-1 ${
                        currentConversationId === conv.id
                          ? 'bg-gray-200 text-gray-900'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex-1 truncate">
                        {renamingId === conv.id ? (
                          <input
                            type="text"
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') finishRename(conv.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onBlur={() => finishRename(conv.id)}
                            className={`w-full bg-transparent border-none outline-none text-sm truncate ${
                              currentConversationId === conv.id ? 'text-gray-900' : 'text-gray-700'
                            }`}
                            autoFocus
                          />
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{conv.title}</span>
                              {conv.pinned && (
                                <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded flex-shrink-0">置顶</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">{model?.name}</span>
                          </>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenu({
                            visible: true,
                            x: e.clientX,
                            y: e.clientY,
                            conversationId: conv.id
                          });
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-300 rounded transition-opacity"
                      >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ))}
            </div>

            {/* 底部用户信息 */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center text-white text-sm font-medium">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    user.username.charAt(0)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700 font-medium truncate">{user.username}</span>
                </div>
                <div className="cursor-pointer hover:text-gray-600 transition-colors" onClick={() => setShowLogoutConfirm(true)} title="退出">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 退出确认对话框 */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="p-6">
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900">确认退出</h3>
                <p className="text-sm text-gray-500 mt-2">
                  退出登录不会丢失任何数据，你仍可以登录此账号。
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    onLogout();
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  确认退出
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 上下文菜单 */}
      {contextMenu.visible && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu({ visible: false, x: 0, y: 0, conversationId: '' })}
          />
          <div
            className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[120px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {(() => {
              const conv = conversations.find(c => c.id === contextMenu.conversationId);
              if (conv?.pinned) {
                return (
                  <button
                    onClick={() => unpinConversation(contextMenu.conversationId)}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    取消置顶
                  </button>
                );
              }
              return (
                <button
                  onClick={() => pinConversation(contextMenu.conversationId)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  置顶
                </button>
              );
            })()}
            <button
              onClick={() => startRename(contextMenu.conversationId)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              重命名
            </button>
            <hr className="my-1 border-gray-200" />
            <button
              onClick={() => deleteConversation(contextMenu.conversationId)}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              删除
            </button>
          </div>
        </>
      )}

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部标题栏 */}
        <div className="h-14 border-b border-gray-200 flex items-center justify-center px-6 flex-shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>{currentModelName}</span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* 模型选择下拉菜单 */}
            {showModelDropdown && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                {AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                      selectedModel === model.id ? 'bg-gray-50 text-gray-900' : 'text-gray-700'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{model.name}</div>
                      <div className="text-xs text-gray-500">{model.description}</div>
                    </div>
                    {selectedModel === model.id && (
                      <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
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
                      user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.username}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {user.username.charAt(0)}
                        </div>
                      )
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
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <span>思考中</span>
                      <span className="flex gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 暂停状态 */}
              {isPaused && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                    AI
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-500 text-sm">
                      <span className="inline-block px-2 py-1 bg-yellow-50 text-yellow-700 rounded text-xs mr-2">已暂停</span>
                      可以修改问题后重新发送
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="max-w-3xl mx-auto mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="text-sm whitespace-pre-line">{error}</div>
              </div>
            </div>
          )}
        </div>

        {/* 底部输入区域 */}
        <div className="p-4 border-t border-gray-200 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            {/* 暂停思考按钮（固定在输入框上方） */}
            {isLoading && (
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </span>
                  <span>AI 正在思考...</span>
                </div>
                <button
                  onClick={handlePause}
                  className="text-sm text-red-500 hover:text-red-700 transition-colors px-3 py-1 bg-red-50 rounded-lg flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  暂停思考
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={isLoading}
                  placeholder={isLoading ? 'AI 正在思考...' : '给 AI 发消息...'}
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  rows={2}
                />
                <div className="absolute right-3 bottom-3 text-xs text-gray-400">
                  Shift + Enter 换行
                </div>
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                发送
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}